"use client";

export interface AttachedChatFile {
  id: string;
  name: string;
  sizeBytes: number;
  textContent: string;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 10_000;

export const ACCEPTED_CHAT_FILE_EXTENSIONS =
  ".txt,.md,.csv,.json,.sql,.ts,.tsx,.js,.jsx,.py,.html,.css,.log,.yml,.yaml,.xml,.docx";

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractDocxXmlText(xml: string): string {
  const withBreaks = xml
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<\/w:tr>/gi, "\n")
    .replace(/<\/w:tc>/gi, "\t")
    .replace(/<w:br[^>]*\/>/gi, "\n")
    .replace(/<w:tab[^>]*\/>/gi, "\t")
    .replace(/<[^>]+>/g, "");
  return decodeXmlEntities(withBreaks)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Extracts clean text from uploaded `.docx`, `.csv`, `.json`, `.txt`, `.md`, or code files
 * right in the browser for AI analysis, charting, or document conversion.
 */
export async function readChatAttachment(file: File): Promise<AttachedChatFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" exceeds the 2 MB attachment limit.`);
  }
  if (file.size === 0) {
    throw new Error(`"${file.name}" is empty.`);
  }

  const lower = file.name.toLowerCase();
  let text = "";

  if (lower.endsWith(".docx")) {
    const { default: PizZip } = await import("pizzip");
    const buf = await file.arrayBuffer();
    const zip = new PizZip(buf);
    const docXml = zip.file("word/document.xml")?.asText();
    if (!docXml) {
      throw new Error(`Could not read document text inside "${file.name}".`);
    }
    text = extractDocxXmlText(docXml);
  } else {
    text = await file.text();
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`No readable text found in "${file.name}".`);
  }

  const clipped =
    trimmed.length > MAX_EXTRACTED_CHARS
      ? `${trimmed.slice(0, MAX_EXTRACTED_CHARS)}\n\n[Truncated after ${MAX_EXTRACTED_CHARS} characters]`
      : trimmed;

  return {
    id: `att-${crypto.randomUUID()}`,
    name: file.name,
    sizeBytes: file.size,
    textContent: clipped,
  };
}
