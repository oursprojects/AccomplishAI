import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { Document, Element } from "@xmldom/xmldom";
import { normalizeDateToLongFormat } from "@/lib/internship-calendar";
import type { ReportData } from "@/lib/report-schema";
import { REPORT_KEYS } from "@/lib/report-schema";
import type { DetectedField } from "./types";
import { cellParagraphs, childElements, descendants, firstChild, parseXml, serializeXml, textOf, W_NS } from "./xml";

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

function ensureCellMargin(doc: Document, tc: Element, horizontalTwips = "90") {
  let tcPr = firstChild(tc, "w:tcPr");
  if (!tcPr) {
    tcPr = doc.createElementNS(W_NS, "w:tcPr");
    tc.insertBefore(tcPr, tc.firstChild);
  }
  if (firstChild(tcPr, "w:tcMar")) return;
  const tcMar = doc.createElementNS(W_NS, "w:tcMar");
  const left = doc.createElementNS(W_NS, "w:left");
  left.setAttribute("w:w", horizontalTwips);
  left.setAttribute("w:type", "dxa");
  const right = doc.createElementNS(W_NS, "w:right");
  right.setAttribute("w:w", horizontalTwips);
  right.setAttribute("w:type", "dxa");
  tcMar.appendChild(left);
  tcMar.appendChild(right);
  tcPr.appendChild(tcMar);
}

function setParagraphAlign(doc: Document, p: Element, val: "center" | "left") {
  let pPr = firstChild(p, "w:pPr");
  if (!pPr) {
    pPr = doc.createElementNS(W_NS, "w:pPr");
    p.insertBefore(pPr, p.firstChild);
  }
  let jc = firstChild(pPr, "w:jc");
  if (!jc) {
    jc = doc.createElementNS(W_NS, "w:jc");
    pPr.appendChild(jc);
  }
  jc.setAttribute("w:val", val);
}

/**
 * Normalizes CSU Weekly Accomplishment table alignment & bullet indents so:
 * - Day labels (M, T, W, T, F) sit centered inside the Day column instead of crowding the left border.
 * - Bullet markers ("-") stay cleanly indented inside cell borders rather than overlapping table gridlines.
 */
function polishCsuTablesXml(zip: PizZip) {
  const part = zip.file("word/document.xml");
  if (!part) return;
  const doc = parseXml(part.asText());
  const tables = descendants(doc, "w:tbl");
  const mainTbl = tables[1];
  if (!mainTbl) return;

  const mainRows = childElements(mainTbl, "w:tr");
  const headerCells = mainRows[0] ? childElements(mainRows[0], "w:tc") : [];
  const isWeeklyReportTable =
    headerCells.length >= 2 &&
    textOf(headerCells[0]).trim().toLowerCase() === "day" &&
    textOf(headerCells[1]).toLowerCase().includes("accomplishment");
  if (!isWeeklyReportTable) return;

  // Center M, T, W, T, F in column 0 of rows 1..5 and add comfortable horizontal padding
  for (let r = 1; r < mainRows.length; r++) {
    const cells = childElements(mainRows[r], "w:tc");
    for (let c = 0; c < cells.length; c++) {
      ensureCellMargin(doc, cells[c], "90");
    }
    if (cells[0]) {
      const dayLabel = textOf(cells[0]).trim();
      if (/^[MTWTF]$/.test(dayLabel)) {
        for (const p of cellParagraphs(cells[0])) {
          setParagraphAlign(doc, p, "center");
        }
      }
    }
  }

  // Fix bulleted indents in table 1 (accomplishments) & table 2 (trainings/problems/solutions)
  for (const tbl of [mainTbl, tables[2]].filter((t): t is Element => Boolean(t))) {
    for (const tr of childElements(tbl, "w:tr")) {
      for (const tc of childElements(tr, "w:tc")) {
        ensureCellMargin(doc, tc, "90");
        for (const p of cellParagraphs(tc)) {
          const pPr = firstChild(p, "w:pPr");
          if (!pPr) continue;
          const numPr = firstChild(pPr, "w:numPr");
          if (!numPr) continue;
          let ind = firstChild(pPr, "w:ind");
          if (!ind) {
            ind = doc.createElementNS(W_NS, "w:ind");
            pPr.appendChild(ind);
          }
          const leftNum = Number(ind.getAttribute("w:left") ?? "0");
          const hangingNum = Number(ind.getAttribute("w:hanging") ?? "218") || 218;
          // Ensure bullet always starts well inside cell padding (+142 twips past left edge)
          const minLeft = hangingNum + 142;
          if (!Number.isFinite(leftNum) || leftNum < minLeft) {
            ind.setAttribute("w:left", String(minLeft));
            ind.setAttribute("w:hanging", String(hangingNum));
          }
        }
      }
    }
  }

  zip.file("word/document.xml", serializeXml(doc));
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
  const outZip = doc.getZip();
  polishCsuTablesXml(outZip);
  return outZip.generate({ type: "uint8array", compression: "DEFLATE" });
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
