import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getUserQuotaStatus, isAdminEmail, loadAdminDashboardData } from "@/lib/admin";
import { AppShell } from "@/components/AppShell";
import { AdminClient } from "@/components/AdminClient";

async function AdminContent() {
  await connection();
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/");

  const [dashboard, quota] = await Promise.all([
    loadAdminDashboardData(supabase),
    getUserQuotaStatus(supabase, user.id, user.email),
  ]);

  return (
    <AppShell userEmail={user.email ?? ""} quota={quota}>
      <AdminClient
        initialAiSettings={dashboard.aiSettings}
        initialMembers={dashboard.members}
      />
    </AppShell>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-[#6B665E] bg-[#FAF9F5]">
          Loading admin console...
        </div>
      }
    >
      <AdminContent />
    </Suspense>
  );
}
