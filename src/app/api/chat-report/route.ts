import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { checkBurstRateLimit, getAiSettings, getUserQuotaStatus } from "@/lib/admin";
import {
  buildInternshipWeeks,
  normalizeDateToLongFormat,
  parseHoursNumber,
  resolveWeekNumber,
} from "@/lib/internship-calendar";
import { groqErrorResponse } from "@/lib/ai/groq";
import { groqChatWithTools, type GroqMessage, type GroqTool } from "@/lib/ai/chat-tools";
import type { Json } from "@/lib/supabase/database.types";
import {
  DAYS,
  isReportKey,
  REPORT_FIELD_META,
  REPORT_KEYS,
  reportDataStrictSchema,
  type ReportData,
  type ReportKey,
} from "@/lib/report-schema";

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

const BULLET_PREFIX = /^\s*(?:[-*•▪◦·–—]|\d+[.)])\s+/gm;
const INLINE_MARKDOWN = /[*_`]/g;

function cleanFieldValue(key: ReportKey, raw: unknown, maxDayBullets: number): string {
  if (raw === null || raw === undefined) return "";
  const str = (Array.isArray(raw) ? raw.map(String).join("\n") : String(raw))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(INLINE_MARKDOWN, "");
  if (REPORT_FIELD_META[key].kind === "list") {
    const isReflection = key === "new_trainings" || key === "problems_encountered" || key === "solutions_done";
    const maxLines = isReflection ? 2 : maxDayBullets;
    return str
      .split(/\r?\n/)
      .map((l) => l.replace(BULLET_PREFIX, "").trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, maxLines)
      .join("\n");
  }
  const trimmed = str.trim().slice(0, 120);
  if (key === "date_from" || key === "date_to") {
    return normalizeDateToLongFormat(trimmed);
  }
  if (key === "intern_name_last_first" || key === "intern_name_first_last" || key.endsWith("_verified_by")) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

function computeStatus(data: ReportData) {
  const missingEssential: Array<{ key: string; label: string }> = [];
  const missingDetails: Array<{ key: string; label: string }> = [];

  if (!data.intern_name_last_first.trim()) {
    missingEssential.push({ key: "intern_name_last_first", label: "Intern Name (LASTNAME, FIRSTNAME MI.)" });
  }
  if (!data.intern_name_first_last.trim()) {
    missingEssential.push({ key: "intern_name_first_last", label: "Signature Name (FIRSTNAME MI. LASTNAME)" });
  }
  if (!data.office.trim()) {
    missingEssential.push({ key: "office", label: "Office / Department" });
  }
  if (!data.date_from.trim()) {
    missingEssential.push({ key: "date_from", label: "Week Start Date (From)" });
  }
  if (!data.date_to.trim()) {
    missingEssential.push({ key: "date_to", label: "Week End Date (To)" });
  }

  const anyDayFilled = DAYS.some((d) => data[`${d}_accomplishments`].trim().length > 0);
  if (!anyDayFilled) {
    missingEssential.push({ key: "mon_accomplishments", label: "Daily Accomplishments (Mon–Fri)" });
  }

  if (!data.hours_this_week.trim()) {
    missingEssential.push({ key: "hours_this_week", label: "Hours Worked This Week" });
  }
  if (!data.total_hours_worked.trim()) {
    missingDetails.push({ key: "total_hours_worked", label: "Total Hours Worked (previous + this week)" });
  }

  return {
    isComplete: missingEssential.length === 0,
    missingEssential,
    missingDetails,
  };
}

const TOOLS: GroqTool[] = [
  {
    type: "function",
    function: {
      name: "set_report_fields",
      description:
        "Create or update one or more fields on the Weekly Accomplishment Report. Pass ONLY the fields being set or updated with non-empty values. Use exact 'Month Day, Year' format (e.g. 'November 9, 2026') for date_from and date_to, and ALL CAPS for names.",
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          REPORT_KEYS.map((k) => [
            k,
            {
              type: "string",
              description:
                REPORT_FIELD_META[k].kind === "list"
                  ? `${REPORT_FIELD_META[k].description}. Strictly accomplished tasks only (no arrival/departure times), past-tense formal lines separated by \\n, max 12 words per line, NO bullet characters.`
                  : REPORT_FIELD_META[k].description,
            },
          ]),
        ),
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_report_fields",
      description:
        "Delete/clear one or more report fields to empty string, or clear all fields when clear_all is true. Checks whether each requested field actually contains content first.",
      parameters: {
        type: "object",
        properties: {
          fields: {
            type: "array",
            items: { type: "string", enum: [...REPORT_KEYS] },
            description: "List of field keys to clear.",
          },
          clear_all: {
            type: "boolean",
            description: "Set true ONLY if the user explicitly asks to clear/wipe the entire report.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_profile_defaults",
      description:
        "Save the intern's recurring name, office, verifier, or internship_start_date (YYYY-MM-DD) when they introduce themselves or mention when their internship began.",
      parameters: {
        type: "object",
        properties: {
          name_last_first: { type: "string", description: "ALL CAPS format: LASTNAME, FIRSTNAME MI." },
          name_first_last: { type: "string", description: "ALL CAPS format: FIRSTNAME MI. LASTNAME" },
          office: { type: "string" },
          default_verifier: { type: "string", description: "ALL CAPS verifier name" },
          internship_start_date: {
            type: "string",
            description: "ISO date YYYY-MM-DD of when Week 1 began (e.g. 2026-11-09).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_report_fields",
      description: "Read all current report field values and check which fields are filled or already empty.",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function persistConversation(
  supabase: Awaited<ReturnType<typeof getUser>>["supabase"],
  userId: string,
  reportId: string | null | undefined,
  workingData: ReportData,
  nextHistory: Array<{ id: string; role: "user" | "assistant"; content: string; toolActions?: string[] }>,
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

  const [aiSettings, quotaBefore] = await Promise.all([
    getAiSettings(supabase),
    getUserQuotaStatus(supabase, user.id, user.email),
  ]);

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

  const latestPrev = previousReports[0] ?? null;
  const prevTotalRaw = latestPrev?.total_hours_worked ?? "";
  const prevTotalNum = parseHoursNumber(prevTotalRaw) ?? 0;

  const startIso = profile?.internship_start_date ?? null;
  const calendarWeeks = buildInternshipWeeks(startIso, 12);
  const currentWeekNumber = resolveWeekNumber(startIso, workingData.date_from);

  const systemPrompt = `You are **Accomplish AI**, a friendly, helpful assistant dedicated strictly to helping a student intern complete their official 1-page **"2026 Weekly Accomplishment Report"** (.docx).

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
   - Every Weekly Accomplishment Report strictly covers **Monday (\`date_from\`) to Friday (\`date_to\`)**.
   - Use \`Internship Mon–Fri Calendar\` above when resolving "1st week", "Week 2", "this week", etc.
   - If the user mentions when their internship began (e.g. *"we started November 9"*), call \`save_profile_defaults\` with \`internship_start_date: "YYYY-MM-DD"\` AND set \`date_from\`/\`date_to\` using that week's Monday–Friday.
3. **Cumulative Total Hours Worked (\`total_hours_worked\`):**
   - \`total_hours_worked\` = \`${prevTotalNum} + hours_this_week\`. Always compute and update \`total_hours_worked\` whenever \`hours_this_week\` is known or calculated!
4. **Always Execute Real CRUD Tools:**
   - Whenever the user asks to **add, fill, translate, edit, update, replace, remove, delete, or clear** anything on the report, **ALWAYS call \`set_report_fields\` or \`clear_report_fields\`** BEFORE replying.
5. **Strictly Accomplished Tasks Only:** For \`mon_accomplishments\` through \`fri_accomplishments\`, record **ONLY actual work/tasks accomplished**. **NEVER** put arrival times, departure/dismissal times (*"Arrived 7:00 AM"*, *"Went home at 9 PM"*), commute/boarding-house notes, or lunch breaks inside accomplishment entries.
6. **Verify Before Clearing (No Fake Re-Clears):**
   - If the requested field(s) are **already \`""\`**, DO NOT pretend you cleared them and DO NOT show a table of cleared items—simply reply warmly that those fields are **already cleared / empty**.
7. **Past-Tense, Concise & Table-Fit:** Keep tool values plain text (no \`**\`, \`*\`, or \`-\` bullets), formalized into crisp **past-tense** English:
   - Max **1–${aiSettings.maxBulletsPerDay} short lines** per worked day (\`<= 12 words\` per line, separated by \`\\n\`).
   - Max **1–2 short lines** for \`new_trainings\`, \`problems_encountered\`, and \`solutions_done\`.
8. **Friendly & Strictly On-Topic:** Keep a warm, encouraging tone strictly focused on the Weekly Accomplishment Report, internship calendar/hours, and form editing.
9. **Clean Markdown Formatting (NO HTML Tags):**
   - Format replies in clean Markdown (**bold**, *italic*, and a compact Markdown table **only when fields were actually updated or cleared in this turn**).
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

  try {
    for (let step = 0; step < 5; step++) {
      const { completion, model } = await groqChatWithTools({
        messages: loopMessages,
        tools: TOOLS,
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

        const reply = (draftReply || "Updated your report.").replace(/<br\s*\/?>/gi, "; ");
        const status = computeStatus(workingData);

        const nextHistory = [
          ...body.data.messages.map((m, idx) => ({ id: `h-${idx}`, role: m.role, content: m.content })),
          {
            id: `a-${Date.now()}`,
            role: "assistant" as const,
            content: reply,
            ...(toolActions.length ? { toolActions } : {}),
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
        const name = tc.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }

        let toolResult: unknown = {};

        if (name === "set_report_fields" || name === "update_report_fields") {
          const changed: string[] = [];
          for (const key of REPORT_KEYS) {
            if (key in args && args[key] !== undefined && args[key] !== null) {
              const cleaned = cleanFieldValue(key, args[key], aiSettings.maxBulletsPerDay);
              if (cleaned !== "" && cleaned !== workingData[key]) {
                workingData[key] = cleaned;
                updatedKeys.add(key);
                changed.push(key);
                didMutateThisTurn = true;
              }
            }
          }

          if (changed.includes("hours_this_week") && !changed.includes("total_hours_worked")) {
            const weekHoursNum = parseHoursNumber(workingData.hours_this_week);
            if (weekHoursNum !== null) {
              const autoTotal = String(prevTotalNum + weekHoursNum);
              if (autoTotal !== workingData.total_hours_worked) {
                workingData.total_hours_worked = autoTotal;
                updatedKeys.add("total_hours_worked");
                changed.push("total_hours_worked");
              }
            }
          }

          if (profile?.default_verifier) {
            const upperVerifier = profile.default_verifier.toUpperCase();
            for (const d of DAYS) {
              if (workingData[`${d}_accomplishments`].trim() && !workingData[`${d}_verified_by`].trim()) {
                workingData[`${d}_verified_by`] = upperVerifier;
                updatedKeys.add(`${d}_verified_by`);
              }
            }
          }

          if (changed.length > 0) {
            toolActions.push(`Updated ${changed.length} field${changed.length === 1 ? "" : "s"}`);
          }
          toolResult = { updated: changed, status: computeStatus(workingData) };
        } else if (name === "clear_report_fields") {
          const cleared: string[] = [];
          const alreadyEmpty: string[] = [];
          const targets: ReportKey[] = args.clear_all === true
            ? [...REPORT_KEYS]
            : Array.isArray(args.fields)
              ? args.fields.filter(isReportKey)
              : [];

          for (const key of targets) {
            if (workingData[key].trim() !== "") {
              workingData[key] = "";
              updatedKeys.add(key);
              cleared.push(key);
              didMutateThisTurn = true;
            } else {
              alreadyEmpty.push(key);
            }
          }

          if (cleared.length > 0) {
            toolActions.push(`Cleared ${cleared.length} field${cleared.length === 1 ? "" : "s"}`);
          }
          toolResult = { cleared, already_empty: alreadyEmpty, status: computeStatus(workingData) };
        } else if (name === "save_profile_defaults") {
          const patch: Record<string, string> = {};
          if (typeof args.name_last_first === "string" && args.name_last_first.trim()) {
            patch.name_last_first = args.name_last_first.trim().toUpperCase().slice(0, 120);
          }
          if (typeof args.name_first_last === "string" && args.name_first_last.trim()) {
            patch.name_first_last = args.name_first_last.trim().toUpperCase().slice(0, 120);
          }
          if (typeof args.office === "string" && args.office.trim()) {
            patch.office = args.office.trim().slice(0, 80);
          }
          if (typeof args.default_verifier === "string" && args.default_verifier.trim()) {
            patch.default_verifier = args.default_verifier.trim().toUpperCase().slice(0, 120);
          }
          if (
            typeof args.internship_start_date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(args.internship_start_date.trim())
          ) {
            patch.internship_start_date = args.internship_start_date.trim();
          }
          if (Object.keys(patch).length > 0) {
            await supabase.from("profiles").upsert({ id: user.id, ...patch }, { onConflict: "id" });
            toolActions.push("Saved profile defaults");
          }
          toolResult = { saved: Object.keys(patch) };
        } else if (name === "get_report_fields" || name === "get_report_status") {
          toolResult = { ...computeStatus(workingData), current_data: workingData };
        }

        loopMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult),
        });
      }
    }

    const status = computeStatus(workingData);
    const fallbackReply =
      toolActions.length > 0
        ? "Your report has been updated in the preview."
        : "No changes were needed.";

    const nextHistory = [
      ...body.data.messages.map((m, idx) => ({ id: `h-${idx}`, role: m.role, content: m.content })),
      {
        id: `a-${Date.now()}`,
        role: "assistant" as const,
        content: fallbackReply,
        ...(toolActions.length ? { toolActions } : {}),
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
      ...status,
      model: usedModel || aiSettings.activeTextModel,
      quota: quotaAfter,
    });
  } catch (err) {
    const mapped = groqErrorResponse(err);
    return NextResponse.json(
      { error: mapped.message, ...(mapped.retryAfterSeconds ? { retryAfterSeconds: mapped.retryAfterSeconds } : {}) },
      {
        status: mapped.status,
        ...(mapped.retryAfterSeconds ? { headers: { "Retry-After": String(mapped.retryAfterSeconds) } } : {}),
      },
    );
  }
}
