import PizZip from "pizzip";
import type { Element } from "@xmldom/xmldom";
import type { ReportKey } from "@/lib/report-schema";
import { REPORT_FIELD_META } from "@/lib/report-schema";
import type { Candidate, CellRef, DetectionReason, ScanResult } from "./types";
import {
  cellParagraphs,
  cellText,
  childElements,
  contentParts,
  descendants,
  isListParagraph,
  normalize,
  parseXml,
  textOf,
} from "./xml";

/* -------------------------------------------------------------------------- */
/* Patterns                                                                   */
/* -------------------------------------------------------------------------- */

/** Name placeholders such as "LASTNAME. FIRSTNAME MI." / "FIRSTNAME MI. LASTNAME". */
const NAME_PLACEHOLDER = /\b(LAST\s?NAME|FIRST\s?NAME|SURNAME|MIDDLE\s?NAME|M\.?I\.)(?![A-Za-z])/;
const LAST_FIRST = /(LAST\s?NAME|SURNAME)[\s\S]*FIRST\s?NAME/;
const FIRST_LAST = /FIRST\s?NAME[\s\S]*(LAST\s?NAME|SURNAME)/;
/** Sample/instructional entries left in the template. */
const SAMPLE_TEXT = /\(example:|continue as necessary|^[.…\s]+$|lorem ipsum|sample/i;
/** Fixed text that must never be replaced (wet-ink lines, signatory blocks). */
const SIGNATURE_HEADER = /^(prepared|noted|approved|checked|verified|reviewed|certified)\s+by:?$/i;
const DATE_HEADER = /^date:?$/i;
const BLANK_LINE = /^_{3,}$/;

const DAY_TOKENS: Record<string, "mon" | "tue" | "wed" | "thu" | "fri" | "T"> = {
  M: "mon", MON: "mon", MONDAY: "mon",
  T: "T", // ambiguous → resolved by order (first T = tue, second T = thu)
  TU: "tue", TUE: "tue", TUES: "tue", TUESDAY: "tue",
  W: "wed", WED: "wed", WEDNESDAY: "wed",
  TH: "thu", THU: "thu", THUR: "thu", THURS: "thu", THURSDAY: "thu",
  F: "fri", FRI: "fri", FRIDAY: "fri",
};

function keyForLabel(label: string): ReportKey | null {
  const l = normalize(label).toLowerCase();
  if (/office|department|unit/.test(l)) return "office";
  if (/^from\b|start date|week of/.test(l)) return "date_from";
  if (/^to\b|end date/.test(l)) return "date_to";
  if (/total/.test(l) && /hour/.test(l)) return "total_hours_worked";
  if (/hour/.test(l)) return "hours_this_week";
  if (/training|seminar/.test(l)) return "new_trainings";
  if (/solution/.test(l)) return "solutions_done";
  if (/problem|challenge|issue/.test(l)) return "problems_encountered";
  return null;
}

function keyForPlaceholder(text: string): ReportKey | null {
  const t = text.toUpperCase();
  if (LAST_FIRST.test(t)) return "intern_name_last_first";
  if (FIRST_LAST.test(t)) return "intern_name_first_last";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Scanner                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Walks every table in word/document.xml + headers/footers and returns the
 * input areas of the template: placeholders, sample entries, value cells next
 * to labels, the Day | Accomplishments | Verified By grid, reflection sections
 * and the signature block. Pure function — no network, no mutation.
 */
export function scanDocx(input: ArrayBuffer | Uint8Array | Buffer | PizZip): ScanResult {
  const zip = input instanceof PizZip ? input : new PizZip(input);
  const candidates: Candidate[] = [];
  const structure: ScanResult["structure"] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const parts = contentParts(zip);
  if (!parts.includes("word/document.xml")) {
    throw new Error("Not a valid .docx: word/document.xml is missing.");
  }

  for (const part of parts) {
    const xml = zip.file(part)!.asText();
    const doc = parseXml(xml);
    const body = descendants(doc, "w:body")[0] ?? doc.documentElement!;

    // docxtemplater uses { } as delimiters — literal braces would be parsed as tags.
    if (/[{}]/.test(textOf(body as Element))) {
      warnings.push(`${part} contains literal "{" or "}" characters; they may be parsed as tags.`);
    }

    const tables = descendants(doc, "w:tbl");
    tables.forEach((tbl, t) => {
      const rows = childElements(tbl, "w:tr");
      const grid = rows.map((tr) => childElements(tr, "w:tc"));
      const gridText = grid.map((cells) => cells.map((tc) => cellText(tc)));
      structure.push({ part, table: t, rows: gridText });

      const shortPart = part.replace(/^word\//, "");
      const push = (
        r: number,
        c: number,
        fromParagraph: number,
        reason: DetectionReason,
        context: string,
        heuristicKey: ReportKey | null,
        locked = false,
      ) => {
        const ref: CellRef = { part, table: t, row: r, cell: c, fromParagraph };
        const id = `${shortPart}:t${t}:r${r}:c${c}:p${fromParagraph}`;
        if (seen.has(id)) return;
        seen.add(id);
        const paras = cellParagraphs(grid[r][c]).slice(fromParagraph);
        const currentText = paras.map((p) => textOf(p)).join("\n").trim();
        candidates.push({
          id,
          ref,
          reason,
          currentText,
          context: normalize(context),
          suggestedKind:
            heuristicKey ? REPORT_FIELD_META[heuristicKey].kind : paras.some(isListParagraph) ? "list" : "text",
          heuristicKey: locked ? null : heuristicKey,
          locked,
        });
      };

      const textAt = (r: number, c: number) => gridText[r]?.[c] ?? "";
      const columnHeader = (r: number, c: number) => {
        for (let i = r - 1; i >= 0; i--) {
          const s = textAt(i, c);
          if (s) return s;
        }
        return "";
      };

      /* ---- 1. Day | Accomplishments | Verified By grid ------------------- */
      const consumedRows = new Set<number>();
      const headerRow = gridText.findIndex(
        (cells) =>
          cells.some((s) => /^day$/i.test(s)) &&
          cells.some((s) => /accomplish/i.test(s)) &&
          cells.some((s) => /verif/i.test(s)),
      );
      if (headerRow >= 0) {
        const hdr = gridText[headerRow];
        const dayCol = hdr.findIndex((s) => /^day$/i.test(s));
        const accCol = hdr.findIndex((s) => /accomplish/i.test(s));
        const verCol = hdr.findIndex((s) => /verif/i.test(s));
        let tSeen = 0;
        consumedRows.add(headerRow);
        for (let r = headerRow + 1; r < grid.length; r++) {
          if (grid[r].length < hdr.length) break; // merged summary rows (hours) end the grid
          const token = DAY_TOKENS[textAt(r, dayCol).toUpperCase().replace(/[^A-Z]/g, "")];
          if (!token) continue;
          const day = token === "T" ? (tSeen++ === 0 ? "tue" : "thu") : token;
          consumedRows.add(r);
          const accText = textAt(r, accCol);
          push(
            r, accCol, 0,
            SAMPLE_TEXT.test(accText) ? "sample_entry" : accText ? "day_row" : "empty_cell",
            `Day row "${textAt(r, dayCol)}" → ${hdr[accCol]}`,
            `${day}_accomplishments` as ReportKey,
          );
          push(
            r, verCol, 0,
            textAt(r, verCol) ? "day_row" : "empty_cell",
            `Day row "${textAt(r, dayCol)}" → ${hdr[verCol]}`,
            `${day}_verified_by` as ReportKey,
          );
        }
      }

      /* ---- 2. Signature block (Prepared by / Noted by / Date) ------------ */
      const sigHeaderRow = gridText.findIndex((cells) =>
        cells.some((s) => SIGNATURE_HEADER.test(s)),
      );
      if (sigHeaderRow >= 0) {
        const hdr = gridText[sigHeaderRow];
        hdr.forEach((h, c) => {
          const isPrepared = /^prepared/i.test(h);
          const isDate = DATE_HEADER.test(h);
          if (!SIGNATURE_HEADER.test(h) && !isDate) return;
          for (let r = sigHeaderRow + 1; r < grid.length; r++) {
            const s = textAt(r, c);
            if (!s) continue;
            const below = textAt(r + 1, c);
            if (isPrepared && NAME_PLACEHOLDER.test(s)) {
              push(r, c, 0, "signature_name", `${h} ${below}`, keyForPlaceholder(s) ?? "intern_name_first_last");
            } else if (isDate || BLANK_LINE.test(s) || !isPrepared) {
              // Signatory name / title / wet-ink Date line: preserved verbatim.
              push(r, c, 0, isDate ? "empty_cell" : "signature_name", `${h} ${below}`.trim(), null, true);
            }
            break; // only the first filled cell under each header is the "value"
          }
        });
        consumedRows.add(sigHeaderRow);
      }

      /* ---- 3. Generic rows: placeholders, label→value, section bodies ---- */
      grid.forEach((cells, r) => {
        if (consumedRows.has(r)) return;
        cells.forEach((tc, c) => {
          const text = textAt(r, c);
          const paras = cellParagraphs(tc);

          // 3a. Name placeholders (LASTNAME. FIRSTNAME MI.)
          if (text && NAME_PLACEHOLDER.test(text) && text === text.toUpperCase()) {
            const left = c > 0 ? textAt(r, c - 1) : "";
            push(r, c, 0, "placeholder_text", `${left} ${columnHeader(r, c)}`.trim(), keyForPlaceholder(text));
            return;
          }

          // 3b. "Label:" cell → the next cell in the row is the value
          if (/:\s*$/.test(text) && c + 1 < cells.length) {
            const next = textAt(r, c + 1);
            if (/:\s*$/.test(next)) return; // next cell is another label
            const key = keyForLabel(text);
            push(r, c + 1, 0, next ? (SAMPLE_TEXT.test(next) ? "sample_entry" : "label_value_pair") : "empty_cell", text, key);
            return;
          }

          // 3c. Section cell: plain label paragraph followed by body paragraphs
          if (paras.length >= 2 && cells.length === 1) {
            const label = textOf(paras[0]).trim();
            if (label && !isListParagraph(paras[0])) {
              const bodyText = paras.slice(1).map((p) => textOf(p)).join(" ").trim();
              push(r, c, 1, bodyText ? "sample_entry" : "section_body", label, keyForLabel(label));
            }
          }
        });
      });
    });
  }

  return { candidates, structure, warnings };
}
