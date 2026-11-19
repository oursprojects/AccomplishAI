import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getUserQuotaStatus } from "@/lib/admin";
import { ensureFastActiveTemplateReview } from "@/lib/templates/pipeline";
import { reportDataSchema, type ReportData } from "@/lib/report-schema";
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
  searchParams: Promise<{ reportId?: string }>;
}) {
  await connection();
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const { reportId } = await searchParams;

  const [{ data: profile }, review, quota, reportRes, draftRes] = await Promise.all([
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
          .select("id, raw_notes, structured_data, chat_messages")
          .eq("id", reportId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    !reportId
      ? supabase
          .from("workspace_drafts")
          .select("report_id, structured_data, chat_messages")
          .eq("user_id", user.id)
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
        chat_messages: parseChatTurns(reportRes.data.chat_messages),
      }
    : null;

  const initialDraft =
    !initialReport && draftRes.data
      ? {
          report_id: draftRes.data.report_id,
          structured_data: reportDataSchema.parse(draftRes.data.structured_data ?? {}) as ReportData,
          chat_messages: parseChatTurns(draftRes.data.chat_messages),
        }
      : null;

  return (
    <AppShell userEmail={user.email ?? ""}>
      <WorkspaceClient
        userId={user.id}
        profile={initialProfile}
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
  searchParams: Promise<{ reportId?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-[#66645E] bg-[#FAF9F5]">
          Loading workspace...
        </div>
      }
    >
      <WorkspaceContent searchParams={searchParams} />
    </Suspense>
  );
}
