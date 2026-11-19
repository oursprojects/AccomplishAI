import "server-only";
import { REPORT_FIELD_META, REPORT_KEYS } from "@/lib/report-schema";
import type { Candidate, DetectedField } from "@/lib/docx/types";
import { heuristicFields, mergeWithHeuristics, resolveFields, type FieldAssignment } from "@/lib/docx/mapping";
import { groqJson } from "./groq";

const SYSTEM = `You map input areas detected in a Word template (a student intern's
"Weekly Accomplishment Report") to a fixed schema of fill-in keys.

Rules:
- Only use keys from the provided schema, each key at most once, or null.
- Never map areas marked "locked": they are printed signatories, job titles,
  or wet-ink "Date: _________" lines that must stay untouched.
- Static labels (e.g. "Student Intern", "Office:", "Day") are NOT input areas.
- In the Day table the rows are M, T, W, T, F in order: the first "T" is Tuesday,
  the second "T" is Thursday.
- "label" is a short human-friendly name for the confirmation screen.
Respond with JSON only: {"fields":[{"candidate_id":string,"key":string|null,"label":string}]}`;

interface AiResponse {
  fields?: Array<{ candidate_id?: unknown; key?: unknown; label?: unknown }>;
}

/**
 * Ask Groq (llama-3.3-70b-versatile, JSON mode) to map scanner candidates to
 * schema keys. Output is validated; anything the AI misses or gets wrong falls
 * back to the deterministic heuristics so the template is always fully tagged.
 */
export async function mapCandidatesWithAI(
  candidates: Candidate[],
): Promise<{ fields: DetectedField[]; aiUsed: boolean; error?: string }> {
  if (!process.env.GROQ_API_KEY) {
    return { fields: heuristicFields(candidates), aiUsed: false, error: "GROQ_API_KEY missing" };
  }

  const schema = REPORT_KEYS.map((k) => ({ key: k, meaning: REPORT_FIELD_META[k].description }));
  const areas = candidates.map((c) => ({
    candidate_id: c.id,
    detected_because: c.reason,
    label_context: c.context,
    current_text: c.currentText.slice(0, 160),
    locked: c.locked,
    heuristic_guess: c.heuristicKey,
  }));

  try {
    const { data } = await groqJson<AiResponse>({
      system: SYSTEM,
      user: JSON.stringify({ schema, areas }),
      temperature: 0,
    });
    const assignments: FieldAssignment[] = (data.fields ?? []).map((f) => ({
      candidateId: String(f.candidate_id ?? ""),
      key: (typeof f.key === "string" ? f.key : null) as FieldAssignment["key"],
      label: typeof f.label === "string" ? f.label : undefined,
    }));
    const ai = resolveFields(candidates, assignments, "ai");
    return { fields: mergeWithHeuristics(candidates, ai), aiUsed: true };
  } catch (err) {
    return {
      fields: heuristicFields(candidates),
      aiUsed: false,
      error: err instanceof Error ? err.message : "AI mapping failed",
    };
  }
}
