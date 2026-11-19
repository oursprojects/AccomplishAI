import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import type { ReportData } from "@/lib/report-schema";
import { AppShell } from "@/components/AppShell";
import { HistoryClient, type ReportSummary } from "@/components/HistoryClient";

async function HistoryContent() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("reports")
    .select("id, raw_notes, structured_data, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const reports: ReportSummary[] = (data ?? []).map((r) => ({
    id: r.id,
    raw_notes: r.raw_notes,
    structured_data:
      r.structured_data && typeof r.structured_data === "object" && !Array.isArray(r.structured_data)
        ? (r.structured_data as Partial<ReportData>)
        : {},
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return (
    <AppShell userEmail={user.email ?? ""}>
      <HistoryClient initialReports={reports} />
    </AppShell>
  );
}

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          Loading history...
        </div>
      }
    >
      <HistoryContent />
    </Suspense>
  );
}
