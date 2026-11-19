import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { reportDataStrictSchema } from "@/lib/report-schema";
import type { Json } from "@/lib/supabase/database.types";

const chatMessageSchema = z.object({
  id: z.string().max(100),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
  toolActions: z.array(z.string().max(120)).optional(),
});

const createReportSchema = z.object({
  templateId: z.string().uuid().nullable().optional(),
  rawNotes: z.string().max(15000).default(""),
  structuredData: reportDataStrictSchema,
  chatMessages: z.array(chatMessageSchema).max(60).optional(),
});

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("reports")
    .select("id, template_id, raw_notes, structured_data, chat_messages, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report payload.", issues: parsed.error.issues }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("reports")
    .insert({
      user_id: user.id,
      template_id: parsed.data.templateId ?? null,
      raw_notes: parsed.data.rawNotes,
      structured_data: parsed.data.structuredData as unknown as Json,
      chat_messages: (parsed.data.chatMessages ?? []) as unknown as Json,
    })
    .select("id, template_id, raw_notes, structured_data, chat_messages, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ report: data }, { status: 201 });
}
