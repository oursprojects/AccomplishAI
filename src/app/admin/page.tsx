import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { ALLOWED_TEXT_MODELS, getUserQuotaStatus, isAdminUser, loadAdminDashboardData } from "@/lib/admin";
import { getGroqPoolSnapshot } from "@/lib/ai/rate-limiter";
import { AppShell } from "@/components/AppShell";
import { AdminClient } from "@/components/AdminClient";
import AdminLoading from "./loading";

async function AdminContent() {
  await connection();
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  if (!isAdminUser(user)) redirect("/");

  const [dashboard, quota] = await Promise.all([
    loadAdminDashboardData(supabase),
    getUserQuotaStatus(supabase, user.id, user.email),
  ]);

  const poolStatus = getGroqPoolSnapshot(ALLOWED_TEXT_MODELS.map((m) => m.id));

  return (
    <AppShell userEmail={user.email ?? ""} quota={quota}>
      <AdminClient
        initialAiSettings={dashboard.aiSettings}
        initialMembers={dashboard.members}
        initialUsageMonitor={dashboard.usageMonitor}
        initialPoolStatus={poolStatus}
      />
    </AppShell>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminContent />
    </Suspense>
  );
}
