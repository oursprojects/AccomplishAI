import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { checkBurstRateLimit, getManilaTodayIso, getQuotaAndAiSettings, getUserQuotaStatus } from "@/lib/admin";
import {
  buildInternshipWeeks,
  inferNextWeekRange,
  normalizeHolidayMondays,
  parseHoursNumber,
} from "@/lib/internship-calendar";
import { groqErrorResponse, stripThinkingTags } from "@/lib/ai/groq";
import { groqChatWithTools, type GroqMessage } from "@/lib/ai/chat-tools";
import { emptyReport, reportDataSchema, type ReportData } from "@/lib/report-schema";
import { computeReportStatus } from "@/lib/mcp/accomplish-mcp-server";
import { openAccomplishMcpSession, type AccomplishMcpSession } from "@/lib/mcp/in-memory-bridge";

function looksLikeUnappliedGlobalMutation(reply: string): boolean {
  return /\b(?:i(?:'ve| have)?\s+)?(?:created|updated|filled|recorded|cleared|deleted|saved|marked|unmarked|added)\b[\s\S]{0,65}\b(?:weekly\s+report|report|accomplishment|holiday|profile|verifier|start\s+date|field(?:s)?)\b/i.test(
    reply,
  );
}

const requestSchema = z.object({
  currentPath: z.string().max(120).optional().default("/"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(6000),
      }),
    )
    .min(1)
    .max(1000),
  attachments: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        textContent: z.string().trim().min(1).max(12000),
      }),
    )
    .max(3)
    .optional()
    .default([]),
});

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
    const contextWindowSize = Math.max(16, aiSettings.maxChatMessages);

    if (quotaBefore.isBlocked) {
      return NextResponse.json(
        { error: "Your AI prompt access is currently paused by the admin." },
        { status: 403 },
      );
    }
    if (!quotaBefore.allowed) {
      return NextResponse.json(
        {
          error: `Daily AI prompt limit reached (${quotaBefore.usedToday}/${quotaBefore.dailyLimit} used today).`,
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
              : `Too many requests in one minute (${burst.count}/${burst.limit} RPM). Wait a few seconds.`,
          retryAfterSeconds: burst.retryAfterSeconds,
        },
        { status: 429, headers: { "Retry-After": String(burst.retryAfterSeconds) } },
      );
    }

    const [{ data: profile }, { data: tpl }, { data: reportRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "name_last_first, name_first_last, office, default_verifier, default_daily_hours, internship_start_date, target_ojt_hours",
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("templates")
        .select("id, name, status, updated_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("reports")
        .select("id, title, structured_data, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const holidayMondays = normalizeHolidayMondays(user.user_metadata?.holiday_mondays);
    const startIso = profile?.internship_start_date ?? null;
    const targetOjtHours = profile?.target_ojt_hours ?? 486;

    let maxTotal = 0;
    let sumWeekly = 0;
    const reportsSnapshot = (reportRows ?? []).map((r) => {
      const rawSd =
        r.structured_data && typeof r.structured_data === "object" && !Array.isArray(r.structured_data)
          ? r.structured_data
          : {};
      const sdRes = reportDataSchema.safeParse(rawSd);
      const parsed = sdRes.success ? sdRes.data : emptyReport();
      const t = parseHoursNumber(parsed.total_hours_worked);
      const w = parseHoursNumber(parsed.hours_this_week);
      if (t !== null && t > maxTotal) maxTotal = t;
      if (w !== null) sumWeekly += w;
      const st = computeReportStatus(parsed);
      return {
        id: r.id,
        title: r.title,
        date_from: parsed.date_from,
        date_to: parsed.date_to,
        hours_this_week: parsed.hours_this_week,
        total_hours_worked: parsed.total_hours_worked,
        is_complete: st.isComplete,
        missing: st.missingEssential.map((m) => m.label),
      };
    });

    const completedHours = Math.max(maxTotal, sumWeekly);
    const calendarWeeks = buildInternshipWeeks(startIso, 16, holidayMondays);
    const nextWeek = inferNextWeekRange({
      startIso,
      holidayMondays,
      existingReports: reportsSnapshot,
    });

    const openReportMatch = body.data.currentPath.match(/^\/reports\/([0-9a-f-]{36})/i);
    let activeOpenReport: {
      id: string;
      title: string;
      status: ReturnType<typeof computeReportStatus>;
      structured_data: ReportData;
    } | null = null;
    if (openReportMatch) {
      const openRow = (reportRows ?? []).find((r) => r.id === openReportMatch[1]);
      const targetRow =
        openRow ??
        (
          await supabase
            .from("reports")
            .select("id, title, structured_data")
            .eq("id", openReportMatch[1])
            .eq("user_id", user.id)
            .maybeSingle()
        ).data;
      if (targetRow) {
        const rawSd =
          targetRow.structured_data && typeof targetRow.structured_data === "object" && !Array.isArray(targetRow.structured_data)
            ? targetRow.structured_data
            : {};
        const parsedRes = reportDataSchema.safeParse(rawSd);
        const parsed = parsedRes.success ? parsedRes.data : emptyReport();
        activeOpenReport = {
          id: targetRow.id,
          title: targetRow.title,
          status: computeReportStatus(parsed),
          structured_data: parsed,
        };
      }
    }

    const systemPrompt = `You are **Overall Accomplish AI** — a full ChatGPT-grade general AI assistant AND the system-wide AccomplishAI workspace agent connected to Supabase via **MCP tools**.

Current page: ${body.data.currentPath}
Today's date (Asia/Manila): ${getManilaTodayIso()}
User account: ${user.email ?? ""} (${quotaBefore.isAdmin ? "Admin" : "Intern"})
Profile defaults: ${JSON.stringify(profile ?? {})}
OJT Progress: ${completedHours} / ${targetOjtHours} hours completed (${Math.max(0, targetOjtHours - completedHours)} hrs remaining)
Holiday / Break weeks (Monday ISOs): ${JSON.stringify(holidayMondays)}
Next suggested open report week: ${JSON.stringify(nextWeek)}
Active Word Template: ${JSON.stringify(tpl ?? null)}
Schedule preview (holidays skipped): ${JSON.stringify(
      calendarWeeks.slice(0, 10).map((w) => ({
        week: w.weekNumber,
        from: w.fromText,
        to: w.toText,
      })),
    )}
Saved Reports snapshot (${reportsSnapshot.length}): ${JSON.stringify(reportsSnapshot)}
${
  activeOpenReport
    ? `Currently open report in editor (${activeOpenReport.id}): ${JSON.stringify(activeOpenReport)}`
    : ""
}

CAPABILITIES & BEHAVIOR:
1. **Full ChatGPT-Style General Intelligence:** Answer ANY question across any topic just like ChatGPT — software engineering, debugging, SQL, TypeScript/React/Python code, math, writing/emails, brainstorming, interview/OJT advice, Tagalog↔English translation, explanations, checklists, and study help. Never refuse a general question just because it isn't about a report.
2. **Live Workspace Intelligence & MCP Actions:** When the user asks about their internship, weekly reports, OJT hours, holidays, profile, or template, use the real workspace snapshot above and call the MCP tools (\`get_ojt_analytics\`, \`search_reports\`, \`get_report_fields\`, \`list_reports\`, \`get_ojt_hours_summary\`, \`get_workspace_overview\`, \`create_weekly_report\`, \`set_report_fields\`, \`clear_report_fields\`, \`update_holiday_weeks\`, \`save_profile_defaults\`). Use \`get_ojt_analytics\` whenever building charts, forecasts, or OJT Excel/PDF summaries, and \`search_reports\` for keyword lookups across weeks. Never invent Supabase reports, dates, or hours.
3. **Interactive Visual Charts (\`\`\`chart):** Whenever the user asks for a **chart, graph, visual breakdown, progress chart, or comparison** (or when visualizing numeric data makes the answer much clearer), output a fenced \`\`\`chart JSON block! Supported types: \`"bar"\`, \`"line"\`, \`"area"\`, \`"pie"\`, \`"donut"\`.
   Format:
   \`\`\`chart
   {
     "type": "bar",
     "title": "Weekly OJT Hours",
     "subtitle": "Hours logged per week",
     "unit": "hrs",
     "data": [
       { "label": "Week 1", "value": 40 },
       { "label": "Week 2", "value": 40 }
     ]
   }
   \`\`\`
   For multi-series comparison charts (e.g. Weekly vs Cumulative hours), use:
   \`{ "type": "line", "title": "...", "unit": "hrs", "labels": ["Week 1", "Week 2"], "series": [{ "name": "Weekly", "data": [40, 40] }, { "name": "Cumulative", "data": [40, 80] }] }\`
   Keep \`chart\` JSON strictly valid (double quotes, numbers for values, no comments or trailing commas).
4. **Mermaid Diagrams (\`\`\`mermaid):** Whenever the user asks for a **flowchart, architecture diagram, sequence diagram, ERD, state diagram, Gantt/OJT roadmap, timeline, or mindmap**, output a valid fenced \`\`\`mermaid block (e.g., \`flowchart TD\`, \`sequenceDiagram\`, \`erDiagram\`, \`stateDiagram-v2\`, \`gantt\`, \`mindmap\`). Always quote node labels that contain spaces or parentheses (e.g., \`A["Step 1 (Setup)"]\`) and avoid HTML tags inside labels.
5. **Downloadable File Generation — DOCX, PDF & Excel (\`\`\`file):** Whenever the user asks to **generate, export, create, or download a Word (.docx), PDF (.pdf), or Excel (.xlsx) file** (such as an OJT hours spreadsheet, summary PDF report, cover letter, or custom table), output a fenced \`\`\`file JSON block with valid JSON:
   \`\`\`file
   {
     "format": "xlsx",
     "filename": "ojt-summary",
     "title": "OJT Weekly Hours Summary",
     "subtitle": "Prepared for Intern Name",
     "sections": [
       { "heading": "Summary", "paragraphs": ["..."], "bullets": ["..."] }
     ],
     "table": {
       "headers": ["Week", "Dates", "Hours", "Status"],
       "rows": [["Week 1", "Nov 9 - Nov 13, 2026", 40, "Complete"]]
     },
     "sheets": [
       { "name": "Weekly Hours", "headers": ["Week", "Hours"], "rows": [["Week 1", 40]] }
     ]
   }
   \`\`\`
   Use \`"format": "docx" | "pdf" | "xlsx"\`. Include \`sections\` for prose/letters/reports, \`table\` or \`sheets\` for spreadsheets/tabular data, and ensure numbers in numeric columns are JSON numbers. Keep \`file\` JSON strictly valid (no comments or trailing commas).
6. **Rich ChatGPT Formatting:** Use clean Markdown headings, crisp bullets, tables, blockquotes, and fenced code blocks with language tags (\`\`\`ts, \`\`\`sql, \`\`\`python, etc.). When writing or updating AccomplishAI report fields, follow past-tense formal wording, ALL CAPS names, and \`Month Day, Year\` dates.`;

    const recentMessages = body.data.messages.slice(-contextWindowSize);
    const attachmentContext =
      body.data.attachments.length > 0
        ? `\n\n[ATTACHED FILES FROM USER]\n${body.data.attachments
            .map((a) => `--- File: ${a.name} ---\n${a.textContent}`)
            .join("\n\n")}`
        : "";

    const loopMessages: GroqMessage[] = [
      { role: "system", content: systemPrompt },
      ...recentMessages.map((m, idx) => ({
        role: m.role,
        content:
          idx === recentMessages.length - 1 && m.role === "user" && attachmentContext
            ? `${m.content}${attachmentContext}`
            : m.content,
      })),
    ];

    const toolActions: string[] = [];
    let createdReportId: string | undefined;
    let updatedReport: { id: string; structuredData: ReportData } | undefined;
    let mutated = false;
    let usedModel = "";
    let forcedToolRetryUsed = false;
    let nextToolChoice: "auto" | "required" = "auto";

    mcpSession = await openAccomplishMcpSession({
      supabase,
      user,
      maxBulletsPerDay: aiSettings.maxBulletsPerDay,
      startIso,
      holidayMondays,
      defaultVerifier: profile?.default_verifier ?? "",
      toolActions,
      onGlobalMutate: (info) => {
        if (info.createdReportId) createdReportId = info.createdReportId;
        if (info.updatedReportId && info.updatedData) {
          updatedReport = { id: info.updatedReportId, structuredData: info.updatedData };
        }
        if (info.mutated) mutated = true;
      },
    });

    for (let step = 0; step < 5; step++) {
      const { completion, model } = await groqChatWithTools({
        messages: loopMessages,
        tools: mcpSession.groqTools,
        toolChoice: nextToolChoice,
        temperature: 0.35,
        maxTokens: 2400,
        preferredModel: usedModel || aiSettings.activeTextModel,
        reasoningEffort: "medium",
      });
      nextToolChoice = "auto";
      usedModel = model;

      const msg = completion.choices[0]?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const draftReply = stripThinkingTags(msg.content ?? "");
        if (!mutated && !forcedToolRetryUsed && looksLikeUnappliedGlobalMutation(draftReply)) {
          forcedToolRetryUsed = true;
          loopMessages.push({ role: "assistant", content: draftReply });
          loopMessages.push({
            role: "system",
            content:
              "You described creating or modifying Supabase data without calling an MCP tool. Call the appropriate MCP tool now before replying.",
          });
          nextToolChoice = "required";
          continue;
        }
        const reply = draftReply || "Done! Checked your workspace via MCP.";

        await supabase.from("prompt_usage_logs").insert({
          user_id: user.id,
          kind: "chat_global",
          model: usedModel,
        });
        const quotaAfter = await getUserQuotaStatus(supabase, user.id, user.email);

        return NextResponse.json({
          reply,
          toolActions,
          mcpToolsUsed: mcpSession.mcpToolsUsed,
          createdReportId,
          updatedReport,
          mutated,
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

    await supabase.from("prompt_usage_logs").insert({
      user_id: user.id,
      kind: "chat_global",
      model: usedModel || aiSettings.activeTextModel,
    });
    const quotaAfter = await getUserQuotaStatus(supabase, user.id, user.email);

    return NextResponse.json({
      reply:
        toolActions.length > 0
          ? `Done — completed ${toolActions.join(", ").toLowerCase()} across your AccomplishAI workspace.`
          : "I checked your AccomplishAI workspace. What would you like to review or update next?",
      toolActions,
      mcpToolsUsed: mcpSession.mcpToolsUsed,
      createdReportId,
      updatedReport,
      mutated,
      model: usedModel || aiSettings.activeTextModel,
      quota: quotaAfter,
    });
  } catch (err) {
    console.error("[chat-global]", err);
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
