import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { getUserQuotaStatus } from "@/lib/admin";
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
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    notFound();
  }

  const [{ data: profile }, review, quota, reportRes, latestReportsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("name_last_first, name_first_last, office, default_verifier, default_daily_hours")
      .eq("id", user.id)
      .maybeSingle(),
    ensureFastActiveTemplateReview(supabase, user.id).catch(() => null),
    getUserQuotaStatus(supabase, user.id, user.email),
    supabase
      .from("reports")
      .select("id, title, raw_notes, structured_data, chat_messages")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("reports")
      .select("id, structured_data")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
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
  };

  const initialReport = {
    id: reportRes.data.id,
    title: reportRes.data.title ?? "",
    raw_notes: reportRes.data.raw_notes,
    structured_data: reportDataSchema.parse(reportRes.data.structured_data ?? {}) as ReportData,
    chat_messages: parseChatTurns(reportRes.data.chat_messages),
  };

  const prevSource = (latestReportsRes.data ?? []).find((r) => r.id !== id) ?? null;
  const previousTotalHours =
    prevSource?.structured_data &&
    typeof prevSource.structured_data === "object" &&
    !Array.isArray(prevSource.structured_data)
      ? String((prevSource.structured_data as Record<string, unknown>).total_hours_worked ?? "")
      : "";

  return (
    <AppShell userEmail={user.email ?? ""} quota={quota}>
      <WorkspaceClient
        key={initialReport.id}
        userId={user.id}
        profile={initialProfile}
        previousTotalHours={previousTotalHours}
        initialReview={review}
        initialReport={initialReport}
        initialQuota={quota}
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
