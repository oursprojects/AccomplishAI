import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import {
  ALLOWED_STT_MODELS,
  ALLOWED_TEXT_MODELS,
  getManilaDayStartIso,
  isAdminEmail,
  loadAdminDashboardData,
} from "@/lib/admin";
import { getGroqPoolSnapshot } from "@/lib/ai/rate-limiter";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

const textModelIds = ALLOWED_TEXT_MODELS.map((m) => m.id) as [string, ...string[]];
const sttModelIds = ALLOWED_STT_MODELS.map((m) => m.id) as [string, ...string[]];

const createMemberSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters.").max(128),
  customDailyLimit: z.coerce.number().int().min(0).max(1000).nullable().optional(),
  customMaxReports: z.coerce.number().int().min(1).max(10000).nullable().optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_default_limit"),
    defaultDailyLimit: z.coerce.number().int().min(0).max(1000),
    defaultMaxReports: z.coerce.number().int().min(1).max(10000).nullable().optional(),
  }),
  z.object({
    action: z.literal("update_ai_settings"),
    activeTextModel: z.enum(textModelIds),
    activeSttModel: z.enum(sttModelIds),
    maxBulletsPerDay: z.coerce.number().int().min(1).max(5),
    maxChatMessages: z.coerce.number().int().min(4).max(60),
    globalRpmLimit: z.coerce.number().int().min(10).max(300),
  }),
  z.object({
    action: z.literal("update_member"),
    userId: z.string().uuid(),
    customDailyLimit: z.coerce.number().int().min(0).max(1000).nullable(),
    customMaxReports: z.coerce.number().int().min(1).max(10000).nullable().optional(),
    isBlocked: z.boolean(),
  }),
  z.object({
    action: z.literal("reset_today"),
    userId: z.string().uuid(),
  }),
]);

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = await loadAdminDashboardData(supabase);
    return NextResponse.json({
      ...data,
      poolStatus: getGroqPoolSnapshot(ALLOWED_TEXT_MODELS.map((m) => m.id)),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load admin data." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid account details." }, { status: 400 });
  }

  const { email, password, customDailyLimit, customMaxReports } = parsed.data;

  try {
    let createdUserId: string | null = null;
    let needsConfirmWarning = false;

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      const adminClient = createSupabaseClient<Database>(publicEnv.supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) return NextResponse.json({ error: createErr.message }, { status: 400 });
      createdUserId = created.user?.id ?? null;
    } else {
      // Stateless anon client so admin's own session cookies are untouched
      const anonClient = createSupabaseClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: signed, error: signErr } = await anonClient.auth.signUp({ email, password });
      if (signErr) return NextResponse.json({ error: signErr.message }, { status: 400 });
      createdUserId = signed.user?.id ?? null;
      needsConfirmWarning = !signed.session;
    }

    if (createdUserId) {
      await supabase
        .from("user_quotas")
        .upsert(
          {
            user_id: createdUserId,
            email,
            custom_daily_limit: customDailyLimit ?? null,
            custom_max_reports: customMaxReports ?? null,
          },
          { onConflict: "user_id" },
        );
    }

    const data = await loadAdminDashboardData(supabase);
    return NextResponse.json({ ...data, needsConfirmWarning }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create intern account." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload." }, { status: 400 });
  }

  try {
    const body = parsed.data;
    if (body.action === "update_default_limit") {
      const { error } = await supabase
        .from("admin_settings")
        .upsert(
          {
            id: 1,
            default_daily_prompt_limit: body.defaultDailyLimit,
            default_max_reports: body.defaultMaxReports ?? null,
          },
          { onConflict: "id" },
        );
      if (error) throw new Error(error.message);
    } else if (body.action === "update_ai_settings") {
      const { error } = await supabase
        .from("admin_settings")
        .upsert(
          {
            id: 1,
            active_text_model: body.activeTextModel,
            active_stt_model: body.activeSttModel,
            max_bullets_per_day: body.maxBulletsPerDay,
            max_chat_messages: body.maxChatMessages,
            global_rpm_limit: body.globalRpmLimit,
          },
          { onConflict: "id" },
        );
      if (error) throw new Error(error.message);
    } else if (body.action === "update_member") {
      const { error } = await supabase
        .from("user_quotas")
        .update({
          custom_daily_limit: body.customDailyLimit,
          custom_max_reports: body.customMaxReports ?? null,
          is_blocked: body.isBlocked,
        })
        .eq("user_id", body.userId);
      if (error) throw new Error(error.message);
    } else if (body.action === "reset_today") {
      const { error } = await supabase
        .from("prompt_usage_logs")
        .delete()
        .eq("user_id", body.userId)
        .gte("created_at", getManilaDayStartIso());
      if (error) throw new Error(error.message);
    }

    const data = await loadAdminDashboardData(supabase);
    return NextResponse.json({
      ...data,
      poolStatus: getGroqPoolSnapshot(ALLOWED_TEXT_MODELS.map((m) => m.id)),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed." },
      { status: 500 },
    );
  }
}
