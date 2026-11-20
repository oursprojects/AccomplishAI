import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getUserQuotaStatus } from "@/lib/admin";
import { ensureFastActiveTemplateReview } from "@/lib/templates/pipeline";
import { emptyReport, reportDataSchema, type ReportData } from "@/lib/report-schema";
import { AppShell } from "@/components/AppShell";
import { WorkspaceClient } from "@/components/WorkspaceClient";
import type { ChatTurn } from "@/components/ReportChat";

function parseChatTurns(rawChat: unknown): ChatTurn[] {
  if (!Array.isArray(rawChat)) return [];
  return rawChat.flatMap((m, idx): ChatTurn[] => {
    if (!m || typeof m !== "object" || Array.isArray(m)) return [];
    const rec = m as Record<string, unknown>;
    if ((rec.role === "user" || rec.role === "assistant") && typeof rec.content === "string") {
      return [
        {
          id: typeof rec.id === "string" ? rec.id : `m-${idx}`,
          role: rec.role,
          content: rec.content,
          toolActions: Array.isArray(rec.toolActions)
            ? rec.toolActions.filter((a): a is string => typeof a === "string")
            : undefined,
        },
      ];
    }
    return [];
  });
}

async function WorkspaceContent({
  searchParams,
}: {
  searchParams: Promise<{ reportId?: string; new?: string; duplicateFrom?: string }>;
}) {
  await connection();
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const { reportId, new: newFlag, duplicateFrom } = await searchParams;
  const isNewMode = (newFlag === "1" || Boolean(duplicateFrom)) && !reportId;

  if (isNewMode) {
    await supabase.from("workspace_drafts").delete().eq("user_id", user.id);
  }

  const [{ data: profile }, review, quota, reportRes, draftRes, latestReportRes, duplicateRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("name_last_first, name_first_last, office, default_verifier, default_daily_hours")
      .eq("id", user.id)
      .maybeSingle(),
    ensureFastActiveTemplateReview(supabase, user.id).catch(() => null),
    getUserQuotaStatus(supabase, user.id, user.email),
    reportId
      ? supabase
          .from("reports")
          .select("id, title, raw_notes, structured_data, chat_messages")
          .eq("id", reportId)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    !reportId && !isNewMode
      ? supabase
          .from("workspace_drafts")
          .select("report_id, structured_data, chat_messages")
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("reports")
      .select("id, structured_data")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(2),
    duplicateFrom
      ? supabase
          .from("reports")
          .select("structured_data")
          .eq("id", duplicateFrom)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const initialProfile = profile ?? {
    name_last_first: "",
    name_first_last: "",
    office: "DNX",
    default_verifier: "",
    default_daily_hours: 8,
  };

  const initialReport = reportRes.data
    ? {
        id: reportRes.data.id,
        title: reportRes.data.title ?? "",
        raw_notes: reportRes.data.raw_notes,
        structured_data: reportDataSchema.parse(reportRes.data.structured_data ?? {}) as ReportData,
        chat_messages: parseChatTurns(reportRes.data.chat_messages),
      }
    : null;

  let initialDraft: {
    report_id: string | null;
    structured_data: ReportData;
    chat_messages: ChatTurn[];
  } | null = null;

  if (!initialReport && duplicateRes.data?.structured_data) {
    const src = reportDataSchema.parse(duplicateRes.data.structured_data ?? {}) as ReportData;
    const seeded = emptyReport();
    seeded.intern_name_last_first = src.intern_name_last_first || initialProfile.name_last_first;
    seeded.intern_name_first_last = src.intern_name_first_last || initialProfile.name_first_last;
    seeded.office = src.office || initialProfile.office || "DNX";
    initialDraft = {
      report_id: null,
      structured_data: seeded,
      chat_messages: [],
    };
  } else if (!initialReport && !isNewMode && draftRes.data) {
    initialDraft = {
      report_id: draftRes.data.report_id,
      structured_data: reportDataSchema.parse(draftRes.data.structured_data ?? {}) as ReportData,
      chat_messages: parseChatTurns(draftRes.data.chat_messages),
    };
  }

  const prevSource =
    duplicateRes.data ??
    (latestReportRes.data ?? []).find((r) => !reportId || r.id !== reportId) ??
    null;

  const previousTotalHours =
    prevSource?.structured_data &&
    typeof prevSource.structured_data === "object" &&
    !Array.isArray(prevSource.structured_data)
      ? String((prevSource.structured_data as Record<string, unknown>).total_hours_worked ?? "")
      : "";

  return (
    <AppShell userEmail={user.email ?? ""} quota={quota}>
      <WorkspaceClient
        key={initialReport?.id ?? (duplicateFrom ? `dup-${duplicateFrom}` : isNewMode ? "new-report" : "draft")}
        userId={user.id}
        profile={initialProfile}
        previousTotalHours={previousTotalHours}
        initialReview={review}
        initialReport={initialReport}
        initialDraft={initialDraft}
        initialQuota={quota}
      />
    </AppShell>
  );
}

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ reportId?: string; new?: string; duplicateFrom?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-[#6B665E] bg-[#FAF9F5]">
          Loading workspace...
        </div>
      }
    >
      <WorkspaceContent searchParams={searchParams} />
    </Suspense>
  );
}
