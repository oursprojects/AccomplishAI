import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { groqErrorResponse, groqJson } from "@/lib/ai/groq";
import { DAYS, REPORT_FIELD_META, REPORT_KEYS, reportDataSchema, type ReportData } from "@/lib/report-schema";
import type { DetectedField } from "@/lib/docx/types";

const requestSchema = z.object({
  rawNotes: z.string().trim().min(1, "Please enter or record some notes first.").max(15000),
  templateId: z.string().uuid().optional(),
  existingData: z.record(z.string(), z.string()).optional(),
});

const SYSTEM_PROMPT = `You convert a student intern's raw typed or spoken notes into a structured JSON object for an official university "Weekly Accomplishment Report" (Monday to Friday).

Return a single JSON object containing EVERY ONE of these exact keys (all string values, no nested objects or arrays):
${REPORT_KEYS.map((k) => `- "${k}": ${REPORT_FIELD_META[k].description}`).join("\n")}

Formatting & tone rules:
1. Rewrite casual or spoken notes into clear, concise, formal past-tense accomplishment statements matching an institutional report (e.g., "Attended the orientation where company rules and regulations were discussed", "Assisted in configuring network switches and updating cable labels").
2. Group tasks across Monday ("mon_accomplishments") through Friday ("fri_accomplishments") whenever days are mentioned. Separate multiple bullet items for the same day or reflection section with a single newline ("\\n") and do NOT add bullet symbols ("-", "•", "1.") because Word's native bullet list already renders them.
3. If a day has no work mentioned, leave that day's accomplishments and verified_by as "". Never fabricate tasks for unmentioned days.
4. Use the provided user profile defaults for "intern_name_last_first" (format: LASTNAME, FIRSTNAME MI.), "intern_name_first_last" (format: FIRSTNAME MI. LASTNAME), and "office" unless the notes explicitly override them.
5. For each day that has accomplishments, populate its "*_verified_by" field with the notes' verifier or the profile's default_verifier (if set); leave empty if neither is provided.
6. Format "date_from" and "date_to" like "November 16, 2026" when dates or a week are mentioned.
7. For "hours_this_week", use the hours stated in the notes (or count working days × default_daily_hours only when clearly implied, otherwise ""). For "total_hours_worked", compute previous_total_hours + hours_this_week if both are numeric and known, or use the total explicitly stated in the notes, otherwise "".
8. Extract any trainings/orientations/workshops into "new_trainings", blockers/issues into "problems_encountered", and how they were resolved into "solutions_done" (use "" if none mentioned).
9. Respond with valid JSON ONLY.`;

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

  const [{ data: profile }, { data: template }, { data: latestReport }] = await Promise.all([
    supabase
      .from("profiles")
      .select("name_last_first, name_first_last, office, default_verifier, default_daily_hours")
      .eq("id", user.id)
      .maybeSingle(),
    body.data.templateId
      ? supabase.from("templates").select("id, schema").eq("id", body.data.templateId).maybeSingle()
      : supabase.from("templates").select("id, schema").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
    supabase
      .from("reports")
      .select("structured_data")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const detectedFields = (Array.isArray(template?.schema) ? template.schema : []) as unknown as DetectedField[];
  const activeSchemaSummary = detectedFields.map((f) => ({ key: f.key, label: f.label, kind: f.kind }));
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
    detected_template_fields: activeSchemaSummary,
    existing_draft: body.data.existingData ?? null,
    raw_notes: body.data.rawNotes,
  };

  try {
    const { data, usage } = await groqJson<unknown>({
      system: SYSTEM_PROMPT,
      user: JSON.stringify(userPayload),
      temperature: 0.2,
      maxTokens: 2048,
    });

    const parsed = reportDataSchema.parse(data ?? {}) as ReportData;

    // Guarantee profile defaults fill blank identity fields so the report is ready to preview.
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

    return NextResponse.json({ structuredData: parsed, usage });
  } catch (err) {
    const mapped = groqErrorResponse(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
