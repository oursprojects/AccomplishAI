import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { getUserQuotaStatus } from "@/lib/admin";
import { inferNextWeekRange } from "@/lib/internship-calendar";
import { emptyReport, MAX_CHAT_MESSAGES, reportDataStrictSchema } from "@/lib/report-schema";
import type { Json } from "@/lib/supabase/database.types";

const chatMessageSchema = z.object({
  id: z.string().max(100),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
  toolActions: z.array(z.string().max(120)).optional(),
});

const createReportSchema = z.object({
  templateId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(120).optional().default(""),
  rawNotes: z.string().max(15000).optional().default(""),
  structuredData: reportDataStrictSchema.optional(),
  chatMessages: z.array(chatMessageSchema).max(MAX_CHAT_MESSAGES + 10).optional(),
  duplicateFromId: z.string().uuid().optional(),
  weekStartDate: z.string().trim().max(40).optional(),
  weekEndDate: z.string().trim().max(40).optional(),
});

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("reports")
    .select("id, template_id, title, raw_notes, structured_data, chat_messages, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await request.json().catch(() => ({}));
  const parsed = createReportSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report payload.", issues: parsed.error.issues }, { status: 400 });
  }

  const quota = await getUserQuotaStatus(supabase, user.id, user.email);
  if (!quota.canCreateReport) {
    return NextResponse.json(
      {
        error:
          quota.maxReports !== null
            ? `Saved report limit reached (${quota.reportsCount}/${quota.maxReports}). Delete an old report or ask your admin to increase your limit.`
            : "Your account is currently paused by the admin.",
        quota,
      },
      { status: 403 },
    );
  }

  let initialData = parsed.data.structuredData;
  let initialTitle = parsed.data.title;

  if (!initialData) {
    const [{ data: profile }, { data: existingRows }, { data: dupReport }] = await Promise.all([
      supabase
        .from("profiles")
        .select("name_last_first, name_first_last, office, internship_start_date")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("reports")
        .select("structured_data")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      parsed.data.duplicateFromId
        ? supabase
            .from("reports")
            .select("structured_data")
            .eq("id", parsed.data.duplicateFromId)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const seeded = emptyReport();
    const dupSrc =
      dupReport?.structured_data &&
      typeof dupReport.structured_data === "object" &&
      !Array.isArray(dupReport.structured_data)
        ? (dupReport.structured_data as Record<string, unknown>)
        : null;

    seeded.intern_name_last_first =
      (dupSrc && typeof dupSrc.intern_name_last_first === "string" && dupSrc.intern_name_last_first) ||
      profile?.name_last_first ||
      "";
    seeded.intern_name_first_last =
      (dupSrc && typeof dupSrc.intern_name_first_last === "string" && dupSrc.intern_name_first_last) ||
      profile?.name_first_last ||
      "";
    seeded.office =
      (dupSrc && typeof dupSrc.office === "string" && dupSrc.office) ||
      profile?.office ||
      "DNX";

    if (parsed.data.weekStartDate && parsed.data.weekEndDate) {
      seeded.date_from = parsed.data.weekStartDate;
      seeded.date_to = parsed.data.weekEndDate;
    } else {
      const existingPeriods = (existingRows ?? []).map((r) => {
        const obj =
          r.structured_data && typeof r.structured_data === "object" && !Array.isArray(r.structured_data)
            ? (r.structured_data as Record<string, unknown>)
            : {};
        return {
          date_from: typeof obj.date_from === "string" ? obj.date_from : "",
          date_to: typeof obj.date_to === "string" ? obj.date_to : "",
        };
      });

      const nextWeek = inferNextWeekRange({
        startIso: profile?.internship_start_date,
        existingReports: existingPeriods,
      });
      if (nextWeek) {
        seeded.date_from = nextWeek.fromText;
        seeded.date_to = nextWeek.toText;
        if (!initialTitle) {
          initialTitle = `Week ${nextWeek.weekNumber}`;
        }
      }
    }

    initialData = seeded;
  }

  const { data, error } = await supabase
    .from("reports")
    .insert({
      user_id: user.id,
      template_id: parsed.data.templateId ?? null,
      title: initialTitle,
      raw_notes: parsed.data.rawNotes,
      structured_data: initialData as unknown as Json,
      chat_messages: (parsed.data.chatMessages ?? []) as unknown as Json,
    })
    .select("id, template_id, title, raw_notes, structured_data, chat_messages, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ report: data }, { status: 201 });
}
