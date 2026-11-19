import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { ReportData } from "@/lib/report-schema";
import { REPORT_KEYS } from "@/lib/report-schema";
import type { DetectedField } from "./types";

const BULLET_PREFIX = /^\s*(?:[-*•▪◦·–—]|\d+[.)])\s+/;

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
 */
export function buildRenderData(data: Partial<ReportData>, fields: Pick<DetectedField, "key" | "kind">[]) {
  const out: Record<string, string | string[]> = {};
  for (const k of REPORT_KEYS) out[k] = (data[k] ?? "").trim();
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
