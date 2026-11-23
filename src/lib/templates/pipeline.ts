import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, TemplateRow } from "@/lib/supabase/database.types";
import { scanDocx } from "@/lib/docx/scanner";
import { tagDocx } from "@/lib/docx/tagger";
import { resolveFields, type FieldAssignment } from "@/lib/docx/mapping";
import type { Candidate, DetectedField, TemplateTextOverrides } from "@/lib/docx/types";
import { DOCX_MIME } from "@/lib/docx/fill";
import { mapCandidatesWithAI } from "@/lib/ai/field-mapper";
import { TEMPLATE_BUCKET, templatePaths } from "@/lib/env";

type Supabase = SupabaseClient<Database>;

/** What the "Detected Fields" confirmation screen needs. */
export interface TemplateReview {
  template: Pick<TemplateRow, "id" | "name" | "status" | "updated_at">;
  fields: DetectedField[];
  /** Areas the scanner found but intentionally left untouched (signatories, Date line). */
  preserved: Array<Pick<Candidate, "id" | "context" | "currentText">>;
  /** Unlocked areas not mapped to any key — user may assign them. */
  unassigned: Array<Pick<Candidate, "id" | "context" | "currentText" | "heuristicKey">>;
  aiUsed: boolean;
  warnings: string[];
}

function summarize(candidates: Candidate[], fields: DetectedField[]) {
  const mapped = new Set(fields.map((f) => f.candidateId));
  return {
    preserved: candidates.filter((c) => c.locked).map(({ id, context, currentText }) => ({ id, context, currentText })),
    unassigned: candidates
      .filter((c) => !c.locked && !mapped.has(c.id))
      .map(({ id, context, currentText, heuristicKey }) => ({ id, context, currentText, heuristicKey })),
  };
}

async function upload(supabase: Supabase, path: string, bytes: Uint8Array | Buffer) {
  const { error } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .upload(path, bytes, { contentType: DOCX_MIME, upsert: true, cacheControl: "0" });
  if (error) throw new Error(`Storage upload failed (${path}): ${error.message}`);
}

/**
 * First-open flow: scan → AI map → tag → store original + master.docx →
 * insert the (new) active template row with status "pending_review".
 */
export async function scanAndStoreTemplate(
  supabase: Supabase,
  userId: string,
  original: Buffer,
  fileName: string,
): Promise<TemplateReview> {
  const scan = scanDocx(original);
  const { fields, aiUsed, error } = await mapCandidatesWithAI(scan.candidates);
  if (!fields.length) throw new Error("No fillable areas were detected in this document.");
  const tagged = tagDocx(original, fields);

  const paths = templatePaths(userId);
  await upload(supabase, paths.original, original);
  await upload(supabase, paths.master, tagged);

  // One active template per user (enforced by a partial unique index).
  await supabase.from("templates").update({ is_active: false }).eq("user_id", userId).eq("is_active", true);
  const { data: row, error: dbError } = await supabase
    .from("templates")
    .insert({
      user_id: userId,
      name: fileName,
      original_path: paths.original,
      storage_path: paths.master,
      schema: fields as unknown as Json,
      status: "pending_review",
      is_active: true,
    })
    .select("id, name, status, updated_at")
    .single();
  if (dbError) throw new Error(`Saving template failed: ${dbError.message}`);

  return {
    template: row,
    fields,
    ...summarize(scan.candidates, fields),
    aiUsed,
    warnings: [...scan.warnings, ...(error ? [`AI mapping skipped: ${error}. Used built-in detection.`] : [])],
  };
}

/**
 * Confirmation flow: re-scan the stored ORIGINAL, apply the user's
 * (possibly renamed/reassigned) fields, re-tag and mark as confirmed.
 */
