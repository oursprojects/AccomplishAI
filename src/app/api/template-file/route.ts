import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, safeServerError } from "@/lib/api-utils";
import { getUser } from "@/lib/supabase/server";
import { TEMPLATE_BUCKET } from "@/lib/env";
import { DOCX_MIME } from "@/lib/docx/fill";

const uuidSchema = z.string().uuid();

export async function GET(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");

  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get("templateId");
  const version = searchParams.get("v");
  if (templateId && !uuidSchema.safeParse(templateId).success) {
    return jsonError(400, "Invalid template ID.");
  }

  const query = templateId
    ? supabase
        .from("templates")
        .select("name, storage_path")
        .eq("id", templateId)
        .eq("user_id", user.id)
        .maybeSingle()
    : supabase
        .from("templates")
        .select("name, storage_path")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

  const { data: tpl, error } = await query;
  if (error || !tpl) {
    return jsonError(404, "No tagged template found. Scan your template first.");
  }

  const { data: blob, error: dlError } = await supabase.storage.from(TEMPLATE_BUCKET).download(tpl.storage_path);
  if (dlError || !blob) {
    return safeServerError("api/template-file GET", dlError, "Could not download template file.");
  }

  const safeName = tpl.name.replace(/["\r\n]/g, "").slice(0, 120) || "template.docx";
  const bytes = await blob.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": version ? "private, max-age=86400, immutable" : "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
