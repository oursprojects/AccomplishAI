import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { isReportKey } from "@/lib/report-schema";
import type { FieldAssignment } from "@/lib/docx/mapping";
import { confirmTemplate, loadActiveTemplateReview, scanAndStoreTemplate } from "@/lib/templates/pipeline";

const DEFAULT_TEMPLATE_NAME = "2026-Weekly-Accomplishment-Report.docx";
const DEFAULT_TEMPLATE_PATH = join(process.cwd(), "templates", DEFAULT_TEMPLATE_NAME);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const confirmBodySchema = z.object({
  templateId: z.string().uuid(),
  assignments: z.array(
    z.object({
      candidateId: z.string().min(1),
      key: z.string().nullable(),
      label: z.string().max(80).optional(),
    }),
  ),
});

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const review = await loadActiveTemplateReview(supabase, user.id);
    return NextResponse.json({ review });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load template." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let buffer: Buffer;
    let fileName = DEFAULT_TEMPLATE_NAME;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No .docx file provided." }, { status: 400 });
      }
      if (!file.name.toLowerCase().endsWith(".docx")) {
        return NextResponse.json({ error: "Please upload a valid .docx Word document." }, { status: 400 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "Template exceeds the 10 MB limit." }, { status: 413 });
      }
      fileName = file.name;
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      buffer = await readFile(DEFAULT_TEMPLATE_PATH);
    }

    const review = await scanAndStoreTemplate(supabase, user.id, buffer, fileName);
    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to scan template." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const parsed = confirmBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid field assignments.", issues: parsed.error.issues }, { status: 400 });
    }

    const assignments: FieldAssignment[] = parsed.data.assignments.map((a) => ({
      candidateId: a.candidateId,
      key: a.key && isReportKey(a.key) ? a.key : null,
      label: a.label,
    }));

    const review = await confirmTemplate(supabase, parsed.data.templateId, assignments);
    return NextResponse.json({ review });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to confirm template." },
      { status: 500 },
    );
  }
}
