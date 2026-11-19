import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { reportDataStrictSchema } from "@/lib/report-schema";
import type { Json } from "@/lib/supabase/database.types";

const draftSchema = z.object({
  reportId: z.string().uuid().nullable().optional(),
  structuredData: reportDataStrictSchema,
  chatMessages: z
    .array(
      z.object({
        id: z.string().max(100),
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
        toolActions: z.array(z.string().max(120)).optional(),
      }),
    )
    .max(60),
});

export async function PUT(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = draftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid draft payload." }, { status: 400 });
  }

  const { error } = await supabase.from("workspace_drafts").upsert(
    {
      user_id: user.id,
      report_id: parsed.data.reportId ?? null,
      structured_data: parsed.data.structuredData as unknown as Json,
      chat_messages: parsed.data.chatMessages as unknown as Json,
    },
    { onConflict: "user_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("workspace_drafts").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
