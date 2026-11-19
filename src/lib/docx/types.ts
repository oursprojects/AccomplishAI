import type { FieldKind, ReportKey } from "@/lib/report-schema";

/** XML parts of a .docx that the scanner inspects. */
export type DocxPart = string; // e.g. "word/document.xml", "word/header2.xml"

/**
 * A stable pointer to a fillable region inside the ORIGINAL .docx.
 * Indices are positional (document order) so re-scanning the same original
 * file always yields the same refs — this is what lets the user rename/reassign
 * fields and re-tag later without re-uploading.
 */
export interface CellRef {
  part: DocxPart;
  table: number; // index among all <w:tbl> in the part (document order)
  row: number; // index among the table's direct <w:tr>
  cell: number; // index among the row's direct <w:tc>
  /** First paragraph (index among the cell's direct <w:p>) that belongs to the input area. */
  fromParagraph: number;
}

export type DetectionReason =
  | "placeholder_text"
  | "sample_entry"
  | "label_value_pair"
  | "day_row"
  | "section_body"
  | "signature_name"
  | "empty_cell";

/** Raw input area found by the XML scanner (before AI mapping). */
export interface Candidate {
  id: string; // "document.xml:t1:r2:c1:p0"
  ref: CellRef;
  reason: DetectionReason;
  /** Text currently in the area (placeholder / sample / empty). */
  currentText: string;
  /** Nearby label text that explains what the area is for. */
  context: string;
  suggestedKind: FieldKind;
  /** Deterministic guess, used as an AI hint and as offline fallback. */
  heuristicKey: ReportKey | null;
  /** Fixed printed content (signatories, wet-ink Date line) — never tagged. */
  locked: boolean;
}

/** Final field stored in templates.schema and shown in "Detected Fields". */
export interface DetectedField {
  candidateId: string;
  ref: CellRef;
  key: ReportKey;
  label: string;
  kind: FieldKind;
  originalText: string;
  context: string;
  source: "ai" | "heuristic" | "user";
}

export interface ScanResult {
  candidates: Candidate[];
  /** Tables summary, handy for debugging/confirmation UI. */
  structure: Array<{ part: DocxPart; table: number; rows: string[][] }>;
  warnings: string[];
}
