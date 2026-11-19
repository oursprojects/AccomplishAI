import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const ADMIN_EMAIL = "mikorynosantiago@gmail.com";

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
}

export async function getUserQuotaStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  email?: string | null,
): Promise<QuotaStatus> {
  const admin = isAdminEmail(email);
  const dayStart = getManilaDayStartIso();

  const [{ data: settings }, { data: quota }, { count: usedCount }] = await Promise.all([
    supabase.from("admin_settings").select("default_daily_prompt_limit").eq("id", 1).maybeSingle(),
    supabase.from("user_quotas").select("custom_daily_limit, is_blocked").eq("user_id", userId).maybeSingle(),
    supabase
      .from("prompt_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", dayStart),
  ]);

  const defaultLimit = settings?.default_daily_prompt_limit ?? 15;
  const dailyLimit = quota?.custom_daily_limit ?? defaultLimit;
  const usedToday = usedCount ?? 0;
  const isBlocked = !admin && (quota?.is_blocked ?? false);
  const remaining = admin ? 9999 : Math.max(0, dailyLimit - usedToday);

  return {
    isAdmin: admin,
    isBlocked,
    dailyLimit,
    usedToday,
    remaining,
    allowed: admin || (!isBlocked && usedToday < dailyLimit),
  };
}
