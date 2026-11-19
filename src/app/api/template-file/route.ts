import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { TEMPLATE_BUCKET } from "@/lib/env";
import { DOCX_MIME } from "@/lib/docx/fill";

export async function GET(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get("templateId");

  const query = templateId
    ? supabase.from("templates").select("name, storage_path").eq("id", templateId).maybeSingle()
    : supabase
        .from("templates")
        .select("name, storage_path")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

  const { data: tpl, error } = await query;
  if (error || !tpl) {
    return NextResponse.json({ error: "No tagged template found. Scan your template first." }, { status: 404 });
  }

  const { data: blob, error: dlError } = await supabase.storage.from(TEMPLATE_BUCKET).download(tpl.storage_path);
  if (dlError || !blob) {
    return NextResponse.json({ error: `Could not download template: ${dlError?.message}` }, { status: 500 });
  }

  const bytes = await blob.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `inline; filename="${tpl.name.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
