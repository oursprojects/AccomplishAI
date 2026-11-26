import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { jsonError, parseJsonBody, safeServerError } from "@/lib/api-utils";
import { getUser } from "@/lib/supabase/server";
import {
  ALLOWED_STT_MODELS,
  ALLOWED_TEXT_MODELS,
  getManilaDayStartIso,
  isAdminUser,
  loadAdminDashboardData,
} from "@/lib/admin";
import { getGroqPoolSnapshot } from "@/lib/ai/rate-limiter";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

const textModelIds = ALLOWED_TEXT_MODELS.map((m) => m.id) as [string, ...string[]];
const sttModelIds = ALLOWED_STT_MODELS.map((m) => m.id) as [string, ...string[]];

const optionalIsoDate = z
  .union([
    z.literal(""),
    z.null(),
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD date format."),
  ])
  .optional()
  .transform((v) => (v ? v : null));

const createMemberSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters.").max(128),
  customDailyLimit: z.coerce.number().int().min(0).max(1000).nullable().optional(),
  customMaxReports: z.coerce.number().int().min(1).max(10000).nullable().optional(),
  nameLastFirst: z.string().trim().max(120).optional(),
  nameFirstLast: z.string().trim().max(120).optional(),
  office: z.string().trim().max(80).optional(),
  defaultVerifier: z.string().trim().max(120).optional(),
  defaultDailyHours: z.coerce.number().min(0).max(24).nullable().optional(),
  targetOjtHours: z.coerce.number().int().min(40).max(5000).nullable().optional(),
  internshipStartDate: optionalIsoDate,
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
  if (!user) return jsonError(401, "Unauthorized");
  if (!isAdminUser(user)) return jsonError(403, "Forbidden");

  try {
    const data = await loadAdminDashboardData(supabase);
    return NextResponse.json({
      ...data,
      poolStatus: getGroqPoolSnapshot(ALLOWED_TEXT_MODELS.map((m) => m.id)),
    });
  } catch (err) {
    return safeServerError("api/admin/users GET", err, "Failed to load admin data.");
  }
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");
  if (!isAdminUser(user)) return jsonError(403, "Forbidden");

  const body = await parseJsonBody(request, createMemberSchema, "Invalid account details.");
  if (body.response) return body.response;

  const {
    email,
    password,
    customDailyLimit,
    customMaxReports,
    nameLastFirst,
    nameFirstLast,
    office,
    defaultVerifier,
    defaultDailyHours,
    targetOjtHours,
    internshipStartDate,
  } = body.data;

  try {
    let createdUserId: string | null = null;
    let needsConfirmWarning = false;

    const profileMetadata = {
      name_last_first: (nameLastFirst ?? "").toUpperCase(),
      name_first_last: (nameFirstLast ?? "").toUpperCase(),
      office: office?.trim() || "DNX",
      default_verifier: (defaultVerifier ?? "").toUpperCase(),
      default_daily_hours: defaultDailyHours ?? 8,
      target_ojt_hours: targetOjtHours ?? 486,
      internship_start_date: internshipStartDate ?? null,
    };

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminServiceClient = serviceKey
      ? createSupabaseClient<Database>(publicEnv.supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

    const anonClient = createSupabaseClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (adminServiceClient) {
      const { data: created, error: createErr } = await adminServiceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: profileMetadata,
      });
      if (createErr) {
        if (/already\s*registered|already\s*been\s*registered|exists/i.test(createErr.message)) {
          const { data: listData } = await adminServiceClient.auth.admin.listUsers();
          const existingUser = listData?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
          if (existingUser) {
            createdUserId = existingUser.id;
            await adminServiceClient.auth.admin.updateUserById(existingUser.id, {
              password,
              email_confirm: true,
              user_metadata: { ...(existingUser.user_metadata ?? {}), ...profileMetadata },
            });
          } else {
            return NextResponse.json({ error: createErr.message }, { status: 400 });
          }
        } else {
          return NextResponse.json({ error: createErr.message }, { status: 400 });
        }
      } else {
        createdUserId = created.user?.id ?? null;
      }
    } else {
      // Stateless anon client so admin's own session cookies are untouched
      const { data: signed, error: signErr } = await anonClient.auth.signUp({
        email,
        password,
        options: { data: profileMetadata },
      });
      if (signErr) {
        // Recover if a previous attempt created the auth user before quota/profile sync completed
        if (/already\s*registered|already\s*been\s*registered/i.test(signErr.message)) {
          const { data: recovered, error: recoverErr } = await anonClient.auth.signInWithPassword({
            email,
            password,
          });
          if (!recoverErr && recovered.user) {
            createdUserId = recovered.user.id;
            await anonClient.auth.updateUser({ data: profileMetadata }).catch(() => null);
          } else {
            const { data: existingQuota } = await supabase
              .from("user_quotas")
              .select("user_id")
              .ilike("email", email)
              .maybeSingle();
            if (existingQuota?.user_id) {
              createdUserId = existingQuota.user_id;
            } else {
              return NextResponse.json(
                {
                  error:
                    "This email is already registered in Supabase Auth. Enter the same password used initially to finish linking their quota & profile, or use a different email.",
                },
                { status: 400 },
              );
            }
          }
        } else {
          return NextResponse.json({ error: signErr.message }, { status: 400 });
        }
      } else {
        createdUserId = signed.user?.id ?? null;
        needsConfirmWarning = !signed.session;
      }
    }

    if (createdUserId) {
      const quotaWriter = adminServiceClient ?? supabase;
      const profilePayload = {
        id: createdUserId,
        ...profileMetadata,
      };

      const { error: quotaErr } = await quotaWriter.from("user_quotas").upsert(
        {
          user_id: createdUserId,
          email,
          custom_daily_limit: customDailyLimit ?? null,
          custom_max_reports: customMaxReports ?? null,
        },
        { onConflict: "user_id" },
      );
      if (quotaErr) throw new Error(quotaErr.message);

      // Try writing profile with service client, new user's own session client (passes profiles_update_own RLS), or admin client
      const profileClient = adminServiceClient ?? anonClient;
      const { error: pErr1 } = await profileClient.from("profiles").upsert(profilePayload, { onConflict: "id" });
      if (pErr1) {
        const { error: pErr2 } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" });
        if (pErr2) {
          // Non-fatal: defaults are also stored in user_metadata and auto-synced when the intern signs in
          console.warn("[api/admin/users POST] Profile RLS deferred to user_metadata sync:", pErr2.message);
        }
      }
    }

    const data = await loadAdminDashboardData(supabase);
    return NextResponse.json({ ...data, needsConfirmWarning }, { status: 201 });
  } catch (err) {
    return safeServerError("api/admin/users POST", err, "Failed to create intern account.");
  }
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");
  if (!isAdminUser(user)) return jsonError(403, "Forbidden");

  const bodyParsed = await parseJsonBody(request, patchSchema, "Invalid payload.");
  if (bodyParsed.response) return bodyParsed.response;

  try {
    const body = bodyParsed.data;
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
      if (body.userId === user.id && body.isBlocked) {
        return jsonError(400, "Admins cannot pause or block their own account.");
      }
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
    return safeServerError("api/admin/users PATCH", err, "Update failed.");
  }
}
