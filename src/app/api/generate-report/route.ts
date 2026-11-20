import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { checkBurstRateLimit, getAiSettings, getUserQuotaStatus } from "@/lib/admin";
import { normalizeDateToLongFormat } from "@/lib/internship-calendar";
import { groqErrorResponse, groqJson } from "@/lib/ai/groq";
import { DAYS, REPORT_FIELD_META, REPORT_KEYS, reportDataSchema, type ReportData } from "@/lib/report-schema";

const requestSchema = z.object({
  rawNotes: z.string().trim().min(1, "Please enter or record some notes first.").max(8000),
  templateId: z.string().uuid().optional(),
  existingData: z.record(z.string(), z.string()).optional(),
});

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
      { error: `Too many requests in one minute (${burst.count}/${burst.limit} RPM). Wait a few seconds.` },
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

  const systemPrompt = `You convert a student intern's raw typed or spoken notes into a concise JSON object for a 1-page university "Weekly Accomplishment Report" (Monday to Friday).

Return a single JSON object with ALL of these string keys (no nested objects/arrays):
${REPORT_KEYS.map((k) => `- "${k}": ${REPORT_FIELD_META[k].description}`).join("\n")}

STRICT ACCOMPLISHED-TASK, PAST-TENSE & TABLE-FIT RULES (the entire report MUST fit cleanly on ONE page):
1. Include **STRICTLY actual tasks/work accomplished** in \`mon_accomplishments\`–\`fri_accomplishments\` as **past-tense** formal action statements (e.g., "Attended orientation on company rules", "Configured network switches in the server room"). NEVER include arrival times, departure/going-home times ("Arrived 7 AM", "Went home at 9 PM"), breaks, or commute notes. Never include markdown symbols or small talk.
2. Keep each worked day to **1-${aiSettings.maxBulletsPerDay} concise lines** (maximum ~12 words / <= 95 chars per line).
3. Separate multiple items for the same day/section with a single newline ("\\n"). Do NOT add bullet symbols ("-", "•", "1.").
4. Leave unmentioned days completely blank (""). Never invent tasks.
5. Keep "new_trainings", "problems_encountered", and "solutions_done" summarized to **1-2 short lines** (<= 12 words per line, or "" if none mentioned).
6. Use profile defaults for "intern_name_last_first" (LASTNAME, FIRSTNAME MI.), "intern_name_first_last" (FIRSTNAME MI. LASTNAME), and "office" unless overridden in notes.
7. Populate "*_verified_by" only for days that have accomplishments using notes or profile default_verifier (otherwise "").
8. Format "date_from" and "date_to" like "November 16, 2026".
9. Set "hours_this_week" if stated or clearly implied by worked days × default_daily_hours, and "total_hours_worked" as previous_total + hours_this_week if numeric, else "".
10. Respond with valid JSON only.`;

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
      office: profile?.office || "DNX",
      default_verifier: profile?.default_verifier ?? "",
      default_daily_hours: profile?.default_daily_hours ?? 8,
    },
    previous_report_total_hours: prevTotal,
    raw_notes: body.data.rawNotes,
  };

  try {
    const { data, usage, model } = await groqJson<unknown>({
      system: systemPrompt,
      user: JSON.stringify(userPayload),
      temperature: 0.2,
      maxTokens: 2048,
      preferredModel: aiSettings.activeTextModel,
    });

    const parsed = reportDataSchema.parse(data ?? {}) as ReportData;

    if (!parsed.intern_name_last_first && profile?.name_last_first) {
      parsed.intern_name_last_first = profile.name_last_first;
    }
    if (!parsed.intern_name_first_last && profile?.name_first_last) {
      parsed.intern_name_first_last = profile.name_first_last;
    }
    if (!parsed.office) {
      parsed.office = profile?.office || "DNX";
    }
    if (profile?.default_verifier) {
      for (const d of DAYS) {
        if (parsed[`${d}_accomplishments`].trim() && !parsed[`${d}_verified_by`].trim()) {
          parsed[`${d}_verified_by`] = profile.default_verifier;
        }
      }
    }

    parsed.intern_name_last_first = parsed.intern_name_last_first.toUpperCase();
    parsed.intern_name_first_last = parsed.intern_name_first_last.toUpperCase();
    for (const d of DAYS) {
      parsed[`${d}_verified_by`] = parsed[`${d}_verified_by`].toUpperCase();
    }
    parsed.date_from = normalizeDateToLongFormat(parsed.date_from);
    parsed.date_to = normalizeDateToLongFormat(parsed.date_to);

    await supabase.from("prompt_usage_logs").insert({
      user_id: user.id,
      kind: "generate_report",
      model,
    });

    const quotaAfter = await getUserQuotaStatus(supabase, user.id, user.email);
    return NextResponse.json({ structuredData: parsed, usage, model, quota: quotaAfter });
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
