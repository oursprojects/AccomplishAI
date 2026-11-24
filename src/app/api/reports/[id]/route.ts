import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseJsonBody, safeServerError } from "@/lib/api-utils";
import { getUser } from "@/lib/supabase/server";
import { getReportWeekMondayIso, normalizeDateToLongFormat, resolveWeekCategory } from "@/lib/internship-calendar";
import { reportDataStrictSchema, type ReportData } from "@/lib/report-schema";
import type { Json } from "@/lib/supabase/database.types";

const chatMessageSchema = z.object({
  id: z.string().max(100),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
  toolActions: z.array(z.string().max(120)).optional(),
  mcpToolsUsed: z.array(z.string().max(80)).optional(),
});

const patchReportSchema = z.object({
  title: z.string().trim().max(120).optional(),
  rawNotes: z.string().max(15000).optional(),
  structuredData: reportDataStrictSchema.optional(),
  chatMessages: z.array(chatMessageSchema).max(100).optional(),
});

const uuidSchema = z.string().uuid();

function normalizeStructuredReportData(d: ReportData): ReportData {
  const normalized: ReportData = { ...d };
  if (normalized.date_from) normalized.date_from = normalizeDateToLongFormat(normalized.date_from);
  if (normalized.date_to) normalized.date_to = normalizeDateToLongFormat(normalized.date_to);
  normalized.intern_name_last_first = normalized.intern_name_last_first.toUpperCase();
  normalized.intern_name_first_last = normalized.intern_name_first_last.toUpperCase();
  normalized.mon_verified_by = normalized.mon_verified_by.toUpperCase();
  normalized.tue_verified_by = normalized.tue_verified_by.toUpperCase();
  normalized.wed_verified_by = normalized.wed_verified_by.toUpperCase();
  normalized.thu_verified_by = normalized.thu_verified_by.toUpperCase();
  normalized.fri_verified_by = normalized.fri_verified_by.toUpperCase();
  return normalized;
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");

  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) {
    return jsonError(400, "Invalid report ID.");
  }

  const { data, error } = await supabase
    .from("reports")
    .select("id, template_id, title, raw_notes, structured_data, chat_messages, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return safeServerError("api/reports/[id] GET", error, "Could not load report.");
  if (!data) return jsonError(404, "Report not found.");
  return NextResponse.json({ report: data });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");

  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) {
    return jsonError(400, "Invalid report ID.");
  }

  const body = await parseJsonBody(request, patchReportSchema, "Invalid update payload.");
  if (body.response) return body.response;

  const updates: { title?: string; raw_notes?: string; structured_data?: Json; chat_messages?: Json } = {};
  if (body.data.title !== undefined) updates.title = body.data.title;
  if (body.data.rawNotes !== undefined) updates.raw_notes = body.data.rawNotes;
  const normalizedData = body.data.structuredData ? normalizeStructuredReportData(body.data.structuredData) : undefined;
  if (normalizedData !== undefined) {
    updates.structured_data = normalizedData as unknown as Json;
  }
  if (body.data.chatMessages !== undefined) {
    updates.chat_messages = body.data.chatMessages as unknown as Json;
  }

  if (Object.keys(updates).length === 0) {
    return jsonError(400, "Nothing to update.");
  }

  // Enforce 1 report per Mon–Fri week when changing report dates
  if (normalizedData) {
    const targetMondayIso = getReportWeekMondayIso(normalizedData.date_from, normalizedData.date_to);
    if (targetMondayIso) {
      const [{ data: otherReports }, { data: profile }] = await Promise.all([
        supabase
          .from("reports")
          .select("id, title, structured_data")
          .eq("user_id", user.id)
          .neq("id", id)
          .limit(100),
        supabase
          .from("profiles")
          .select("internship_start_date")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      const conflict = (otherReports ?? []).find((r) => {
        const obj =
          r.structured_data && typeof r.structured_data === "object" && !Array.isArray(r.structured_data)
            ? (r.structured_data as Record<string, unknown>)
            : {};
        return (
          getReportWeekMondayIso(
            typeof obj.date_from === "string" ? obj.date_from : "",
            typeof obj.date_to === "string" ? obj.date_to : "",
          ) === targetMondayIso
        );
      });

      if (conflict) {
        const weekCat = resolveWeekCategory({
          dateFrom: normalizedData.date_from,
          dateTo: normalizedData.date_to,
          startDateIso: profile?.internship_start_date,
        });
        return jsonError(
          409,
          `Another report already covers ${weekCat.label}. Only 1 accomplishment report is allowed per week.`,
          { conflictReportId: conflict.id },
        );
      }
    }
  }

  const { data, error } = await supabase
    .from("reports")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, template_id, title, raw_notes, structured_data, chat_messages, created_at, updated_at")
    .maybeSingle();

  if (error) return safeServerError("api/reports/[id] PATCH", error, "Could not update report.");
  if (!data) return jsonError(404, "Report not found.");
  return NextResponse.json({ report: data });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");

  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) {
    return jsonError(400, "Invalid report ID.");
  }

  const { error } = await supabase.from("reports").delete().eq("id", id).eq("user_id", user.id);
  if (error) return safeServerError("api/reports/[id] DELETE", error, "Could not delete report.");
  return NextResponse.json({ ok: true });
}