export async function confirmTemplate(
  supabase: Supabase,
  userId: string,
  templateId: string,
  assignments: FieldAssignment[],
  customTexts?: Partial<TemplateTextOverrides>,
): Promise<TemplateReview> {
  const { data: tpl, error } = await supabase
    .from("templates")
    .select("id, original_path, storage_path")
    .eq("id", templateId)
    .eq("user_id", userId)
    .single();
  if (error || !tpl) throw new Error("Template not found.");

  let original: Buffer;
  try {
    original = await readFile(DEFAULT_TEMPLATE_PATH);
  } catch {
    const { data: blob, error: dlError } = await supabase.storage.from(TEMPLATE_BUCKET).download(tpl.original_path);
    if (dlError || !blob) throw new Error(`Could not load original template: ${dlError?.message}`);
    original = Buffer.from(await blob.arrayBuffer());
  }

  const scan = scanDocx(original);
  const fields = resolveFields(scan.candidates, assignments, "user");
  if (!fields.length) throw new Error("Assign at least one field before confirming.");
  if (customTexts && Object.keys(customTexts).length > 0) {
    fields[0] = { ...fields[0], customTexts };
  }
  const tagged = tagDocx(original, fields);
  await upload(supabase, tpl.storage_path, tagged);

  const { data: row, error: upError } = await supabase
    .from("templates")
    .update({ schema: fields as unknown as Json, status: "confirmed" })
    .eq("id", templateId)
    .eq("user_id", userId)
    .select("id, name, status, updated_at")
    .single();
  if (upError) throw new Error(`Updating template failed: ${upError.message}`);

  return { template: row, fields, ...summarize(scan.candidates, fields), aiUsed: false, warnings: scan.warnings };
}

/**
 * Load the active template together with its preserved/unassigned areas from
 * the stored original .docx (for the /template screen and pending_review state).
 */
export async function loadActiveTemplateReview(
  supabase: Supabase,
  userId: string,
): Promise<TemplateReview | null> {
  const { data: tpl, error } = await supabase
    .from("templates")
    .select("id, name, original_path, schema, status, updated_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !tpl) return null;

  const fields = (Array.isArray(tpl.schema) ? tpl.schema : []) as unknown as DetectedField[];
  // Skip downloading 714 KB original.docx on every visit once the template is already confirmed
  if (tpl.status === "confirmed") {
    return {
      template: { id: tpl.id, name: tpl.name, status: tpl.status, updated_at: tpl.updated_at },
      fields,
      preserved: [],
      unassigned: [],
      aiUsed: false,
      warnings: [],
    };
  }
  const { data: blob } = await supabase.storage.from(TEMPLATE_BUCKET).download(tpl.original_path);
  if (!blob) {
    return {
      template: { id: tpl.id, name: tpl.name, status: tpl.status, updated_at: tpl.updated_at },
      fields,
      preserved: [],
      unassigned: [],
      aiUsed: false,
      warnings: [],
    };
  }
  const scan = scanDocx(Buffer.from(await blob.arrayBuffer()));
  return {
    template: { id: tpl.id, name: tpl.name, status: tpl.status, updated_at: tpl.updated_at },
    fields,
    ...summarize(scan.candidates, fields),
    aiUsed: false,
    warnings: scan.warnings,
  };
}

const DEFAULT_TEMPLATE_NAME = "2026-Weekly-Accomplishment-Report.docx";
const DEFAULT_TEMPLATE_PATH = join(process.cwd(), "templates", DEFAULT_TEMPLATE_NAME);

/**
 * Fast template loader for the main workspace: reads schema from Postgres
 * without downloading/re-scanning the 714 KB original .docx on every page visit.
 */
export async function ensureFastActiveTemplateReview(
  supabase: Supabase,
  userId: string,
): Promise<TemplateReview | null> {
  const { data: tpl, error } = await supabase
    .from("templates")
    .select("id, name, schema, status, updated_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!error && tpl) {
    const fields = (Array.isArray(tpl.schema) ? tpl.schema : []) as unknown as DetectedField[];
    return {
      template: { id: tpl.id, name: tpl.name, status: tpl.status, updated_at: tpl.updated_at },
      fields,
      preserved: [],
      unassigned: [],
      aiUsed: false,
      warnings: [],
    };
  }

  const original = await readFile(DEFAULT_TEMPLATE_PATH);
  return await scanAndStoreTemplate(supabase, userId, original, DEFAULT_TEMPLATE_NAME);
}

/**
 * First-open auto-scanner (full): returns the user's active template with
 * preserved/unassigned areas, or automatically scans on first visit.
 */
export async function ensureActiveTemplateReview(
  supabase: Supabase,
  userId: string,
): Promise<TemplateReview | null> {
  const existing = await loadActiveTemplateReview(supabase, userId);
  if (existing) return existing;

  const original = await readFile(DEFAULT_TEMPLATE_PATH);
  return await scanAndStoreTemplate(supabase, userId, original, DEFAULT_TEMPLATE_NAME);
}
