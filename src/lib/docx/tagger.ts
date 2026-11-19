import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { Document, Element } from "@xmldom/xmldom";
import type { DetectedField } from "./types";
import { cellParagraphs, childElements, descendants, firstChild, parseXml, serializeXml, W_NS } from "./xml";

/**
 * Injects docxtemplater tags into the ORIGINAL .docx at the locations described
 * by `fields`. Only the targeted paragraphs/runs are touched:
 *   - <w:pPr> (bullets, indents, alignment, borders) is kept as-is
 *   - the first run's <w:rPr> (font, size, bold, underline) is reused for the tag
 *   - tables, headers, footers, images, signatories and the Date line are untouched
 *
 * text fields  →  <w:p>{key}</w:p>
 * list fields  →  <w:p>{#key}</w:p><w:p>{.}</w:p><w:p>{/key}</w:p>
 *                 (paragraphLoop: the bullet paragraph repeats once per line)
 */
export function tagDocx(original: ArrayBuffer | Uint8Array | Buffer, fields: DetectedField[]): Uint8Array {
  const zip = new PizZip(original);
  const byPart = new Map<string, DetectedField[]>();
  for (const f of fields) {
    const list = byPart.get(f.ref.part) ?? [];
    list.push(f);
    byPart.set(f.ref.part, list);
  }

  for (const [part, partFields] of byPart) {
    const file = zip.file(part);
    if (!file) throw new Error(`Template part ${part} not found.`);
    const doc = parseXml(file.asText());
    const tables = descendants(doc, "w:tbl");

    // Resolve every target cell BEFORE mutating so positional refs stay valid.
    const targets = partFields.map((f) => {
      const tr = childElements(tables[f.ref.table] ?? fail(f), "w:tr")[f.ref.row] ?? fail(f);
      const tc = childElements(tr, "w:tc")[f.ref.cell] ?? fail(f);
      return { f, tc };
    });
    // Within the same cell, process later paragraphs first.
    targets.sort((a, b) => b.f.ref.fromParagraph - a.f.ref.fromParagraph);

    for (const { f, tc } of targets) {
      const paras = cellParagraphs(tc).slice(f.ref.fromParagraph);
      const template = paras[0] ?? appendParagraph(doc, tc);

      if (f.kind === "list") {
        const open = template.cloneNode(true) as Element;
        const item = template.cloneNode(true) as Element;
        const close = template.cloneNode(true) as Element;
        setParagraphText(doc, open, `{#${f.key}}`);
        setParagraphText(doc, item, "{.}");
        setParagraphText(doc, close, `{/${f.key}}`);
        tc.insertBefore(open, template);
        tc.insertBefore(item, template);
        tc.insertBefore(close, template);
        for (const p of paras.length ? paras : [template]) tc.removeChild(p);
      } else {
        setParagraphText(doc, template, `{${f.key}}`);
        for (const p of paras.slice(1)) tc.removeChild(p);
      }
    }

    zip.file(part, serializeXml(doc));
  }

  const out = zip.generate({ type: "uint8array", compression: "DEFLATE" });
  assertCompiles(out);
  return out;
}

/** Throws if docxtemplater cannot parse the tagged template (unbalanced/split tags). */
export function assertCompiles(tagged: Uint8Array) {
  new Docxtemplater(new PizZip(tagged), { paragraphLoop: true, linebreaks: true });
}

function fail(f: DetectedField): never {
  throw new Error(`Field "${f.key}" points to a missing cell (${f.candidateId}). Re-scan the template.`);
}

function appendParagraph(doc: Document, tc: Element): Element {
  const p = doc.createElementNS(W_NS, "w:p");
  tc.appendChild(p);
  return p;
}

const TRACKED_CHANGE_TAGS = new Set(["w:ins", "w:del", "w:moveFrom", "w:moveTo", "w:rPrChange"]);

/**
 * Replace a paragraph's content with a single run containing `text`, keeping
 * <w:pPr> and the first run's formatting (falls back to the paragraph-mark rPr
 * for empty cells such as "Verified By").
 */
function setParagraphText(doc: Document, p: Element, text: string) {
  const pPr = firstChild(p, "w:pPr");
  const firstRun = descendants(p, "w:r")[0];
  const source = (firstRun && firstChild(firstRun, "w:rPr")) ?? (pPr && firstChild(pPr, "w:rPr"));
  const rPr = source ? (source.cloneNode(true) as Element) : null;
  if (rPr) for (const c of childElements(rPr)) if (TRACKED_CHANGE_TAGS.has(c.nodeName)) rPr.removeChild(c);

  for (const child of childElements(p)) if (child !== pPr) p.removeChild(child);

  const r = doc.createElementNS(W_NS, "w:r");
  if (rPr) r.appendChild(rPr);
  const t = doc.createElementNS(W_NS, "w:t");
  t.setAttribute("xml:space", "preserve");
  t.appendChild(doc.createTextNode(text));
  r.appendChild(t);
  p.appendChild(r);
}
