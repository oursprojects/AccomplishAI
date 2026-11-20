import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getUserQuotaStatus } from "@/lib/admin";
import type { ReportData } from "@/lib/report-schema";
import { AppShell } from "@/components/AppShell";
import { HistoryClient, type ReportSummary } from "@/components/HistoryClient";
import Loading from "./loading";

async function ReportsHomeContent({
  searchParams,
}: {
  searchParams: Promise<{ reportId?: string }>;
}) {
  await connection();
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const { reportId } = await searchParams;
  if (reportId) {
    redirect(`/reports/${encodeURIComponent(reportId)}`);
  }

  const [{ data }, { data: profile }, quota] = await Promise.all([
    supabase
      .from("reports")
      .select("id, title, raw_notes, structured_data, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("profiles")
      .select("name_last_first, name_first_last, office, default_verifier, default_daily_hours, internship_start_date")
      .eq("id", user.id)
      .maybeSingle(),
    getUserQuotaStatus(supabase, user.id, user.email),
  ]);

  const reports: ReportSummary[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title ?? "",
    raw_notes: r.raw_notes,
    structured_data:
      r.structured_data && typeof r.structured_data === "object" && !Array.isArray(r.structured_data)
        ? (r.structured_data as Partial<ReportData>)
        : {},
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return (
    <AppShell userEmail={user.email ?? ""} quota={quota}>
      <HistoryClient
        initialReports={reports}
        maxReports={quota.maxReports}
        canCreateReport={quota.canCreateReport}
        initialStartDate={profile?.internship_start_date ?? null}
        profileSnapshot={{
          name_last_first: profile?.name_last_first ?? "",
          name_first_last: profile?.name_first_last ?? "",
          office: profile?.office ?? "DNX",
          default_verifier: profile?.default_verifier ?? "",
          default_daily_hours: profile?.default_daily_hours ?? 8,
        }}
      />
    </AppShell>
  );
}

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ reportId?: string }>;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <ReportsHomeContent searchParams={searchParams} />
    </Suspense>
  );
}
