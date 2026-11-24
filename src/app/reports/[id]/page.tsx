import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { getFastUser } from "@/lib/supabase/server";
import { getQuotaAndAiSettings } from "@/lib/admin";
import { normalizeHolidayMondays } from "@/lib/internship-calendar";
import { ensureFastActiveTemplateReview } from "@/lib/templates/pipeline";
import { reportDataSchema, type ReportData } from "@/lib/report-schema";
import { AppShell } from "@/components/AppShell";
import { WorkspaceClient } from "@/components/WorkspaceClient";
import type { ChatTurn } from "@/components/ReportChat";
import ReportWorkspaceLoading from "./loading";

const uuidSchema = z.string().uuid();

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
          mcpToolsUsed: Array.isArray(rec.mcpToolsUsed)
            ? rec.mcpToolsUsed.filter((t): t is string => typeof t === "string")
            : undefined,
        },
      ];
    }
    return [];
  });
}

async function ReportDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { supabase, user } = await getFastUser();
  if (!user) redirect("/login");

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    notFound();
  }

  const [{ data: profile }, review, { quota, aiSettings }, reportRes, latestReportsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("name_last_first, name_first_last, office, default_verifier, default_daily_hours, internship_start_date")
      .eq("id", user.id)
      .maybeSingle(),
    ensureFastActiveTemplateReview(supabase, user.id).catch(() => null),
    getQuotaAndAiSettings(supabase, user.id, user.email),
    supabase
      .from("reports")
      .select("id, title, raw_notes, structured_data, chat_messages, created_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("reports")
      .select("id, structured_data, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  if (!reportRes.data) {
    notFound();
  }

  const initialProfile = profile ?? {
    name_last_first: "",
    name_first_last: "",
    office: "DNX",
    default_verifier: "",
    default_daily_hours: 8,
    internship_start_date: null,
  };

  const initialReport = {
    id: reportRes.data.id,
    title: reportRes.data.title ?? "",
    raw_notes: reportRes.data.raw_notes,
    structured_data: reportDataSchema.parse(reportRes.data.structured_data ?? {}) as ReportData,
    chat_messages: parseChatTurns(reportRes.data.chat_messages),
  };

  // Pick the most recent report created BEFORE this report (or any other latest report with total_hours_worked)
  const candidates = (latestReportsRes.data ?? []).filter((r) => r.id !== id);
  const prior =
    candidates.find((r) => r.created_at < reportRes.data!.created_at) ??
    candidates[0] ??
    null;

  const previousTotalHours =
    prior?.structured_data &&
    typeof prior.structured_data === "object" &&
    !Array.isArray(prior.structured_data)
      ? String((prior.structured_data as Record<string, unknown>).total_hours_worked ?? "")
      : "";

  return (
    <AppShell userEmail={user.email ?? ""} quota={quota}>
      <WorkspaceClient
        key={initialReport.id}
        userId={user.id}
        profile={initialProfile}
        holidayMondays={normalizeHolidayMondays(user.user_metadata?.holiday_mondays)}
        previousTotalHours={previousTotalHours}
        initialReview={review}
        initialReport={initialReport}
        initialQuota={quota}
        maxChatMessages={aiSettings.maxChatMessages}
      />
    </AppShell>
  );
}

export default function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<ReportWorkspaceLoading />}>
      <ReportDetailContent params={params} />
    </Suspense>
  );
}
