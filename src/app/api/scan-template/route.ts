import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseJsonBody, safeServerError } from "@/lib/api-utils";
import { getUser } from "@/lib/supabase/server";
import { isReportKey } from "@/lib/report-schema";
import type { FieldAssignment } from "@/lib/docx/mapping";
import { DEFAULT_TEMPLATE_TEXTS, type TemplateTextOverrides } from "@/lib/docx/types";
import { confirmTemplate, loadActiveTemplateReview, scanAndStoreTemplate } from "@/lib/templates/pipeline";

const DEFAULT_TEMPLATE_NAME = "2026-Weekly-Accomplishment-Report.docx";
const DEFAULT_TEMPLATE_PATH = join(process.cwd(), "templates", DEFAULT_TEMPLATE_NAME);

const customTextKeys = Object.keys(DEFAULT_TEMPLATE_TEXTS) as Array<keyof TemplateTextOverrides>;
const customTextsSchema = z
  .record(z.string(), z.string().max(600))
  .optional()
  .transform((rec) => {
    if (!rec) return undefined;
    const cleaned: Partial<TemplateTextOverrides> = {};
    for (const key of customTextKeys) {
      if (typeof rec[key] === "string") {
        cleaned[key] = rec[key];
      }
    }
    return cleaned;
  });

const confirmBodySchema = z.object({
  templateId: z.string().uuid("Invalid template ID."),
  assignments: z.array(
    z.object({
      candidateId: z.string().min(1),
      key: z.string().nullable(),
      label: z.string().max(80).optional(),
    }),
  ),
  customTexts: customTextsSchema,
});

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

export async function POST() {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");

  try {
    const buffer = await readFile(DEFAULT_TEMPLATE_PATH);
    const review = await scanAndStoreTemplate(supabase, user.id, buffer, DEFAULT_TEMPLATE_NAME);
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

    const review = await confirmTemplate(
      supabase,
      user.id,
      body.data.templateId,
      assignments,
      body.data.customTexts,
    );
    return NextResponse.json({ review });
  } catch (err) {
    return safeServerError("api/scan-template PATCH", err, "Failed to confirm template.");
  }
}
