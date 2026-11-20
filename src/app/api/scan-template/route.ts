import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseJsonBody, safeServerError } from "@/lib/api-utils";
import { getUser } from "@/lib/supabase/server";
import { isReportKey } from "@/lib/report-schema";
import type { FieldAssignment } from "@/lib/docx/mapping";
import { confirmTemplate, loadActiveTemplateReview, scanAndStoreTemplate } from "@/lib/templates/pipeline";

const DEFAULT_TEMPLATE_NAME = "2026-Weekly-Accomplishment-Report.docx";
const DEFAULT_TEMPLATE_PATH = join(process.cwd(), "templates", DEFAULT_TEMPLATE_NAME);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const confirmBodySchema = z.object({
  templateId: z.string().uuid("Invalid template ID."),
  assignments: z.array(
    z.object({
      candidateId: z.string().min(1),
      key: z.string().nullable(),
      label: z.string().max(80).optional(),
    }),
  ),
});

function hasZipSignature(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");

  try {
    const review = await loadActiveTemplateReview(supabase, user.id);
    return NextResponse.json({ review });
  } catch (err) {
    return safeServerError("api/scan-template GET", err, "Failed to load template.");
  }
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let buffer: Buffer;
    let fileName = DEFAULT_TEMPLATE_NAME;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return jsonError(400, "No .docx file provided.");
      }
      if (!file.name.toLowerCase().endsWith(".docx")) {
        return jsonError(400, "Please upload a valid .docx Word document.");
      }
      if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
        return jsonError(file.size === 0 ? 400 : 413, file.size === 0 ? "Uploaded file is empty." : "Template exceeds the 10 MB limit.");
      }
      fileName = file.name.slice(0, 140);
      buffer = Buffer.from(await file.arrayBuffer());
      if (!hasZipSignature(buffer)) {
        return jsonError(400, "Invalid .docx file format. Please upload a standard Word (.docx) document.");
      }
    } else {
      buffer = await readFile(DEFAULT_TEMPLATE_PATH);
    }

    const review = await scanAndStoreTemplate(supabase, user.id, buffer, fileName);
    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return safeServerError("api/scan-template POST", err, "Failed to scan template.");
  }
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");

  const body = await parseJsonBody(request, confirmBodySchema, "Invalid field assignments.");
  if (body.response) return body.response;

  try {
    const assignments: FieldAssignment[] = body.data.assignments.map((a) => ({
      candidateId: a.candidateId,
      key: a.key && isReportKey(a.key) ? a.key : null,
      label: a.label,
    }));

    const review = await confirmTemplate(supabase, user.id, body.data.templateId, assignments);
    return NextResponse.json({ review });
  } catch (err) {
    return safeServerError("api/scan-template PATCH", err, "Failed to confirm template.");
  }
}
