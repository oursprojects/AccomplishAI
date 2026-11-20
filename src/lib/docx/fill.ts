import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { normalizeDateToLongFormat } from "@/lib/internship-calendar";
import type { ReportData } from "@/lib/report-schema";
import { REPORT_KEYS } from "@/lib/report-schema";
import type { DetectedField } from "./types";

const BULLET_PREFIX = /^\s*(?:[-*•▪◦·–—]|\d+[.)])\s+/;

const UPPERCASE_NAME_KEYS = new Set<string>([
  "intern_name_last_first",
  "intern_name_first_last",
  "mon_verified_by",
  "tue_verified_by",
  "wed_verified_by",
  "thu_verified_by",
  "fri_verified_by",
]);

/** Split a newline-separated field into clean bullet items. */
export function toLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((l) => l.replace(BULLET_PREFIX, "").trim())
    .filter(Boolean);
}

/**
 * ReportData (all strings) → docxtemplater data. List fields become arrays
 * (one bullet paragraph per item); an empty list keeps one empty bullet so the
 * table cell still contains a <w:p>, exactly like the original template.
 * Dates are normalized to "November 9, 2026" and name/verifier fields are uppercased.
 */
export function buildRenderData(data: Partial<ReportData>, fields: Pick<DetectedField, "key" | "kind">[]) {
  const out: Record<string, string | string[]> = {};
  for (const k of REPORT_KEYS) {
    let val = (data[k] ?? "").trim();
    if (k === "date_from" || k === "date_to") {
      val = normalizeDateToLongFormat(val);
    } else if (UPPERCASE_NAME_KEYS.has(k)) {
      val = val.toUpperCase();
    }
    out[k] = val;
  }
  for (const f of fields) {
    if (f.kind !== "list") continue;
    const lines = toLines(data[f.key] ?? "");
    out[f.key] = lines.length ? lines : [""];
  }
  return out;
}

/** Fill the tagged master.docx. Works in the browser and in Node. */
export function fillTemplate(
  tagged: ArrayBuffer | Uint8Array,
  data: Partial<ReportData>,
  fields: Pick<DetectedField, "key" | "kind">[],
): Uint8Array {
  const doc = new Docxtemplater(new PizZip(tagged), {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(buildRenderData(data, fields));
  return doc.getZip().generate({ type: "uint8array", compression: "DEFLATE" });
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
