import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { checkBurstRateLimit, getQuotaAndAiSettings, getUserQuotaStatus } from "@/lib/admin";
import {
  buildInternshipWeeks,
  inferNextWeekRange,
  normalizeHolidayMondays,
  parseHoursNumber,
} from "@/lib/internship-calendar";
import { groqErrorResponse } from "@/lib/ai/groq";
import { groqChatWithTools, type GroqMessage } from "@/lib/ai/chat-tools";
import { emptyReport, reportDataSchema } from "@/lib/report-schema";
import { computeReportStatus } from "@/lib/mcp/accomplish-mcp-server";
import { openAccomplishMcpSession, type AccomplishMcpSession } from "@/lib/mcp/in-memory-bridge";

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
    .max(40),
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
    const maxChatMessages = aiSettings.maxChatMessages;

    if (body.data.messages.length > maxChatMessages) {
      return NextResponse.json(
        {
          error: `Global assistant conversation limit reached (${maxChatMessages} messages). Click Clear Chat to start fresh.`,
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

    const systemPrompt = `You are the **Overall Accomplish AI Assistant**, a system-wide assistant for AccomplishAI that sees and manages **everything** in the user's internship workspace (all reports across weeks, OJT hours progress, profile defaults, holiday schedule, and official 8.5" x 11" template status) via Supabase-backed **MCP tools**.

Current page: ${body.data.currentPath}
Today's date: ${new Date().toISOString().slice(0, 10)}
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

CAPABILITIES & RULES:
1. **Cross-System Intelligence:** Answer questions spanning multiple weeks (e.g., summarizing accomplishments across weeks, spotting draft/incomplete reports, checking cumulative hours, planning Dec/Jan holiday schedules, or guiding where in the app to edit templates/profile).
2. **Real MCP Tool Actions:** Use the MCP tools whenever the user asks to inspect detailed report fields (\`get_report_fields\`), refresh live stats (\`list_reports\`, \`get_ojt_hours_summary\`, \`get_workspace_overview\`), create a new report (\`create_weekly_report\`), edit a specific report (\`set_report_fields\` / \`clear_report_fields\` with \`report_id\`), mark/unmark holidays (\`update_holiday_weeks\`), or update profile defaults (\`save_profile_defaults\`).
3. **Strict Data Accuracy:** Never invent accomplishments, dates, or hours that aren't in Supabase. When formatting report updates, follow past-tense formal wording, ALL CAPS names, and \`Month Day, Year\` dates.
4. **Clean Markdown:** Use crisp Markdown bullets, bold highlights, and compact tables when helpful. NEVER output raw HTML tags like \`<br>\`.`;

    const recentMessages = body.data.messages.slice(-10);
    const loopMessages: GroqMessage[] = [
      { role: "system", content: systemPrompt },
      ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const toolActions: string[] = [];
    let createdReportId: string | undefined;
    let mutated = false;
    let usedModel = "";

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
        if (info.mutated) mutated = true;
      },
    });

    for (let step = 0; step < 5; step++) {
      const { completion, model } = await groqChatWithTools({
        messages: loopMessages,
        tools: mcpSession.groqTools,
        toolChoice: "auto",
        temperature: 0.25,
        maxTokens: 1500,
        preferredModel: usedModel || aiSettings.activeTextModel,
      });
      usedModel = model;

      const msg = completion.choices[0]?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const reply = ((msg.content ?? "").trim() || "Done! Checked your workspace via MCP.").replace(
          /<br\s*\/?>/gi,
          "; ",
        );

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
