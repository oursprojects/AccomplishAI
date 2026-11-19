import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { ensureActiveTemplateReview } from "@/lib/templates/pipeline";
import { reportDataSchema, type ReportData } from "@/lib/report-schema";
import { AppShell } from "@/components/AppShell";
import { WorkspaceClient } from "@/components/WorkspaceClient";

async function WorkspaceContent({
  searchParams,
}: {
  searchParams: Promise<{ reportId?: string }>;
}) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const { reportId } = await searchParams;

  const [{ data: profile }, review, reportRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("name_last_first, name_first_last, office, default_verifier, default_daily_hours")
      .eq("id", user.id)
      .maybeSingle(),
    ensureActiveTemplateReview(supabase, user.id).catch(() => null),
    reportId
      ? supabase
          .from("reports")
          .select("id, raw_notes, structured_data")
          .eq("id", reportId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const initialProfile = profile ?? {
    name_last_first: "",
    name_first_last: "",
    office: "YML",
    default_verifier: "",
    default_daily_hours: 8,
  };

  const initialReport = reportRes.data
    ? {
        id: reportRes.data.id,
        raw_notes: reportRes.data.raw_notes,
        structured_data: reportDataSchema.parse(reportRes.data.structured_data ?? {}) as ReportData,
      }
    : null;

  return (
    <AppShell userEmail={user.email ?? ""}>
      <WorkspaceClient profile={initialProfile} initialReview={review} initialReport={initialReport} />
    </AppShell>
  );
}

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ reportId?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          Loading workspace...
        </div>
      }
    >
      <WorkspaceContent searchParams={searchParams} />
    </Suspense>
  );
}
