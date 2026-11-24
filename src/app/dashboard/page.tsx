import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getFastUser } from "@/lib/supabase/server";
import { getUserQuotaStatus } from "@/lib/admin";
import { normalizeHolidayMondays } from "@/lib/internship-calendar";
import { ensureFastActiveTemplateReview } from "@/lib/templates/pipeline";
import type { ReportData } from "@/lib/report-schema";
import { AppShell } from "@/components/AppShell";
import { DashboardClient, type DashboardReportSummary } from "@/components/DashboardClient";
import DashboardLoading from "./loading";

async function DashboardContent() {
  await connection();
  const { supabase, user } = await getFastUser();
  if (!user) redirect("/login");

  const [{ data }, { data: profile }, review] = await Promise.all([
    supabase
      .from("reports")
      .select("id, title, structured_data, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("profiles")
      .select(
        "name_last_first, name_first_last, office, default_daily_hours, internship_start_date, target_ojt_hours",
      )
      .eq("id", user.id)
      .maybeSingle(),
    ensureFastActiveTemplateReview(supabase, user.id).catch(() => null),
  ]);

  const fetchedCount = data?.length ?? 0;
  const quota = await getUserQuotaStatus(
    supabase,
    user.id,
    user.email,
    fetchedCount < 100 ? fetchedCount : undefined,
  );

  const reports: DashboardReportSummary[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title ?? "",
    structured_data:
      r.structured_data && typeof r.structured_data === "object" && !Array.isArray(r.structured_data)
        ? (r.structured_data as Partial<ReportData>)
        : {},
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  const templateStatus = !review
    ? "missing"
    : review.template.status === "confirmed"
      ? "confirmed"
      : "pending_review";

  return (
    <AppShell userEmail={user.email ?? ""} quota={quota}>
      <DashboardClient
        reports={reports}
        quota={quota}
        holidayMondays={normalizeHolidayMondays(user.user_metadata?.holiday_mondays)}
        templateStatus={templateStatus}
        templateName={review?.template.name}
        profile={{
          name_last_first: profile?.name_last_first ?? "",
          name_first_last: profile?.name_first_last ?? "",
          office: profile?.office ?? "DNX",
          default_daily_hours: profile?.default_daily_hours ?? 8,
          internship_start_date: profile?.internship_start_date ?? null,
          target_ojt_hours: profile?.target_ojt_hours ?? 486,
        }}
      />
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
}
