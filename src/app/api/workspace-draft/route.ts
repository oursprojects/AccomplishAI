import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseJsonBody, safeServerError } from "@/lib/api-utils";
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
  if (!user) return jsonError(401, "Unauthorized");

  const body = await parseJsonBody(request, draftSchema, "Invalid draft payload.");
  if (body.response) return body.response;

  const { error } = await supabase.from("workspace_drafts").upsert(
    {
      user_id: user.id,
      report_id: body.data.reportId ?? null,
      structured_data: body.data.structuredData as unknown as Json,
      chat_messages: body.data.chatMessages as unknown as Json,
    },
    { onConflict: "user_id" },
  );

  if (error) return safeServerError("api/workspace-draft PUT", error, "Could not save draft.");
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");

  const { error } = await supabase.from("workspace_drafts").delete().eq("user_id", user.id);
  if (error) return safeServerError("api/workspace-draft DELETE", error, "Could not delete draft.");
  return NextResponse.json({ ok: true });
}
