import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { getUserQuotaStatus } from "@/lib/admin";
import { groqErrorResponse, groqJson } from "@/lib/ai/groq";
import { DAYS, REPORT_FIELD_META, REPORT_KEYS, reportDataSchema, type ReportData } from "@/lib/report-schema";

const requestSchema = z.object({
  rawNotes: z.string().trim().min(1, "Please enter or record some notes first.").max(8000),
  templateId: z.string().uuid().optional(),
  existingData: z.record(z.string(), z.string()).optional(),
});

const SYSTEM_PROMPT = `You convert a student intern's raw typed or spoken notes into a concise JSON object for a 1-page university "Weekly Accomplishment Report" (Monday to Friday).

Return a single JSON object with ALL of these string keys (no nested objects/arrays):
${REPORT_KEYS.map((k) => `- "${k}": ${REPORT_FIELD_META[k].description}`).join("\n")}

STRICT CONCISENESS & FORMATTING RULES (the entire report MUST fit cleanly on ONE page):
1. Do NOT write too many bullets or long paragraphs. Keep each worked day to 1-3 short, crisp bullet lines (maximum ~12-14 words per bullet).
2. Rewrite casual/spoken notes into formal past-tense institutional statements (e.g., "Attended orientation on company rules and regulations", "Configured network switches in the server room").
3. Separate multiple items for the same day/section with a single newline ("\\n"). Do NOT add bullet symbols ("-", "•", "1.").
4. Leave unmentioned days completely blank (""). Never invent tasks.
5. Keep "new_trainings", "problems_encountered", and "solutions_done" concise (max 1-2 short lines each, <= 14 words per line, or "" if none mentioned).
6. Use profile defaults for "intern_name_last_first" (LASTNAME, FIRSTNAME MI.), "intern_name_first_last" (FIRSTNAME MI. LASTNAME), and "office" unless overridden in notes.
7. Populate "*_verified_by" only for days that have accomplishments using notes or profile default_verifier (otherwise "").
8. Format "date_from" and "date_to" like "November 16, 2026".
9. Set "hours_this_week" if stated or clearly implied by worked days × default_daily_hours, and "total_hours_worked" as previous_total + hours_this_week if numeric, else "".
10. Respond with valid JSON only.`;

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid request payload." },
      { status: 400 },
    );
  }

  // Enforce admin-configured per-user daily prompt rate limit
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

  const prevTotal =
    latestReport?.structured_data &&
    typeof latestReport.structured_data === "object" &&
    !Array.isArray(latestReport.structured_data)
      ? String((latestReport.structured_data as Record<string, unknown>).total_hours_worked ?? "")
      : "";

  const userPayload = {
    today: new Date().toISOString().slice(0, 10),
    profile_defaults: {
      intern_name_last_first: profile?.name_last_first ?? "",
      intern_name_first_last: profile?.name_first_last ?? "",
      office: profile?.office || "YML",
      default_verifier: profile?.default_verifier ?? "",
      default_daily_hours: profile?.default_daily_hours ?? 8,
    },
    previous_report_total_hours: prevTotal,
    raw_notes: body.data.rawNotes,
  };

  try {
    const { data, usage, model } = await groqJson<unknown>({
      system: SYSTEM_PROMPT,
      user: JSON.stringify(userPayload),
      temperature: 0.2,
      maxTokens: 2048,
    });

    const parsed = reportDataSchema.parse(data ?? {}) as ReportData;

    if (!parsed.intern_name_last_first && profile?.name_last_first) {
      parsed.intern_name_last_first = profile.name_last_first;
    }
    if (!parsed.intern_name_first_last && profile?.name_first_last) {
      parsed.intern_name_first_last = profile.name_first_last;
    }
    if (!parsed.office) {
      parsed.office = profile?.office || "YML";
    }
    if (profile?.default_verifier) {
      for (const d of DAYS) {
        if (parsed[`${d}_accomplishments`].trim() && !parsed[`${d}_verified_by`].trim()) {
          parsed[`${d}_verified_by`] = profile.default_verifier;
        }
      }
    }

    await supabase.from("prompt_usage_logs").insert({
      user_id: user.id,
      kind: "generate_report",
      model,
    });

    const quotaAfter = await getUserQuotaStatus(supabase, user.id, user.email);
    return NextResponse.json({ structuredData: parsed, usage, model, quota: quotaAfter });
  } catch (err) {
    const mapped = groqErrorResponse(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
