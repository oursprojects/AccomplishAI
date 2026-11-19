import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { MAX_CHAT_MESSAGES, reportDataStrictSchema } from "@/lib/report-schema";
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
  chatMessages: z.array(chatMessageSchema).max(MAX_CHAT_MESSAGES + 10).optional(),
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
