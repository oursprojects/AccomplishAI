import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { checkBurstRateLimit, getQuotaAndAiSettings, getUserQuotaStatus } from "@/lib/admin";
import {
  buildInternshipWeeks,
  getReportWeekMondayIso,
  normalizeHolidayMondays,
  parseHoursNumber,
  resolveWeekNumber,
} from "@/lib/internship-calendar";
import { groqErrorResponse } from "@/lib/ai/groq";
import { groqChatWithTools, type GroqMessage } from "@/lib/ai/chat-tools";
import { computeReportStatus } from "@/lib/mcp/accomplish-mcp-server";
import { openAccomplishMcpSession, type AccomplishMcpSession } from "@/lib/mcp/in-memory-bridge";
import type { Json } from "@/lib/supabase/database.types";
import { reportDataStrictSchema, type ReportData, type ReportKey } from "@/lib/report-schema";

const requestSchema = z.object({
  reportId: z.string().uuid().nullable().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(6000),
      }),
    )
    .min(1)
    .max(100),
  currentData: reportDataStrictSchema,
});

async function persistConversation(
  supabase: Awaited<ReturnType<typeof getUser>>["supabase"],
  userId: string,
  reportId: string | null | undefined,
  workingData: ReportData,
  nextHistory: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    toolActions?: string[];
    mcpToolsUsed?: string[];
  }>,
) {
  if (reportId) {
    await supabase
      .from("reports")
      .update({
        structured_data: workingData as unknown as Json,
        chat_messages: nextHistory as unknown as Json,
      })
      .eq("id", reportId)
      .eq("user_id", userId);
    return;
  }

  await supabase.from("workspace_drafts").upsert(
    {
      user_id: userId,
      report_id: null,
      structured_data: workingData as unknown as Json,
      chat_messages: nextHistory as unknown as Json,
    },
    { onConflict: "user_id" },
  );
}

