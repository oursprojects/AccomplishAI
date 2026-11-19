import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const ADMIN_EMAIL = "mikorynosantiago@gmail.com";

export const ALLOWED_TEXT_MODELS = [
  {
    id: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B (Recommended)",
    notes: "Best accuracy for Tagalog/English translation & tool calling · 30 RPM · 1K RPD · 8K TPM",
  },
  {
    id: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B (Fast & Light)",
    notes: "Lower latency fallback for simple notes · 30 RPM · 1K RPD · 8K TPM",
  },
  {
    id: "qwen/qwen3.8-27b",
    label: "Qwen 3.8 27B",
    notes: "Alternative reasoning/extraction model · 30 RPM · 1K RPD · 8K TPM",
  },
] as const;

export const ALLOWED_STT_MODELS = [
  {
    id: "whisper-large-v3-turbo",
    label: "Whisper Large v3 Turbo (Recommended)",
    notes: "Fastest multilingual voice-to-text · 20 RPM · 2K RPD · 7.2K ASH",
  },
  {
    id: "whisper-large-v3",
    label: "Whisper Large v3 (High Precision)",
    notes: "Higher accuracy fallback for noisy audio · 20 RPM · 2K RPD · 7.2K ASH",
  },
] as const;

export type AllowedTextModel = (typeof ALLOWED_TEXT_MODELS)[number]["id"];
export type AllowedSttModel = (typeof ALLOWED_STT_MODELS)[number]["id"];

export interface AiRuntimeSettings {
  defaultDailyLimit: number;
  defaultMaxReports: number | null;
  activeTextModel: AllowedTextModel;
  activeSttModel: AllowedSttModel;
  maxBulletsPerDay: number;
}

export function isAdminEmail(email?: string | null): boolean {
  return typeof email === "string" && email.trim().toLowerCase() === ADMIN_EMAIL;
}

/** Midnight of the current calendar day in Asia/Manila (UTC+08:00), as an ISO timestamp. */
export function getManilaDayStartIso(now = new Date()): string {
  const manilaMs = now.getTime() + 8 * 60 * 60 * 1000;
  const manilaDate = new Date(manilaMs).toISOString().slice(0, 10);
  return new Date(`${manilaDate}T00:00:00+08:00`).toISOString();
}

export interface QuotaStatus {
  isAdmin: boolean;
  isBlocked: boolean;
  dailyLimit: number;
  usedToday: number;
  remaining: number;
  allowed: boolean;
  reportsCount: number;
  maxReports: number | null;
  canCreateReport: boolean;
}

export async function getAiSettings(supabase: SupabaseClient<Database>): Promise<AiRuntimeSettings> {
  const { data } = await supabase
    .from("admin_settings")
    .select("default_daily_prompt_limit, default_max_reports, active_text_model, active_stt_model, max_bullets_per_day")
    .eq("id", 1)
    .maybeSingle();

  const textValid = ALLOWED_TEXT_MODELS.some((m) => m.id === data?.active_text_model);
  const sttValid = ALLOWED_STT_MODELS.some((m) => m.id === data?.active_stt_model);

  return {
    defaultDailyLimit: data?.default_daily_prompt_limit ?? 15,
    defaultMaxReports: data?.default_max_reports ?? null,
    activeTextModel: (textValid ? data!.active_text_model : "openai/gpt-oss-120b") as AllowedTextModel,
    activeSttModel: (sttValid ? data!.active_stt_model : "whisper-large-v3-turbo") as AllowedSttModel,
    maxBulletsPerDay: data?.max_bullets_per_day ?? 3,
  };
}

export async function getUserQuotaStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  email?: string | null,
): Promise<QuotaStatus> {
  const admin = isAdminEmail(email);
  const dayStart = getManilaDayStartIso();

  const [{ data: settings }, { data: quota }, { count: usedCount }, { count: reportCount }] = await Promise.all([
    supabase
      .from("admin_settings")
      .select("default_daily_prompt_limit, default_max_reports")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("user_quotas")
      .select("custom_daily_limit, custom_max_reports, is_blocked")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("prompt_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", dayStart),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const defaultLimit = settings?.default_daily_prompt_limit ?? 15;
  const dailyLimit = quota?.custom_daily_limit ?? defaultLimit;
  const usedToday = usedCount ?? 0;
  const isBlocked = !admin && (quota?.is_blocked ?? false);
  const remaining = admin ? 9999 : Math.max(0, dailyLimit - usedToday);

  const reportsCount = reportCount ?? 0;
  const maxReports = admin ? null : (quota?.custom_max_reports ?? settings?.default_max_reports ?? null);
  const canCreateReport = admin || (!isBlocked && (maxReports === null || reportsCount < maxReports));

  return {
    isAdmin: admin,
    isBlocked,
    dailyLimit,
    usedToday,
    remaining,
    allowed: admin || (!isBlocked && usedToday < dailyLimit),
    reportsCount,
    maxReports,
    canCreateReport,
  };
}

export interface AdminMember {
  userId: string;
  email: string;
  nameLastFirst: string;
  office: string;
  customDailyLimit: number | null;
  effectiveDailyLimit: number;
  customMaxReports: number | null;
  effectiveMaxReports: number | null;
  isBlocked: boolean;
  isAdmin: boolean;
  usedToday: number;
  usedTotal: number;
  reportsCount: number;
  createdAt: string;
}

export interface AdminDashboardData {
  aiSettings: AiRuntimeSettings;
  members: AdminMember[];
}

export async function loadAdminDashboardData(supabase: SupabaseClient<Database>): Promise<AdminDashboardData> {
  const dayStart = getManilaDayStartIso();

  const [aiSettings, { data: quotas, error: qErr }, { data: profiles }, { data: logs }, { data: reports }] =
    await Promise.all([
      getAiSettings(supabase),
      supabase
        .from("user_quotas")
        .select("user_id, email, custom_daily_limit, custom_max_reports, is_blocked, created_at")
        .order("created_at", { ascending: true }),
      supabase.from("profiles").select("id, name_last_first, office"),
      supabase.from("prompt_usage_logs").select("user_id, created_at"),
      supabase.from("reports").select("user_id"),
    ]);

  if (qErr) throw new Error(qErr.message);

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
      office: p?.office ?? "DNX",
      customDailyLimit: q.custom_daily_limit,
      effectiveDailyLimit: q.custom_daily_limit ?? aiSettings.defaultDailyLimit,
      customMaxReports: q.custom_max_reports,
      effectiveMaxReports: admin ? null : (q.custom_max_reports ?? aiSettings.defaultMaxReports),
      isBlocked: !admin && q.is_blocked,
      isAdmin: admin,
      usedToday: todayMap.get(q.user_id) ?? 0,
      usedTotal: totalMap.get(q.user_id) ?? 0,
      reportsCount: reportMap.get(q.user_id) ?? 0,
      createdAt: q.created_at,
    };
  });

  return { aiSettings, members };
}
