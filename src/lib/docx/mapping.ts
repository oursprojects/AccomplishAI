import type { ReportKey } from "@/lib/report-schema";
import { REPORT_FIELD_META, isReportKey } from "@/lib/report-schema";
import type { Candidate, DetectedField } from "./types";

export interface FieldAssignment {
  candidateId: string;
  key: ReportKey | null;
  label?: string;
}

/**
 * Turn assignments (from AI or from the user's "Detected Fields" review) into
 * validated DetectedField[]:
 *   - unknown candidate ids and locked areas (signatories, Date line) are dropped
 *   - each schema key is used at most once (first assignment wins)
 *   - kind always follows the schema key so render data shape matches the tag
 */
export function resolveFields(
  candidates: Candidate[],
  assignments: FieldAssignment[],
  source: DetectedField["source"],
): DetectedField[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const used = new Set<ReportKey>();
  const fields: DetectedField[] = [];
  for (const a of assignments) {
    const c = byId.get(a.candidateId);
    if (!c || c.locked || !isReportKey(a.key) || used.has(a.key)) continue;
    used.add(a.key);
    fields.push({
      candidateId: c.id,
      ref: c.ref,
      key: a.key,
      label: (a.label?.trim() || REPORT_FIELD_META[a.key].label).slice(0, 80),
      kind: REPORT_FIELD_META[a.key].kind,
      originalText: c.currentText,
      context: c.context,
      source,
    });
  }
  return fields;
}

/** Deterministic mapping from the scanner's own guesses (offline fallback). */
export function heuristicFields(candidates: Candidate[]): DetectedField[] {
  return resolveFields(
    candidates,
    candidates.map((c) => ({ candidateId: c.id, key: c.heuristicKey })),
    "heuristic",
  );
}

/**
 * Merge AI output with heuristics: AI decides first; any schema key the AI
 * missed but the heuristics found on a still-unassigned candidate is added.
 */
export function mergeWithHeuristics(candidates: Candidate[], ai: DetectedField[]): DetectedField[] {
  const usedKeys = new Set(ai.map((f) => f.key));
  const usedCandidates = new Set(ai.map((f) => f.candidateId));
  const extra = heuristicFields(candidates).filter(
    (f) => !usedKeys.has(f.key) && !usedCandidates.has(f.candidateId),
  );
  return [...ai, ...extra];
}
