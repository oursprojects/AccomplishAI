import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { getUserQuotaStatus } from "@/lib/admin";
import { groqErrorResponse } from "@/lib/ai/groq";
import { groqChatWithTools, type GroqMessage, type GroqTool } from "@/lib/ai/chat-tools";
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
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(6000),
      }),
    )
    .min(1)
    .max(20),
  currentData: reportDataStrictSchema,
});

const BULLET_PREFIX = /^\s*(?:[-*•▪◦·–—]|\d+[.)])\s+/gm;

function cleanFieldValue(key: ReportKey, raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const str = Array.isArray(raw) ? raw.map(String).join("\n") : String(raw);
  if (REPORT_FIELD_META[key].kind === "list") {
    return str
      .split(/\r?\n/)
      .map((l) => l.replace(BULLET_PREFIX, "").trim())
      .filter(Boolean)
      .slice(0, 4) // Keep each section concise for 1-page layout
      .join("\n");
  }
  return str.trim();
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
  } else {
    const dayNames: Record<(typeof DAYS)[number], string> = {
      mon: "Monday",
      tue: "Tuesday",
      wed: "Wednesday",
      thu: "Thursday",
      fri: "Friday",
    };
    for (const d of DAYS) {
      if (!data[`${d}_accomplishments`].trim()) {
        missingDetails.push({ key: `${d}_accomplishments`, label: `${dayNames[d]} accomplishments (if worked)` });
      }
    }
  }

  if (!data.hours_this_week.trim()) {
    missingEssential.push({ key: "hours_this_week", label: "Hours Worked This Week" });
  }
  if (!data.total_hours_worked.trim()) {
    missingDetails.push({ key: "total_hours_worked", label: "Total Hours Worked (previous + this week)" });
  }
  if (!data.new_trainings.trim()) {
    missingDetails.push({ key: "new_trainings", label: "New trainings (or None)" });
  }
  if (!data.problems_encountered.trim()) {
    missingDetails.push({ key: "problems_encountered", label: "Problems encountered (or None)" });
  }
  if (!data.solutions_done.trim()) {
    missingDetails.push({ key: "solutions_done", label: "Solutions done (or None)" });
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
        "Fill or update one or more fields on the Weekly Accomplishment Report. Only pass fields mentioned by the user or clearly derivable from profile defaults; do not overwrite existing fields with empty strings.",
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
                    ? `${REPORT_FIELD_META[k].description}. 1-3 concise formal lines separated by \\n, max 14 words per line, NO bullet characters.`
                    : REPORT_FIELD_META[k].description,
              },
            ]),
          ),
          clear_fields: {
            type: "array",
            items: { type: "string", enum: [...REPORT_KEYS] },
            description: "Optional list of field keys to clear to empty string.",
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
        "Save the intern's recurring name, office, or verifier defaults to their profile when they introduce themselves or ask to remember their details.",
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
      description: "Inspect the current report data and see which required or optional fields are still missing.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid chat request." }, { status: 400 });
  }

  const quotaBefore = await getUserQuotaStatus(supabase, user.id, user.email);
  if (quotaBefore.isBlocked) {
    return NextResponse.json(
      { error: "Your AI prompt access is currently paused by the admin. Contact mikorynosantiago@gmail.com." },
      { status: 403 },
    );
  }
  if (!quotaBefore.allowed) {
    return NextResponse.json(
      {
        error: `Daily AI prompt limit reached (${quotaBefore.usedToday}/${quotaBefore.dailyLimit} used today). Ask mikorynosantiago@gmail.com to increase your limit.`,
        quota: quotaBefore,
      },
      { status: 429 },
    );
  }

  const [{ data: profile }, { data: latestReport }] = await Promise.all([
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
  // Seed blanks from profile defaults before the turn begins
  if (!workingData.intern_name_last_first && profile?.name_last_first) {
    workingData.intern_name_last_first = profile.name_last_first;
  }
  if (!workingData.intern_name_first_last && profile?.name_first_last) {
    workingData.intern_name_first_last = profile.name_first_last;
  }
  if (!workingData.office) {
    workingData.office = profile?.office || "YML";
  }

  const prevTotal =
    latestReport?.structured_data &&
    typeof latestReport.structured_data === "object" &&
    !Array.isArray(latestReport.structured_data)
      ? String((latestReport.structured_data as Record<string, unknown>).total_hours_worked ?? "")
      : "";

  const systemPrompt = `You are Accomplish AI, a friendly, concise assistant that helps a student intern fill out their official 1-page "2026 Weekly Accomplishment Report" through conversation.

Today's date: ${new Date().toISOString().slice(0, 10)}
User profile defaults: ${JSON.stringify({
    name_last_first: profile?.name_last_first ?? "",
    name_first_last: profile?.name_first_last ?? "",
    office: profile?.office || "YML",
    default_verifier: profile?.default_verifier ?? "",
    default_daily_hours: profile?.default_daily_hours ?? 8,
    previous_report_total_hours: prevTotal,
  })}
Current report fields: ${JSON.stringify(workingData)}

HOW TO WORK:
1. Whenever the user gives any information (name, dates, daily tasks, hours, verifier, trainings, problems, solutions, or "none"), IMMEDIATELY call \`update_report_fields\` with cleanly rewritten, formal past-tense institutional statements.
2. Keep every list field concise so the report fits cleanly on ONE page: max 1-3 short bullets per worked day (<= 14 words each, separated by \\n, NO "-" or "•" prefixes), and max 1-2 short lines for trainings/problems/solutions.
3. If the user provides their full name for the first time (or in one format), derive BOTH \`intern_name_last_first\` ("LASTNAME, FIRSTNAME MI.") and \`intern_name_first_last\` ("FIRSTNAME MI. LASTNAME") and also call \`save_profile_defaults\` if their profile defaults are currently empty.
4. For any worked day where verifier isn't specified, use \`default_verifier\` if available. If the user says "none" for trainings/problems/solutions, set that field to "None".
5. NEVER invent tasks, dates, or hours the user did not provide.
6. After tool calls finish, check what is still missing from the tool response:
   - If required info or important details are missing or incomplete, reply concisely telling the user **what you just filled** and clearly listing **what specific information is still needed** (in short bullet points) so they can reply with it.
   - If all essential information is filled, confirm what's in the report and let them know it's ready in the 1-Page Preview to Print/Save PDF, Download .docx, or Save to History.`;

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
        preferredModel: usedModel || undefined,
      });
      usedModel = model;

      const msg = completion.choices[0]?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const reply = (msg.content ?? "").trim() || "Updated your report.";
        const status = computeStatus(workingData);

        await supabase.from("prompt_usage_logs").insert({
          user_id: user.id,
          kind: "chat_report",
          model: usedModel,
        });
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
          for (const key of REPORT_KEYS) {
            if (key in args && args[key] !== undefined && args[key] !== null) {
              const cleaned = cleanFieldValue(key, args[key]);
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
                workingData[rawKey] = "";
                updatedKeys.add(rawKey);
                changed.push(rawKey);
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
          if (changed.length > 0) {
            toolActions.push(`Updated ${changed.length} field${changed.length === 1 ? "" : "s"}`);
          }
          toolResult = { updated: changed, status: computeStatus(workingData) };
        } else if (name === "save_profile_defaults") {
          const patch: Record<string, string> = {};
          if (typeof args.name_last_first === "string" && args.name_last_first.trim()) {
            patch.name_last_first = args.name_last_first.trim();
          }
          if (typeof args.name_first_last === "string" && args.name_first_last.trim()) {
            patch.name_first_last = args.name_first_last.trim();
          }
          if (typeof args.office === "string" && args.office.trim()) {
            patch.office = args.office.trim();
          }
          if (typeof args.default_verifier === "string" && args.default_verifier.trim()) {
            patch.default_verifier = args.default_verifier.trim();
          }
          if (Object.keys(patch).length > 0) {
            await supabase.from("profiles").upsert({ id: user.id, ...patch }, { onConflict: "id" });
            toolActions.push("Saved profile defaults");
          }
          toolResult = { saved: Object.keys(patch) };
        } else if (name === "get_report_status") {
          toolResult = computeStatus(workingData);
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
      model: usedModel || "openai/gpt-oss-120b",
    });
    const quotaAfter = await getUserQuotaStatus(supabase, user.id, user.email);

    return NextResponse.json({
      reply:
        status.missingEssential.length > 0
          ? `I still need: ${status.missingEssential.map((m) => m.label).join(", ")}.`
          : "Your report has been updated in the preview.",
      structuredData: workingData,
      updatedKeys: Array.from(updatedKeys),
      toolActions,
      ...status,
      model: usedModel,
      quota: quotaAfter,
    });
  } catch (err) {
    const mapped = groqErrorResponse(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