function looksLikeUnappliedMutation(reply: string): boolean {
  return (
    /\|[^|\n]+\|[^|\n]+\|/.test(reply) ||
    /\b(i(?:'ve| have)?\s+(?:updated|added|filled|applied|cleared|removed|deleted|set|edited|saved)|report field(?:s)? updated)\b/i.test(
      reply,
    )
  );
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid chat request." }, { status: 400 });
  }

  let mcpSession: AccomplishMcpSession | null = null;
  try {
    const { quota: quotaBefore, aiSettings } = await getQuotaAndAiSettings(supabase, user.id, user.email);
    const maxChatMessages = aiSettings.maxChatMessages;

    if (body.data.messages.length > maxChatMessages) {
      return NextResponse.json(
        {
          error: `Conversation context limit reached (${maxChatMessages} messages). Click Clear Chat to start a fresh thread — your document fields stay safe.`,
        },
        { status: 400 },
      );
    }

    if (quotaBefore.isBlocked) {
      return NextResponse.json(
        { error: "Your AI prompt access is currently paused by the admin." },
        { status: 403 },
      );
    }
    if (!quotaBefore.allowed) {
      return NextResponse.json(
        {
          error: `Daily AI prompt limit reached (${quotaBefore.usedToday}/${quotaBefore.dailyLimit} used today). Ask your admin to increase your limit.`,
          quota: quotaBefore,
        },
        { status: 429 },
      );
    }

    const burst = await checkBurstRateLimit(supabase, user.id, quotaBefore.isAdmin, aiSettings.globalRpmLimit);
    if (!burst.allowed) {
      return NextResponse.json(
        {
          error:
            burst.reason === "global"
              ? `High concurrent AI traffic (${burst.count}/${burst.limit} shared RPM). Retrying shortly...`
              : `Too many requests in one minute (${burst.count}/${burst.limit} RPM). Please wait a few seconds before sending again.`,
          retryAfterSeconds: burst.retryAfterSeconds,
        },
        { status: 429, headers: { "Retry-After": String(burst.retryAfterSeconds) } },
      );
    }

    const [{ data: profile }, { data: recentReports }] = await Promise.all([
      supabase
        .from("profiles")
        .select("name_last_first, name_first_last, office, default_verifier, default_daily_hours, internship_start_date")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("reports")
        .select("id, title, structured_data, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const workingData: ReportData = { ...body.data.currentData };
    if (!workingData.intern_name_last_first && profile?.name_last_first) {
      workingData.intern_name_last_first = profile.name_last_first.toUpperCase();
    }
    if (!workingData.intern_name_first_last && profile?.name_first_last) {
      workingData.intern_name_first_last = profile.name_first_last.toUpperCase();
    }
    if (!workingData.office) {
      workingData.office = profile?.office || "DNX";
    }

    const previousReports = (recentReports ?? [])
      .filter((r) => !body.data.reportId || r.id !== body.data.reportId)
      .map((r) => {
        const sd =
          r.structured_data && typeof r.structured_data === "object" && !Array.isArray(r.structured_data)
            ? (r.structured_data as Record<string, unknown>)
            : {};
        return {
          id: r.id,
          title: r.title,
          date_from: String(sd.date_from ?? ""),
          date_to: String(sd.date_to ?? ""),
          hours_this_week: String(sd.hours_this_week ?? ""),
          total_hours_worked: String(sd.total_hours_worked ?? ""),
        };
      });

    const occupiedWeekMondays = new Map<string, string>();
    for (const prev of previousReports) {
      const monIso = getReportWeekMondayIso(prev.date_from, prev.date_to);
      if (monIso) occupiedWeekMondays.set(monIso, prev.title || prev.date_from);
    }

    const latestPrev = previousReports[0] ?? null;
    const prevTotalRaw = latestPrev?.total_hours_worked ?? "";
    const prevTotalNum = parseHoursNumber(prevTotalRaw) ?? 0;

    const startIso = profile?.internship_start_date ?? null;
    const holidayMondays = normalizeHolidayMondays(user.user_metadata?.holiday_mondays);
    const calendarWeeks = buildInternshipWeeks(startIso, 16, holidayMondays);
    const currentWeekNumber = resolveWeekNumber(startIso, workingData.date_from, holidayMondays);

    const systemPrompt = `You are **Accomplish AI**, a friendly, helpful assistant dedicated strictly to helping a student intern complete their official 1-page **"2026 Weekly Accomplishment Report"** (.docx). You are connected to the user's Supabase database through AccomplishAI's built-in **MCP tools** (\`list_reports\`, \`get_ojt_hours_summary\`, \`get_report_fields\`, \`set_report_fields\`, \`clear_report_fields\`, \`save_profile_defaults\`).

Today's date: ${new Date().toISOString().slice(0, 10)}
User profile defaults: ${JSON.stringify({
      name_last_first: profile?.name_last_first ?? "",
      name_first_last: profile?.name_first_last ?? "",
      office: profile?.office || "DNX",
      default_verifier: profile?.default_verifier ?? "",
      default_daily_hours: profile?.default_daily_hours ?? 8,
      internship_start_date: startIso,
    })}
Internship Mon–Fri Calendar (Week 1 begins ${startIso ?? "not set yet"}): ${JSON.stringify(
      calendarWeeks.map((w) => ({
        week: w.weekNumber,
        date_from_monday: w.fromText,
        date_to_friday: w.toText,
      })),
    )}
Current report week number (from calendar): ${currentWeekNumber ?? "Unknown"}
Previous report summary (for cumulative hours & date continuity): ${JSON.stringify(latestPrev)}
Current report fields (exact live state): ${JSON.stringify(workingData)}

CORE BEHAVIOR & STRICT RULES:
1. **Exact Date & Name Formatting:**
   - Dates (\`date_from\`, \`date_to\`) MUST ALWAYS be formatted as **Month Day, Year** (e.g. **November 9, 2026** and **November 13, 2026**) — NEVER numeric like \`11-09-2026\` or \`2026-11-09\`.
   - All person names (\`intern_name_last_first\`, \`intern_name_first_last\`, and \`mon_verified_by\`–\`fri_verified_by\`) MUST be **ALL CAPITAL LETTERS** (e.g. \`SANTIAGO, MIKE RYNO\`, \`MIKE RYNO SANTIAGO\`).
2. **Calendar-Aware Week Dates (Monday to Friday):**
   - Use \`Internship Mon–Fri Calendar\` above when resolving "1st week", "Week 2", "this week", etc., or call \`list_reports\` / \`get_ojt_hours_summary\` via MCP whenever the user asks about other weeks or overall OJT hours.
   - If the user mentions when their internship began (e.g. *"we started November 9"*), call \`save_profile_defaults\` with \`internship_start_date: "YYYY-MM-DD"\` AND set \`date_from\`/\`date_to\` using that week's Monday–Friday.
3. **Cumulative Total Hours Worked (\`total_hours_worked\`):**
   - \`total_hours_worked\` = \`${prevTotalNum} + hours_this_week\`. Always compute and update \`total_hours_worked\` whenever \`hours_this_week\` is known or calculated!
4. **Always Execute Real MCP Tools:**
   - Whenever the user asks to **add, fill, translate, edit, update, replace, remove, delete, or clear** anything on the report, **ALWAYS call \`set_report_fields\` or \`clear_report_fields\`** BEFORE replying.
   - Whenever the user asks about past weeks' reports or total OJT progress, call \`list_reports\` or \`get_ojt_hours_summary\` so answers come straight from Supabase.
5. **Strictly Past-Tense & Task-Focused Only:**
   - Every item in \`mon_accomplishments\`–\`fri_accomplishments\` MUST begin with an English **past-tense** action verb (e.g., *Attended, Assisted, Built, Configured, Created, Debugged, Designed, Developed, Implemented, Integrated, Merged, Prepared, Published, Redesigned, Refined, Reviewed, Tested, Updated*) and describe **ONLY accomplished work tasks**.
   - **NEVER** use present tense or \`-ing\` verbs. **NEVER** include arrival times, departure/dismissal times (*"Arrived 7:00 AM"*, *"Went home at 9 PM"*, *"Dismissed at 4:30 PM"*), lunch breaks, or boarding-house/commute notes.
6. **Verify Before Clearing (No Fake Re-Clears):**
   - If the requested field(s) are **already \`""\`**, DO NOT pretend you cleared them and DO NOT show a table of cleared items—simply reply warmly that those fields are **already cleared / empty**.
7. **Concise & Table-Fit:** Keep tool values plain text (no \`**\`, \`*\`, or \`-\` bullets), formalized into crisp **past-tense** English:
   - Max **1–${aiSettings.maxBulletsPerDay} short lines** per worked day (\`<= 12 words\` per line, separated by \`\\n\`).
   - Max **1–2 short lines** for \`new_trainings\`, \`problems_encountered\`, and \`solutions_done\` (also past-tense).
8. **Friendly & Strictly On-Topic:** Keep a warm, encouraging tone strictly focused on the Weekly Accomplishment Report, internship calendar/hours, and form editing.
9. **Clean Markdown & Charts:**
   - Format replies in clean Markdown (**bold**, *italic*, and a compact Markdown table **only when fields were actually updated or cleared in this turn**).
   - If the user asks for a chart/graph of their hours or OJT progress, output a fenced \`\`\`chart JSON block (\`{ "type": "bar" | "line" | "area" | "pie" | "donut", "title": "...", "unit": "hrs", "data": [{ "label": "...", "value": 40 }] }\`).
   - **NEVER output \`<br>\`, \`<br/>\` or any raw HTML tags.** Separate multiple items inside a table cell with \`; \`.`;

    const recentMessages = body.data.messages.slice(-10);
    const loopMessages: GroqMessage[] = [
      { role: "system", content: systemPrompt },
      ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const updatedKeys = new Set<ReportKey>();
    const toolActions: string[] = [];
    let usedModel = "";
    let didMutateThisTurn = false;
    let forcedToolRetryUsed = false;
    let nextToolChoice: "auto" | "required" = "auto";

    mcpSession = await openAccomplishMcpSession({
      supabase,
      user,
      reportId: body.data.reportId,
      workingData,
      maxBulletsPerDay: aiSettings.maxBulletsPerDay,
      startIso,
      holidayMondays,
      defaultVerifier: profile?.default_verifier ?? "",
      prevTotalNum,
      occupiedWeekMondays,
      updatedKeys,
      toolActions,
      onMutate: () => {
        didMutateThisTurn = true;
      },
    });

    for (let step = 0; step < 5; step++) {
      const { completion, model } = await groqChatWithTools({
        messages: loopMessages,
        tools: mcpSession.groqTools,
        toolChoice: nextToolChoice,
        temperature: 0.2,
        maxTokens: 1500,
        preferredModel: usedModel || aiSettings.activeTextModel,
      });
      nextToolChoice = "auto";
      usedModel = model;

      const msg = completion.choices[0]?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const draftReply = (msg.content ?? "").trim();

        if (!didMutateThisTurn && !forcedToolRetryUsed && looksLikeUnappliedMutation(draftReply)) {
          forcedToolRetryUsed = true;
          loopMessages.push({ role: "assistant", content: draftReply });
          loopMessages.push({
            role: "system",
            content:
              "You described updating or clearing report fields without calling a tool. Call set_report_fields or clear_report_fields now so the report data is actually updated.",
          });
          nextToolChoice = "required";
          continue;
        }

        const defaultReply =
          toolActions.length > 0
            ? `All set — ${toolActions.join(", ").toLowerCase()} in your live report preview.`
            : "Everything on your report looks good as-is.";
        const reply = (draftReply || defaultReply).replace(/<br\s*\/?>/gi, "; ");
        const status = computeReportStatus(workingData);

        const nextHistory = [
          ...body.data.messages.map((m, idx) => ({ id: `h-${idx}`, role: m.role, content: m.content })),
          {
            id: `a-${Date.now()}`,
            role: "assistant" as const,
            content: reply,
            ...(toolActions.length ? { toolActions } : {}),
            ...(mcpSession.mcpToolsUsed.length ? { mcpToolsUsed: mcpSession.mcpToolsUsed } : {}),
          },
        ].slice(-maxChatMessages);

        await Promise.all([
          supabase.from("prompt_usage_logs").insert({
            user_id: user.id,
            kind: "chat_report",
            model: usedModel,
          }),
          persistConversation(supabase, user.id, body.data.reportId, workingData, nextHistory),
        ]);
        const quotaAfter = await getUserQuotaStatus(supabase, user.id, user.email);

        return NextResponse.json({
          reply,
          structuredData: workingData,
          updatedKeys: Array.from(updatedKeys),
          toolActions,
          mcpToolsUsed: mcpSession.mcpToolsUsed,
          ...status,
          model: usedModel,
          quota: quotaAfter,
        });
      }

      loopMessages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: toolCalls,
      });

      for (const tc of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }

        const toolContent = await mcpSession.callTool(tc.function.name, args);
        loopMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: toolContent,
        });
      }
    }

    const status = computeReportStatus(workingData);
    const missingHints = status.missingEssential.slice(0, 2).map((m) => m.label);
    const fallbackReply =
      toolActions.length > 0
        ? `Done — updated ${toolActions.join(", ").toLowerCase()} on your live document preview.${
            missingHints.length > 0 ? ` Whenever you're ready, share ${missingHints.join(" & ")} next.` : ""
          }`
        : "Got it — no report fields needed changes yet. Let me know what you'd like to add or adjust!";

    const nextHistory = [
      ...body.data.messages.map((m, idx) => ({ id: `h-${idx}`, role: m.role, content: m.content })),
      {
        id: `a-${Date.now()}`,
        role: "assistant" as const,
        content: fallbackReply,
        ...(toolActions.length ? { toolActions } : {}),
        ...(mcpSession.mcpToolsUsed.length ? { mcpToolsUsed: mcpSession.mcpToolsUsed } : {}),
      },
    ].slice(-maxChatMessages);

    await Promise.all([
      supabase.from("prompt_usage_logs").insert({
        user_id: user.id,
        kind: "chat_report",
        model: usedModel || aiSettings.activeTextModel,
      }),
      persistConversation(supabase, user.id, body.data.reportId, workingData, nextHistory),
    ]);
    const quotaAfter = await getUserQuotaStatus(supabase, user.id, user.email);

    return NextResponse.json({
      reply: fallbackReply,
      structuredData: workingData,
      updatedKeys: Array.from(updatedKeys),
      toolActions,
      mcpToolsUsed: mcpSession.mcpToolsUsed,
      ...status,
      model: usedModel || aiSettings.activeTextModel,
      quota: quotaAfter,
    });
  } catch (err) {
    console.error("[chat-report]", err);
    const mapped = groqErrorResponse(err);
    return NextResponse.json(
      {
        error: mapped.message,
        ...(mapped.retryAfterSeconds ? { retryAfterSeconds: mapped.retryAfterSeconds } : {}),
      },
      {
        status: mapped.status,
        ...(mapped.retryAfterSeconds ? { headers: { "Retry-After": String(mapped.retryAfterSeconds) } } : {}),
      },
    );
  } finally {
    await mcpSession?.close();
  }
}
