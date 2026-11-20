import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { checkBurstRateLimit, getAiSettings, getUserQuotaStatus } from "@/lib/admin";
import { groqErrorResponse } from "@/lib/ai/groq";
import { groqChatWithTools, type GroqMessage, type GroqTool } from "@/lib/ai/chat-tools";
import type { Json } from "@/lib/supabase/database.types";
import {
  DAYS,
  isReportKey,
  MAX_CHAT_MESSAGES,
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
    .max(MAX_CHAT_MESSAGES + 4),
  currentData: reportDataStrictSchema,
});

const BULLET_PREFIX = /^\s*(?:[-*•▪◦·–—]|\d+[.)])\s+/gm;
const INLINE_MARKDOWN = /[*_`]/g;

function cleanFieldValue(key: ReportKey, raw: unknown, maxDayBullets: number): string {
  if (raw === null || raw === undefined) return "";
  const str = (Array.isArray(raw) ? raw.map(String).join("\n") : String(raw)).replace(INLINE_MARKDOWN, "");
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
  return str.trim().slice(0, 120);
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
      name: "update_report_fields",
      description:
        "Fill, update, or clear fields on the Weekly Accomplishment Report. Only pass fields mentioned by the user; before clearing fields via clear_fields, verify whether they actually contain data.",
      parameters: {
        type: "object",
        properties: {
          ...Object.fromEntries(
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
          clear_fields: {
            type: "array",
            items: { type: "string", enum: [...REPORT_KEYS] },
            description: "Field keys to clear ONLY if they are currently non-empty.",
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
        "Save the intern's recurring name, office, or verifier defaults to their profile when they ask to remember them.",
      parameters: {
        type: "object",
        properties: {
          name_last_first: { type: "string", description: "Format: LASTNAME, FIRSTNAME MI." },
          name_first_last: { type: "string", description: "Format: FIRSTNAME MI. LASTNAME" },
          office: { type: "string" },
          default_verifier: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_report_status",
      description: "Inspect the current report data to verify which fields are currently filled or already empty.",
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

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid chat request." }, { status: 400 });
  }

  if (body.data.messages.length > MAX_CHAT_MESSAGES) {
    return NextResponse.json(
      {
        error: `Conversation context limit reached (${MAX_CHAT_MESSAGES} messages). Click Clear Chat to start a fresh thread — your document fields stay safe.`,
      },
      { status: 400 },
    );
  }

  const quotaBefore = await getUserQuotaStatus(supabase, user.id, user.email);
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

  const burst = await checkBurstRateLimit(supabase, user.id, quotaBefore.isAdmin);
  if (!burst.allowed) {
    return NextResponse.json(
      {
        error: `Too many requests in one minute (${burst.count}/${burst.limit} RPM). Please wait a few seconds before sending again.`,
      },
      { status: 429 },
    );
  }

  const [aiSettings, { data: profile }, { data: latestReport }] = await Promise.all([
    getAiSettings(supabase),
    supabase
      .from("profiles")
      .select("name_last_first, name_first_last, office, default_verifier, default_daily_hours")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("reports")
      .select("structured_data")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const workingData: ReportData = { ...body.data.currentData };
  if (!workingData.intern_name_last_first && profile?.name_last_first) {
    workingData.intern_name_last_first = profile.name_last_first;
  }
  if (!workingData.intern_name_first_last && profile?.name_first_last) {
    workingData.intern_name_first_last = profile.name_first_last;
  }
  if (!workingData.office) {
    workingData.office = profile?.office || "DNX";
  }

  const prevTotal =
    latestReport?.structured_data &&
    typeof latestReport.structured_data === "object" &&
    !Array.isArray(latestReport.structured_data)
      ? String((latestReport.structured_data as Record<string, unknown>).total_hours_worked ?? "")
      : "";

  const systemPrompt = `You are **Accomplish AI**, a friendly, helpful assistant dedicated strictly to helping a student intern complete their official 1-page **"2026 Weekly Accomplishment Report"** (.docx).

Today's date: ${new Date().toISOString().slice(0, 10)}
User profile defaults: ${JSON.stringify({
    name_last_first: profile?.name_last_first ?? "",
    name_first_last: profile?.name_first_last ?? "",
    office: profile?.office || "DNX",
    default_verifier: profile?.default_verifier ?? "",
    default_daily_hours: profile?.default_daily_hours ?? 8,
    previous_report_total_hours: prevTotal,
  })}
Current report fields (exact live state): ${JSON.stringify(workingData)}

CORE BEHAVIOR & STRICT RULES:
1. **Strictly Accomplished Tasks Only:** For \`mon_accomplishments\` through \`fri_accomplishments\`, record **ONLY actual work/tasks accomplished** (e.g., *"Attended internship orientation and role assignment meeting"*, *"Redesigned and published the DNX Solution landing page"*). **NEVER** put arrival times, departure/dismissal times (*"Arrived 7:00 AM"*, *"Went home at 9 PM"*, *"Dismissed at 4:30 PM"*), commute/boarding-house notes, or lunch breaks inside accomplishment entries.
2. **Apply Immediately & Never Be Strict:** When the user shares notes (English, Tagalog, Taglish, raw notes) or asks for edits, immediately call \`update_report_fields\` and apply everything provided. Never demand empty optional fields (*Verified By*, dates, hours, reflections)—users can fill those manually later or leave them for wet ink.
3. **Verify Before Clearing (No Fake Re-Clears):**
   - Inspect \`Current report fields\` (or \`get_report_status\`) before saying something was cleared.
   - If the user asks to clear a field that is **already empty (\`""\`)**, DO NOT call \`update_report_fields\` to clear it again and **DO NOT** display a Markdown table claiming it was cleared—warmly tell them it is **already cleared / empty**.
   - Only show cleared items in a table if \`cleared\` in the tool result actually cleared non-empty text in this turn.
4. **Past-Tense, Concise & Table-Fit:** Keep tool values plain text (no \`**\`, \`*\`, or \`-\` bullets), formalized into crisp **past-tense** English:
   - Max **1–${aiSettings.maxBulletsPerDay} short lines** per worked day (\`<= 12 words\` per line, separated by \`\\n\`).
   - Max **1–2 short lines** for \`new_trainings\`, \`problems_encountered\`, and \`solutions_done\`.
5. **Friendly & Strictly On-Topic:** Keep a warm, encouraging assistant tone, but **ONLY** assist with the Weekly Accomplishment Report, internship task summarization, and form editing. Politely decline unrelated topics (coding homework, trivia, general chat) and guide them back to their report.
6. **Markdown Output:** Reply cleanly in Markdown (**bold**, *italic*, and a compact Markdown table **only when fields were actually updated or cleared in this turn**). Keep it helpful and concise.`;

  const recentMessages = body.data.messages.slice(-10);
  const loopMessages: GroqMessage[] = [
    { role: "system", content: systemPrompt },
    ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const updatedKeys = new Set<ReportKey>();
  const toolActions: string[] = [];
  let usedModel = "";

  try {
    for (let step = 0; step < 3; step++) {
      const { completion, model } = await groqChatWithTools({
        messages: loopMessages,
        tools: TOOLS,
        temperature: 0.2,
        maxTokens: 1500,
        preferredModel: usedModel || aiSettings.activeTextModel,
      });
      usedModel = model;

      const msg = completion.choices[0]?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const reply = (msg.content ?? "").trim() || "Updated your report.";
        const status = computeStatus(workingData);

        const nextHistory = [
          ...body.data.messages.map((m, idx) => ({ id: `h-${idx}`, role: m.role, content: m.content })),
          {
            id: `a-${Date.now()}`,
            role: "assistant" as const,
            content: reply,
            ...(toolActions.length ? { toolActions } : {}),
          },
        ].slice(-MAX_CHAT_MESSAGES);

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

        if (name === "update_report_fields") {
          const changed: string[] = [];
          const cleared: string[] = [];
          const alreadyEmpty: string[] = [];

          for (const key of REPORT_KEYS) {
            if (key in args && args[key] !== undefined && args[key] !== null) {
              const cleaned = cleanFieldValue(key, args[key], aiSettings.maxBulletsPerDay);
              if (cleaned !== "" && cleaned !== workingData[key]) {
                workingData[key] = cleaned;
                updatedKeys.add(key);
                changed.push(key);
              }
            }
          }

          if (Array.isArray(args.clear_fields)) {
            for (const rawKey of args.clear_fields) {
              if (isReportKey(rawKey)) {
                if (workingData[rawKey].trim() !== "") {
                  workingData[rawKey] = "";
                  updatedKeys.add(rawKey);
                  changed.push(rawKey);
                  cleared.push(rawKey);
                } else {
                  alreadyEmpty.push(rawKey);
                }
              }
            }
          }

          if (profile?.default_verifier) {
            for (const d of DAYS) {
              if (workingData[`${d}_accomplishments`].trim() && !workingData[`${d}_verified_by`].trim()) {
                workingData[`${d}_verified_by`] = profile.default_verifier;
                updatedKeys.add(`${d}_verified_by`);
              }
            }
          }

          const updatedCount = changed.filter((k) => !cleared.includes(k)).length;
          if (updatedCount > 0) {
            toolActions.push(`Updated ${updatedCount} field${updatedCount === 1 ? "" : "s"}`);
          }
          if (cleared.length > 0) {
            toolActions.push(`Cleared ${cleared.length} field${cleared.length === 1 ? "" : "s"}`);
          }

          toolResult = {
            updated: changed,
            cleared,
            already_empty: alreadyEmpty,
            status: computeStatus(workingData),
          };
        } else if (name === "save_profile_defaults") {
          const patch: Record<string, string> = {};
          if (typeof args.name_last_first === "string" && args.name_last_first.trim()) {
            patch.name_last_first = args.name_last_first.trim().slice(0, 120);
          }
          if (typeof args.name_first_last === "string" && args.name_first_last.trim()) {
            patch.name_first_last = args.name_first_last.trim().slice(0, 120);
          }
          if (typeof args.office === "string" && args.office.trim()) {
            patch.office = args.office.trim().slice(0, 80);
          }
          if (typeof args.default_verifier === "string" && args.default_verifier.trim()) {
            patch.default_verifier = args.default_verifier.trim().slice(0, 120);
          }
          if (Object.keys(patch).length > 0) {
            await supabase.from("profiles").upsert({ id: user.id, ...patch }, { onConflict: "id" });
            toolActions.push("Saved profile defaults");
          }
          toolResult = { saved: Object.keys(patch) };
        } else if (name === "get_report_status") {
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
    await supabase.from("prompt_usage_logs").insert({
      user_id: user.id,
      kind: "chat_report",
      model: usedModel || aiSettings.activeTextModel,
    });
    const quotaAfter = await getUserQuotaStatus(supabase, user.id, user.email);

    return NextResponse.json({
      reply: "Your report has been updated in the preview.",
      structuredData: workingData,
      updatedKeys: Array.from(updatedKeys),
      toolActions,
      ...status,
      model: usedModel || aiSettings.activeTextModel,
      quota: quotaAfter,
    });
  } catch (err) {
    const mapped = groqErrorResponse(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
