import { z } from "zod";

/**
 * Canonical report schema. Every key here is a docxtemplater tag that the
 * auto-tagger may inject into 2026-Weekly-Accomplishment-Report.docx and that
 * /api/generate-report must return.
 */
export const REPORT_KEYS = [
  "intern_name_last_first",
  "office",
  "date_from",
  "date_to",
  "mon_accomplishments",
  "mon_verified_by",
  "tue_accomplishments",
  "tue_verified_by",
  "wed_accomplishments",
  "wed_verified_by",
  "thu_accomplishments",
  "thu_verified_by",
  "fri_accomplishments",
  "fri_verified_by",
  "hours_this_week",
  "total_hours_worked",
  "new_trainings",
  "problems_encountered",
  "solutions_done",
  "intern_name_first_last",
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];
export type ReportData = Record<ReportKey, string>;

export const DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
export type Day = (typeof DAYS)[number];

/**
 * "list" fields render as one bullet paragraph per line (newline-separated in
 * ReportData). "text" fields render inline in the original run formatting.
 */
export type FieldKind = "text" | "list";

export const REPORT_FIELD_META: Record<
  ReportKey,
  { label: string; kind: FieldKind; description: string }
> = {
  intern_name_last_first: {
    label: "Intern name (LASTNAME, FIRSTNAME MI.)",
    kind: "text",
    description: "Header name cell next to 'Student Intern', format LASTNAME, FIRSTNAME MI.",
  },
  office: { label: "Office", kind: "text", description: "Value cell after 'Office:'" },
  date_from: { label: "From", kind: "text", description: "Week start date after 'From:'" },
  date_to: { label: "To", kind: "text", description: "Week end date after 'To:'" },
  mon_accomplishments: { label: "Monday accomplishments", kind: "list", description: "Accomplishments cell of the M row" },
  mon_verified_by: { label: "Monday verified by", kind: "text", description: "Verified By cell of the M row" },
  tue_accomplishments: { label: "Tuesday accomplishments", kind: "list", description: "Accomplishments cell of the first T row" },
  tue_verified_by: { label: "Tuesday verified by", kind: "text", description: "Verified By cell of the first T row" },
  wed_accomplishments: { label: "Wednesday accomplishments", kind: "list", description: "Accomplishments cell of the W row" },
  wed_verified_by: { label: "Wednesday verified by", kind: "text", description: "Verified By cell of the W row" },
  thu_accomplishments: { label: "Thursday accomplishments", kind: "list", description: "Accomplishments cell of the second T row" },
  thu_verified_by: { label: "Thursday verified by", kind: "text", description: "Verified By cell of the second T row" },
  fri_accomplishments: { label: "Friday accomplishments", kind: "list", description: "Accomplishments cell of the F row" },
  fri_verified_by: { label: "Friday verified by", kind: "text", description: "Verified By cell of the F row" },
  hours_this_week: { label: "Hours worked this week", kind: "text", description: "Value after 'No. of Hours Worked for the Week:'" },
  total_hours_worked: { label: "Total hours worked", kind: "text", description: "Value after 'Total No. of Hours Worked (previous week/s plus this week):'" },
  new_trainings: { label: "New trainings", kind: "list", description: "Bullets under 'New training/s took place this week'" },
  problems_encountered: { label: "Problems encountered", kind: "list", description: "Bullets under 'Problems encountered this week'" },
  solutions_done: { label: "Solutions done", kind: "list", description: "Bullets under 'Solutions done to solve the problem/s'" },
  intern_name_first_last: {
    label: "Intern name (FIRSTNAME MI. LASTNAME)",
    kind: "text",
    description: "'Prepared by' signature name, format FIRSTNAME MI. LASTNAME",
  },
};

export const isReportKey = (v: unknown): v is ReportKey =>
  typeof v === "string" && (REPORT_KEYS as readonly string[]).includes(v);

export const emptyReport = (): ReportData =>
  Object.fromEntries(REPORT_KEYS.map((k) => [k, ""])) as ReportData;

/** Lenient parser for LLM output: coerces arrays/numbers/null into strings. */
const lenientString = z
  .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()])), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return "";
    if (Array.isArray(v)) return v.map(String).join("\n");
    return String(v);
  });

export const reportDataSchema = z.object(
  Object.fromEntries(REPORT_KEYS.map((k) => [k, lenientString])) as Record<
    ReportKey,
    typeof lenientString
  >,
);

/** Strict schema for user-edited data coming back from the client. */
export const reportDataStrictSchema = z.object(
  Object.fromEntries(REPORT_KEYS.map((k) => [k, z.string().max(8000)])) as Record<
    ReportKey,
    z.ZodString
  >,
);
