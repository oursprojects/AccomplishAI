import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { getReportWeekMondayIso, resolveWeekCategory } from "@/lib/internship-calendar";
import { reportDataStrictSchema } from "@/lib/report-schema";
import type { Json } from "@/lib/supabase/database.types";

const chatMessageSchema = z.object({
  id: z.string().max(100),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
  toolActions: z.array(z.string().max(120)).optional(),
});

const patchReportSchema = z.object({
  title: z.string().trim().max(120).optional(),
  rawNotes: z.string().max(15000).optional(),
  structuredData: reportDataStrictSchema.optional(),
  chatMessages: z.array(chatMessageSchema).max(100).optional(),
});

const uuidSchema = z.string().uuid();

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid report ID." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("reports")
    .select("id, template_id, title, raw_notes, structured_data, chat_messages, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  return NextResponse.json({ report: data });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid report ID." }, { status: 400 });
  }

  const parsed = patchReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload." }, { status: 400 });
  }

  const updates: { title?: string; raw_notes?: string; structured_data?: Json; chat_messages?: Json } = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.rawNotes !== undefined) updates.raw_notes = parsed.data.rawNotes;
  if (parsed.data.structuredData !== undefined) {
    updates.structured_data = parsed.data.structuredData as unknown as Json;
  }
  if (parsed.data.chatMessages !== undefined) {
    updates.chat_messages = parsed.data.chatMessages as unknown as Json;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // Enforce 1 report per Mon–Fri week when changing report dates
  if (parsed.data.structuredData) {
    const targetMondayIso = getReportWeekMondayIso(
      parsed.data.structuredData.date_from,
      parsed.data.structuredData.date_to,
    );
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
          dateFrom: parsed.data.structuredData.date_from,
          dateTo: parsed.data.structuredData.date_to,
          startDateIso: profile?.internship_start_date,
        });
        return NextResponse.json(
          {
            error: `Another report already covers ${weekCat.label}. Only 1 accomplishment report is allowed per week.`,
            conflictReportId: conflict.id,
          },
          { status: 409 },
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  return NextResponse.json({ report: data });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid report ID." }, { status: 400 });
  }

  const { error } = await supabase.from("reports").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
