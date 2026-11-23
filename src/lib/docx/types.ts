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

export interface TemplateTextOverrides {
  country_header: string;
  university_header: string;
  campus_header: string;
  campus_address: string;
  college_banner: string;
  report_title: string;
  label_student_intern: string;
  label_office: string;
  label_from: string;
  label_to: string;
  col_day: string;
  col_accomplishments: string;
  col_verified_by: string;
  day_mon: string;
  day_tue: string;
  day_wed: string;
  day_thu: string;
  day_fri: string;
  label_hours_week: string;
  label_total_hours: string;
  label_new_trainings: string;
  label_problems: string;
  label_solutions: string;
  label_prepared_by: string;
  label_noted_by: string;
  label_date: string;
  prepared_by_role: string;
  noted_by_name: string;
  noted_by_title: string;
  date_line: string;
  vision_title: string;
  vision_body: string;
  mission_title: string;
  mission_body: string;
  pledge_title: string;
  pledge_body: string;
}

export const DEFAULT_TEMPLATE_TEXTS: TemplateTextOverrides = {
  country_header: "Republic of the Philippines",
  university_header: "Cagayan State University",
  campus_header: "GONZAGA CAMPUS",
  campus_address: "Gonzaga, Cagayan",
  college_banner: "COLLEGE of INFORMATION and COMPUTING SCIENCES",
  report_title: "WEEKLY ACCOMPLISHMENT REPORT",
  label_student_intern: "Student Intern",
  label_office: "Office:",
  label_from: "From:",
  label_to: "To:",
  col_day: "Day",
  col_accomplishments: "Accomplishments",
  col_verified_by: "Verified By",
  day_mon: "M",
  day_tue: "T",
  day_wed: "W",
  day_thu: "T",
  day_fri: "F",
  label_hours_week: "No. of Hours Worked for the Week:",
  label_total_hours: "Total No. of Hours Worked (previous week/s plus this week):",
  label_new_trainings: "New training/s took place this week",
  label_problems: "Problems encountered this week",
  label_solutions: "Solutions done to solve the problem/s",
  label_prepared_by: "Prepared by:",
  label_noted_by: "Noted by:",
  label_date: "Date:",
  prepared_by_role: "Student Intern’s Name and Signature",
  noted_by_name: "NIÑO R. GUILLERMO",
  noted_by_title: "Infrastructure, Research & Development Maager",
  date_line: "_________",
  vision_title: "CSU VISION",
  vision_body:
    "CSU is a university with global stature in the arts, culture, agriculture and fisheries, the sciences as well as technological and professional fields.",
  mission_title: "CSU MISSION",
  mission_body:
    "CSU is committed to transform the lives of people and communities through high quality instruction and innovative research, development, production and extension.",
  pledge_title: "GOALS AND OBJECTIVES",
  pledge_body:
    "1. To produce proficient, competent and committed graduates equipped with the knowledge, skills and positive values demanded by the IT profession; and 2. To produce research and extension-service-oriented graduates.",
};

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
  /** Optional custom template text overrides persisted alongside the schema array. */
  customTexts?: Partial<TemplateTextOverrides>;
}

export function resolveTemplateTexts(
  fields?: ReadonlyArray<{ customTexts?: Partial<TemplateTextOverrides> }> | null,
  overrides?: Partial<TemplateTextOverrides> | null,
): TemplateTextOverrides {
  const fromFields = fields?.find((f) => f.customTexts)?.customTexts ?? {};
  return {
    ...DEFAULT_TEMPLATE_TEXTS,
    ...fromFields,
    ...(overrides ?? {}),
  };
}

export interface ScanResult {
  candidates: Candidate[];
  /** Tables summary, handy for debugging/confirmation UI. */
  structure: Array<{ part: DocxPart; table: number; rows: string[][] }>;
  warnings: string[];
}
