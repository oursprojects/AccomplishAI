import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getManilaDayStartIso, isAdminEmail } from "@/lib/admin";
import type { AdminMember } from "@/app/api/admin/users/route";
import { AppShell } from "@/components/AppShell";
import { AdminClient } from "@/components/AdminClient";

async function AdminContent() {
  await connection();
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/");

  const dayStart = getManilaDayStartIso();
  const [{ data: settings }, { data: quotas }, { data: profiles }, { data: logs }, { data: reports }] =
    await Promise.all([
      supabase.from("admin_settings").select("default_daily_prompt_limit").eq("id", 1).maybeSingle(),
      supabase
        .from("user_quotas")
        .select("user_id, email, custom_daily_limit, is_blocked, created_at")
        .order("created_at", { ascending: true }),
      supabase.from("profiles").select("id, name_last_first, office"),
      supabase.from("prompt_usage_logs").select("user_id, created_at"),
      supabase.from("reports").select("user_id"),
    ]);

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

  return (
    <AppShell userEmail={user.email ?? ""}>
      <AdminClient initialDefaultLimit={defaultDailyLimit} initialMembers={members} />
    </AppShell>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          Loading admin console...
        </div>
      }
    >
      <AdminContent />
    </Suspense>
  );
}
