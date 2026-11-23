import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { Document, Element } from "@xmldom/xmldom";
import { normalizeDateToLongFormat } from "@/lib/internship-calendar";
import type { ReportData } from "@/lib/report-schema";
import { REPORT_KEYS } from "@/lib/report-schema";
import {
  DEFAULT_TEMPLATE_TEXTS,
  resolveTemplateTexts,
  type DetectedField,
  type TemplateTextOverrides,
} from "./types";
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
export function buildRenderData(data: Partial<ReportData>, fields: ReadonlyArray<Pick<DetectedField, "key" | "kind">>) {
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

function replaceParagraphPlainText(doc: Document, p: Element, nextText: string) {
  const pPr = firstChild(p, "w:pPr");
  const firstRun = descendants(p, "w:r")[0];
  const rPrSource = (firstRun && firstChild(firstRun, "w:rPr")) ?? (pPr && firstChild(pPr, "w:rPr"));
  const rPr = rPrSource ? (rPrSource.cloneNode(true) as Element) : null;
  for (const child of childElements(p)) {
    if (child !== pPr) p.removeChild(child);
  }
  const r = doc.createElementNS(W_NS, "w:r");
  if (rPr) r.appendChild(rPr);
  const t = doc.createElementNS(W_NS, "w:t");
  t.setAttribute("xml:space", "preserve");
  t.appendChild(doc.createTextNode(nextText));
  r.appendChild(t);
  p.appendChild(r);
}

function setCellFirstParagraphText(doc: Document, tc: Element | undefined, nextText: string) {
  if (!tc) return;
  const p = cellParagraphs(tc)[0];
  if (p) replaceParagraphPlainText(doc, p, nextText);
}

/**
 * Normalizes CSU Weekly Accomplishment table alignment, strict 8.5" x 11" page size,
 * bullet indents, and applies any user-customized template texts across document.xml.
 */
function polishCsuTablesXml(zip: PizZip, texts: TemplateTextOverrides) {
  const part = zip.file("word/document.xml");
  if (!part) return;
  const doc = parseXml(part.asText());

  // Strictly enforce 8.5" x 11" (12240 x 15840 twips) on all section page sizes
  for (const pgSz of descendants(doc, "w:pgSz")) {
    pgSz.setAttribute("w:w", "12240");
    pgSz.setAttribute("w:h", "15840");
  }

  // Update document title paragraph if customized
  if (texts.report_title !== DEFAULT_TEMPLATE_TEXTS.report_title) {
    for (const p of descendants(doc, "w:p")) {
      if (textOf(p).trim() === DEFAULT_TEMPLATE_TEXTS.report_title) {
        replaceParagraphPlainText(doc, p, texts.report_title);
      }
    }
  }

  const tables = descendants(doc, "w:tbl");

  // Table 0: Student Intern / Office / From / To labels
  const tbl0 = tables[0];
  if (tbl0) {
    const r0 = childElements(tbl0, "w:tr");
    const row0Cells = r0[0] ? childElements(r0[0], "w:tc") : [];
    const row1Cells = r0[1] ? childElements(r0[1], "w:tc") : [];
    if (texts.label_student_intern !== DEFAULT_TEMPLATE_TEXTS.label_student_intern) {
      setCellFirstParagraphText(doc, row0Cells[0], texts.label_student_intern);
    }
    if (texts.label_office !== DEFAULT_TEMPLATE_TEXTS.label_office) {
      setCellFirstParagraphText(doc, row0Cells[2], texts.label_office);
    }
    if (texts.label_from !== DEFAULT_TEMPLATE_TEXTS.label_from) {
      setCellFirstParagraphText(doc, row1Cells[0], texts.label_from);
    }
    if (texts.label_to !== DEFAULT_TEMPLATE_TEXTS.label_to) {
      setCellFirstParagraphText(doc, row1Cells[2], texts.label_to);
    }
  }

  const mainTbl = tables[1];
  if (!mainTbl) return;

  const mainRows = childElements(mainTbl, "w:tr");
  const headerCells = mainRows[0] ? childElements(mainRows[0], "w:tc") : [];
  const isWeeklyReportTable =
    headerCells.length >= 2 &&
    textOf(headerCells[0]).trim().toLowerCase() === "day" &&
    textOf(headerCells[1]).toLowerCase().includes("accomplishment");
  if (!isWeeklyReportTable) return;

  if (texts.col_day !== DEFAULT_TEMPLATE_TEXTS.col_day) {
    setCellFirstParagraphText(doc, headerCells[0], texts.col_day);
  }
  if (texts.col_accomplishments !== DEFAULT_TEMPLATE_TEXTS.col_accomplishments) {
    setCellFirstParagraphText(doc, headerCells[1], texts.col_accomplishments);
  }
  if (texts.col_verified_by !== DEFAULT_TEMPLATE_TEXTS.col_verified_by) {
    setCellFirstParagraphText(doc, headerCells[2], texts.col_verified_by);
  }

  const dayOverrides = [texts.day_mon, texts.day_tue, texts.day_wed, texts.day_thu, texts.day_fri];
  const dayDefaults = [
    DEFAULT_TEMPLATE_TEXTS.day_mon,
    DEFAULT_TEMPLATE_TEXTS.day_tue,
    DEFAULT_TEMPLATE_TEXTS.day_wed,
    DEFAULT_TEMPLATE_TEXTS.day_thu,
    DEFAULT_TEMPLATE_TEXTS.day_fri,
  ];

  // Center M, T, W, T, F in column 0 of rows 1..5 and add comfortable horizontal padding
  for (let r = 1; r < mainRows.length; r++) {
    const cells = childElements(mainRows[r], "w:tc");
    for (let c = 0; c < cells.length; c++) {
      ensureCellMargin(doc, cells[c], "90");
    }
    if (r >= 1 && r <= 5 && cells[0]) {
      const idx = r - 1;
      if (dayOverrides[idx] !== dayDefaults[idx]) {
        setCellFirstParagraphText(doc, cells[0], dayOverrides[idx]);
      }
      for (const p of cellParagraphs(cells[0])) {
        setParagraphAlign(doc, p, "center");
      }
    }
    if (r === 6 && cells[0] && texts.label_hours_week !== DEFAULT_TEMPLATE_TEXTS.label_hours_week) {
      setCellFirstParagraphText(doc, cells[0], texts.label_hours_week);
    }
    if (r === 7 && cells[0] && texts.label_total_hours !== DEFAULT_TEMPLATE_TEXTS.label_total_hours) {
      setCellFirstParagraphText(doc, cells[0], texts.label_total_hours);
    }
  }

  // Table 2: Reflections labels
  const tbl2 = tables[2];
  if (tbl2) {
    const r2 = childElements(tbl2, "w:tr");
    const reflectionOverrides = [
      [texts.label_new_trainings, DEFAULT_TEMPLATE_TEXTS.label_new_trainings],
      [texts.label_problems, DEFAULT_TEMPLATE_TEXTS.label_problems],
      [texts.label_solutions, DEFAULT_TEMPLATE_TEXTS.label_solutions],
    ] as const;
    reflectionOverrides.forEach(([val, def], idx) => {
      if (val !== def && r2[idx]) {
        const tc = childElements(r2[idx], "w:tc")[0];
        setCellFirstParagraphText(doc, tc, val);
      }
    });
  }

  // Table 3: Signatories & Date block
  const tbl3 = tables[3];
  if (tbl3) {
    const r3 = childElements(tbl3, "w:tr");
    const hdrCells = r3[0] ? childElements(r3[0], "w:tc") : [];
    const nameCells = r3[3] ? childElements(r3[3], "w:tc") : [];
    const roleCells = r3[4] ? childElements(r3[4], "w:tc") : [];
    if (texts.label_prepared_by !== DEFAULT_TEMPLATE_TEXTS.label_prepared_by) {
      setCellFirstParagraphText(doc, hdrCells[0], texts.label_prepared_by);
    }
    if (texts.label_noted_by !== DEFAULT_TEMPLATE_TEXTS.label_noted_by) {
      setCellFirstParagraphText(doc, hdrCells[1], texts.label_noted_by);
    }
    if (texts.label_date !== DEFAULT_TEMPLATE_TEXTS.label_date) {
      setCellFirstParagraphText(doc, hdrCells[2], texts.label_date);
    }
    if (texts.noted_by_name !== DEFAULT_TEMPLATE_TEXTS.noted_by_name) {
      setCellFirstParagraphText(doc, nameCells[1], texts.noted_by_name);
    }
    if (texts.date_line !== DEFAULT_TEMPLATE_TEXTS.date_line) {
      setCellFirstParagraphText(doc, nameCells[2], texts.date_line);
    }
    if (texts.prepared_by_role !== DEFAULT_TEMPLATE_TEXTS.prepared_by_role) {
      setCellFirstParagraphText(doc, roleCells[0], texts.prepared_by_role);
    }
    if (texts.noted_by_title !== DEFAULT_TEMPLATE_TEXTS.noted_by_title) {
      setCellFirstParagraphText(doc, roleCells[1], texts.noted_by_title);
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
  fields: ReadonlyArray<Pick<DetectedField, "key" | "kind" | "customTexts">>,
  customTextOverrides?: Partial<TemplateTextOverrides> | null,
): Uint8Array {
  const doc = new Docxtemplater(new PizZip(tagged), {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(buildRenderData(data, fields));
  const outZip = doc.getZip();
  const texts = resolveTemplateTexts(fields, customTextOverrides);
  polishCsuTablesXml(outZip, texts);
  return outZip.generate({ type: "uint8array", compression: "DEFLATE" });
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Computes a safe, clean .docx filename (without extension) from report title or dates. */
export function defaultReportFileName(data: Partial<ReportData>, reportTitle?: string): string {
  const custom = (reportTitle ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (custom) return custom;

  const slug = [data.date_from, data.date_to]
    .filter(Boolean)
    .join("_to_")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `Weekly-Accomplishment-Report_${slug}` : "2026-Weekly-Accomplishment-Report";
}
