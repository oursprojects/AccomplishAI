import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { Document, Element, Node } from "@xmldom/xmldom";
import type PizZip from "pizzip";

export const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const ELEMENT_NODE = 1;

export function parseXml(xml: string): Document {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (level, msg) => {
      if (level === "fatalError" || level === "error") errors.push(msg);
    },
  }).parseFromString(xml, "text/xml");
  if (errors.length) throw new Error(`Invalid XML: ${errors[0]}`);
  return doc;
}

export function serializeXml(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

/** Direct child elements, optionally filtered by qualified name (e.g. "w:p"). */
export function childElements(el: Element | Document, name?: string): Element[] {
  const out: Element[] = [];
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i] as Node;
    if (n.nodeType === ELEMENT_NODE && (!name || n.nodeName === name)) out.push(n as Element);
  }
  return out;
}

export function firstChild(el: Element, name: string): Element | null {
  return childElements(el, name)[0] ?? null;
}

/** All descendants by qualified name, in document order. */
export function descendants(el: Element | Document, name: string): Element[] {
  const list = el.getElementsByTagName(name);
  const out: Element[] = [];
  for (let i = 0; i < list.length; i++) out.push(list[i] as Element);
  return out;
}

/** Visible text of a paragraph/run/cell (w:t, w:tab, w:br). Ignores deleted text. */
export function textOf(el: Element): string {
  let s = "";
  const walk = (node: Node) => {
    if (node.nodeType !== ELEMENT_NODE) return;
    const e = node as Element;
    switch (e.nodeName) {
      case "w:t":
        s += e.textContent ?? "";
        return;
      case "w:tab":
        s += "\t";
        return;
      case "w:br":
      case "w:cr":
        s += "\n";
        return;
      case "w:del":
      case "w:delText":
      case "w:instrText":
        return;
    }
    for (let i = 0; i < e.childNodes.length; i++) walk(e.childNodes[i] as Node);
  };
  walk(el);
  return s;
}

export const cellParagraphs = (tc: Element) => childElements(tc, "w:p");

export function cellText(tc: Element): string {
  return cellParagraphs(tc)
    .map((p) => textOf(p))
    .join("\n")
    .trim();
}

export function isListParagraph(p: Element): boolean {
  const pPr = firstChild(p, "w:pPr");
  return !!pPr && !!firstChild(pPr, "w:numPr");
}

/** The .docx XML parts that can hold user-visible fields. */
export function contentParts(zip: PizZip): string[] {
  return Object.keys(zip.files)
    .filter((name) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(name))
    .sort((a, b) => (a === "word/document.xml" ? -1 : b === "word/document.xml" ? 1 : a.localeCompare(b)));
}

export const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
