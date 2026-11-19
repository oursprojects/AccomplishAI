import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { getManilaDayStartIso, isAdminEmail } from "@/lib/admin";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export interface AdminMember {
  userId: string;
  email: string;
  nameLastFirst: string;
  office: string;
  customDailyLimit: number | null;
  effectiveDailyLimit: number;
  isBlocked: boolean;
  isAdmin: boolean;
  usedToday: number;
  usedTotal: number;
  reportsCount: number;
  createdAt: string;
}

const createMemberSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters.").max(128),
  customDailyLimit: z.coerce.number().int().min(0).max(1000).nullable().optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_default_limit"),
    defaultDailyLimit: z.coerce.number().int().min(0).max(1000),
  }),
  z.object({
    action: z.literal("update_member"),
    userId: z.string().uuid(),
    customDailyLimit: z.coerce.number().int().min(0).max(1000).nullable(),
    isBlocked: z.boolean(),
  }),
  z.object({
    action: z.literal("reset_today"),
    userId: z.string().uuid(),
  }),
]);

async function loadAdminData(supabase: Awaited<ReturnType<typeof getUser>>["supabase"]) {
  const dayStart = getManilaDayStartIso();

  const [
    { data: settings },
    { data: quotas, error: qErr },
    { data: profiles },
    { data: logs },
    { data: reports },
  ] = await Promise.all([
    supabase.from("admin_settings").select("default_daily_prompt_limit").eq("id", 1).maybeSingle(),
    supabase
      .from("user_quotas")
      .select("user_id, email, custom_daily_limit, is_blocked, created_at")
      .order("created_at", { ascending: true }),
    supabase.from("profiles").select("id, name_last_first, office"),
    supabase.from("prompt_usage_logs").select("user_id, created_at"),
    supabase.from("reports").select("user_id"),
  ]);

  if (qErr) throw new Error(qErr.message);

  const defaultDailyLimit = settings?.default_daily_prompt_limit ?? 15;
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const todayMap = new Map<string, number>();
  const totalMap = new Map<string, number>();
  for (const log of logs ?? []) {
    totalMap.set(log.user_id, (totalMap.get(log.user_id) ?? 0) + 1);
    if (log.created_at >= dayStart) {
      todayMap.set(log.user_id, (todayMap.get(log.user_id) ?? 0) + 1);
    }
  }

  const reportMap = new Map<string, number>();
  for (const r of reports ?? []) {
    reportMap.set(r.user_id, (reportMap.get(r.user_id) ?? 0) + 1);
  }

  const members: AdminMember[] = (quotas ?? []).map((q) => {
    const p = profileMap.get(q.user_id);
    const admin = isAdminEmail(q.email);
    return {
      userId: q.user_id,
      email: q.email,
      nameLastFirst: p?.name_last_first ?? "",
      office: p?.office ?? "YML",
      customDailyLimit: q.custom_daily_limit,
      effectiveDailyLimit: q.custom_daily_limit ?? defaultDailyLimit,
      isBlocked: !admin && q.is_blocked,
      isAdmin: admin,
      usedToday: todayMap.get(q.user_id) ?? 0,
      usedTotal: totalMap.get(q.user_id) ?? 0,
      reportsCount: reportMap.get(q.user_id) ?? 0,
      createdAt: q.created_at,
    };
  });

  return { defaultDailyLimit, members };
}

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = await loadAdminData(supabase);
    return NextResponse.json(data);
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

  const { email, password, customDailyLimit } = parsed.data;

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
          },
          { onConflict: "user_id" },
        );
    }

    const data = await loadAdminData(supabase);
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
        .upsert({ id: 1, default_daily_prompt_limit: body.defaultDailyLimit }, { onConflict: "id" });
      if (error) throw new Error(error.message);
    } else if (body.action === "update_member") {
      const { error } = await supabase
        .from("user_quotas")
        .update({
          custom_daily_limit: body.customDailyLimit,
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

    const data = await loadAdminData(supabase);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update settings." },
      { status: 500 },
    );
  }
}
