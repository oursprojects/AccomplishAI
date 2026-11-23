import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseJsonBody, safeServerError } from "@/lib/api-utils";
import { getUser } from "@/lib/supabase/server";
import { getUserQuotaStatus } from "@/lib/admin";
import {
  getReportWeekMondayIso,
  inferNextWeekRange,
  normalizeDateToLongFormat,
  normalizeHolidayMondays,
  resolveWeekCategory,
} from "@/lib/internship-calendar";
import { emptyReport, reportDataStrictSchema } from "@/lib/report-schema";
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
  chatMessages: z.array(chatMessageSchema).max(100).optional(),
  duplicateFromId: z.string().uuid().optional(),
  weekStartDate: z.string().trim().max(40).optional(),
  weekEndDate: z.string().trim().max(40).optional(),
});

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");

  const { data, error } = await supabase
    .from("reports")
    .select("id, template_id, title, raw_notes, structured_data, chat_messages, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return safeServerError("api/reports GET", error, "Could not load saved reports.");
  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");

  const body = await parseJsonBody(request, createReportSchema, "Invalid report payload.");
  if (body.response) return body.response;
  const parsed = { data: body.data };

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

  const [{ data: profile }, { data: existingRows }, { data: dupReport }] = await Promise.all([
    supabase
      .from("profiles")
      .select("name_last_first, name_first_last, office, internship_start_date")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("reports")
      .select("id, title, structured_data")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    parsed.data.duplicateFromId
      ? supabase
          .from("reports")
          .select("structured_data")
          .eq("id", parsed.data.duplicateFromId)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const existingWithWeek = (existingRows ?? []).map((r) => {
    const obj =
      r.structured_data && typeof r.structured_data === "object" && !Array.isArray(r.structured_data)
        ? (r.structured_data as Record<string, unknown>)
        : {};
    const date_from = typeof obj.date_from === "string" ? obj.date_from : "";
    const date_to = typeof obj.date_to === "string" ? obj.date_to : "";
    return {
      id: r.id,
      title: r.title,
      date_from,
      date_to,
      mondayIso: getReportWeekMondayIso(date_from, date_to),
    };
  });

  if (!initialData) {
    const seeded = emptyReport();
    const dupSrc =
      dupReport?.structured_data &&
      typeof dupReport.structured_data === "object" &&
      !Array.isArray(dupReport.structured_data)
        ? (dupReport.structured_data as Record<string, unknown>)
        : null;

    seeded.intern_name_last_first = (
      (dupSrc && typeof dupSrc.intern_name_last_first === "string" && dupSrc.intern_name_last_first) ||
      profile?.name_last_first ||
      ""
    ).toUpperCase();
    seeded.intern_name_first_last = (
      (dupSrc && typeof dupSrc.intern_name_first_last === "string" && dupSrc.intern_name_first_last) ||
      profile?.name_first_last ||
      ""
    ).toUpperCase();
    seeded.office =
      (dupSrc && typeof dupSrc.office === "string" && dupSrc.office) ||
      profile?.office ||
      "DNX";

    if (parsed.data.weekStartDate && parsed.data.weekEndDate) {
      seeded.date_from = normalizeDateToLongFormat(parsed.data.weekStartDate);
      seeded.date_to = normalizeDateToLongFormat(parsed.data.weekEndDate);
    } else {
      const holidayMondays = normalizeHolidayMondays(user.user_metadata?.holiday_mondays);
      const nextWeek = inferNextWeekRange({
        startIso: profile?.internship_start_date,
        existingReports: existingWithWeek,
        holidayMondays,
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

  // Enforce 1 accomplishment report per Mon–Fri week
  const targetMondayIso = getReportWeekMondayIso(initialData.date_from, initialData.date_to);
  if (targetMondayIso) {
    const conflict = existingWithWeek.find((r) => r.mondayIso === targetMondayIso);
    if (conflict) {
      const holidayMondays = normalizeHolidayMondays(user.user_metadata?.holiday_mondays);
      const weekCat = resolveWeekCategory({
        dateFrom: initialData.date_from,
        dateTo: initialData.date_to,
        startDateIso: profile?.internship_start_date,
        holidayMondays,
      });
      return NextResponse.json(
        {
          error: `A report for ${weekCat.label} already exists. Only 1 accomplishment report is allowed per week.`,
          existingReportId: conflict.id,
          existingReportTitle: conflict.title,
        },
        { status: 409 },
      );
    }
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

  if (error) return safeServerError("api/reports POST", error, "Could not create report.");
  return NextResponse.json({ report: data }, { status: 201 });
}
