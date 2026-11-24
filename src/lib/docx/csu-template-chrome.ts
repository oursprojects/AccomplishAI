import PizZip from "pizzip";
import { DEFAULT_TEMPLATE_TEXTS, type TemplateTextOverrides } from "./types";

export type PaperSize = "letter";

export const PAPER_DIMENSIONS: Record<
  PaperSize,
  { label: string; widthPt: number; heightPt: number; widthIn: string; heightIn: string }
> = {
  letter: { label: '8.5" × 11" (Standard Letter)', widthPt: 612, heightPt: 792, widthIn: "8.5in", heightIn: "11in" },
};

interface TemplateMedia {
  csuLogo: string;
  wave: string;
  campus: string;
  qr: string;
  ambisyon: string;
  cicsLogo: string;
  bagongPilipinas: string;
}

function pngDataUrl(zip: PizZip, path: string): string | null {
  const file = zip.file(path);
  if (!file) return null;
  const base64 = toBase64(file.asUint8Array());
  return base64 ? `data:image/png;base64,${base64}` : null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function extractCsuMedia(docxBytes: ArrayBuffer | Uint8Array): TemplateMedia | null {
  try {
    const zip = new PizZip(docxBytes);
    const hdr = zip.file("word/header2.xml")?.asText() ?? "";
    const ftr = zip.file("word/footer2.xml")?.asText() ?? "";
    if (!hdr.includes("Cagayan State University") || !ftr.includes("CSU VISION")) {
      return null;
    }

    const csuLogo = pngDataUrl(zip, "word/media/image1.png");
    const wave = pngDataUrl(zip, "word/media/image2.png");
    const campus = pngDataUrl(zip, "word/media/image3.png");
    const qr = pngDataUrl(zip, "word/media/image4.png");
    const ambisyon = pngDataUrl(zip, "word/media/image5.png");
    const cicsLogo = pngDataUrl(zip, "word/media/image6.png");
    const bagongPilipinas = pngDataUrl(zip, "word/media/image7.png");

    if (!csuLogo || !wave || !campus || !qr || !ambisyon || !cicsLogo || !bagongPilipinas) {
      return null;
    }

    return { csuLogo, wave, campus, qr, ambisyon, cicsLogo, bagongPilipinas };
  } catch {
    return null;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Enhances the docx-preview DOM for the official 2026 CSU CICS template:
 * 1. Restores the exact header/footer PNG assets, waves, fonts, and double borders.
 * 2. Enforces a strict single-page 8.5" x 11" canvas.
 * 3. Proportionally auto-fits <article> if inputs get long so text NEVER overlaps
 *    the footer or spills onto a second printed page.
 */
export function enhanceCsuPreviewChrome(
  container: HTMLElement,
  docxBytes: ArrayBuffer | Uint8Array,
  paperSize: PaperSize = "letter",
  customTexts?: Partial<TemplateTextOverrides> | null,
): void {
  const media = extractCsuMedia(docxBytes);
  if (!media) return;
  const texts: TemplateTextOverrides = { ...DEFAULT_TEMPLATE_TEXTS, ...(customTexts ?? {}) };

  const dims = PAPER_DIMENSIONS[paperSize];
  const sidePadPt = 58; // (612 - 495.9 table width) / 2 -> keeps the table centered cleanly

  const sections = container.querySelectorAll<HTMLElement>("section.docx");
  sections.forEach((section, idx) => {
    // Force strict single page if docx-preview split across trailing empty paragraphs
    if (idx > 0 && !(section.textContent ?? "").trim()) {
      section.remove();
      return;
    }

    section.style.position = "relative";
    section.style.overflow = "hidden";
    section.style.display = "flex";
    section.style.flexDirection = "column";
    section.style.boxSizing = "border-box";
    section.style.width = `${dims.widthPt}pt`;
    section.style.height = `${dims.heightPt}pt`;
    section.style.minHeight = `${dims.heightPt}pt`;
    section.style.maxHeight = `${dims.heightPt}pt`;
    section.style.padding = `26pt ${sidePadPt}pt 12pt ${sidePadPt}pt`;
    section.style.background = "#ffffff";
    section.style.color = "#000000";

    section.querySelectorAll(".csu-wave-layer").forEach((el) => el.remove());

    const topWave = document.createElement("img");
    topWave.src = media.wave;
    topWave.alt = "";
    topWave.className = "csu-wave-layer";
    topWave.style.cssText =
      `position:absolute;top:0;left:0;width:46pt;height:${dims.widthPt}pt;transform-origin:top left;transform:translateX(${dims.widthPt}pt) rotate(90deg);pointer-events:none;z-index:0;`;
    section.prepend(topWave);

    const bottomWave = document.createElement("img");
    bottomWave.src = media.wave;
    bottomWave.alt = "";
    bottomWave.className = "csu-wave-layer";
    bottomWave.style.cssText =
      `position:absolute;top:100%;left:0;width:42pt;height:${dims.widthPt}pt;transform-origin:top left;transform:rotate(-90deg);pointer-events:none;z-index:0;`;
    section.prepend(bottomWave);

    const header = section.querySelector("header");
    if (header) {
      header.style.cssText = "position:relative;z-index:1;flex-shrink:0;margin:0 0 8pt 0;padding:0;";
      header.innerHTML = buildHeaderHtml(media, dims.widthPt, sidePadPt, texts);
    }

    const article = section.querySelector("article");
    const footer = section.querySelector("footer");
    if (footer) {
      footer.style.cssText = "position:relative;z-index:1;flex-shrink:0;margin:auto 0 0 0;padding:4pt 0 0 0;";
      footer.innerHTML = buildFooterHtml(media, dims.widthPt, sidePadPt, texts);
    }

    if (article) {
      // Remove trailing empty spacer paragraphs that docx-preview generates after the signature table
      while (article.lastElementChild?.tagName === "P" && !(article.lastElementChild.textContent ?? "").trim()) {
        article.lastElementChild.remove();
      }
      article.style.position = "relative";
      article.style.zIndex = "1";
      article.style.transform = "none";
      article.style.marginBottom = "0";
      article.style.flexShrink = "0";

      // Ensure tables stay crisp, centered, and keep Day cells & bullet indents well inside borders
      const articleTables = article.querySelectorAll<HTMLTableElement>("table");
      articleTables.forEach((tbl) => {
        tbl.style.maxWidth = "100%";
      });

      const mainTbl = articleTables[1];
      if (mainTbl) {
        const rows = mainTbl.querySelectorAll<HTMLTableRowElement>("tr");
        rows.forEach((row, rIdx) => {
          const cells = row.querySelectorAll<HTMLTableCellElement>("td, th");
          cells.forEach((td) => {
            if (!td.style.paddingLeft || td.style.paddingLeft === "0px" || td.style.paddingLeft === "0pt") {
              td.style.paddingLeft = "4.5pt";
            }
            if (!td.style.paddingRight || td.style.paddingRight === "0px" || td.style.paddingRight === "0pt") {
              td.style.paddingRight = "4.5pt";
            }
          });
          if (rIdx >= 1 && rIdx <= 5 && cells[0]) {
            const dayTxt = (cells[0].textContent ?? "").trim();
            if (/^[MTWTF]$/.test(dayTxt)) {
              cells[0].style.textAlign = "center";
              cells[0].querySelectorAll<HTMLElement>("p").forEach((p) => {
                p.style.textAlign = "center";
                p.style.marginLeft = "0";
                p.style.textIndent = "0";
              });
            }
          }
        });
      }

      // Fit <article> cleanly between <header> and <footer> using untransformed CSS layout
      // metrics (clientHeight/offsetHeight/scrollHeight) so parent zoom transforms on mobile
      // never shrink the body content disproportionately.
      if (header && footer) {
        const ptToPx = 96 / 72;
        const sectionStyle = getComputedStyle(section);
        const headerStyle = getComputedStyle(header);
        const footerStyle = getComputedStyle(footer);
        const sectionHeightPx = section.clientHeight || dims.heightPt * ptToPx;
        const padTopPx = parseFloat(sectionStyle.paddingTop) || 26 * ptToPx;
        const padBottomPx = parseFloat(sectionStyle.paddingBottom) || 12 * ptToPx;
        const headerHeightPx =
          (header.offsetHeight || 110 * ptToPx) + (parseFloat(headerStyle.marginBottom) || 8 * ptToPx);
        const footerHeightPx =
          (footer.offsetHeight || 64 * ptToPx) + (parseFloat(footerStyle.marginTop) || 0);

        const availablePx = Math.max(
          260,
          sectionHeightPx - padTopPx - padBottomPx - headerHeightPx - footerHeightPx - 10,
        );
        const articleHeightPx = article.scrollHeight;
        if (articleHeightPx > availablePx && articleHeightPx > 0) {
          const scale = Math.max(0.68, availablePx / articleHeightPx);
          article.style.transform = `scale(${scale})`;
          article.style.transformOrigin = "top center";
          article.style.marginBottom = `-${Math.ceil(articleHeightPx * (1 - scale))}px`;
        }
      }
    }
  });
}

function buildHeaderHtml(
  media: TemplateMedia,
  widthPt: number,
  sidePadPt: number,
  texts: TemplateTextOverrides,
): string {
  const isDefaultCollege = texts.college_banner === DEFAULT_TEMPLATE_TEXTS.college_banner;
  const collegeHtml = isDefaultCollege
    ? `<span style="font-size:14pt;font-weight:700;">C</span><span style="font-size:11pt;">OLLEGE</span>
      <span style="font-family:'Brush Script MT','Segoe Script',cursive;font-size:12pt;margin:0 2pt;">of</span>
      <span style="font-size:14pt;font-weight:700;">I</span><span style="font-size:11pt;">NFORMATION</span>
      <span style="font-family:'Brush Script MT','Segoe Script',cursive;font-size:12pt;margin:0 2pt;">and</span>
      <span style="font-size:14pt;font-weight:700;">C</span><span style="font-size:11pt;">OMPUTING</span>
      <span style="font-size:14pt;font-weight:700;margin-left:3pt;">S</span><span style="font-size:11pt;">CIENCES</span>`
    : `<span style="font-size:11.5pt;font-weight:700;">${escapeHtml(texts.college_banner)}</span>`;

  return `
    <div style="display:flex;align-items:center;justify-content:center;gap:10pt;padding-top:4pt;margin-bottom:4pt;">
      <img src="${media.csuLogo}" alt="CSU Logo" style="width:56pt;height:58pt;object-fit:contain;flex-shrink:0;" />
      <div style="text-align:center;line-height:1.15;color:#000;">
        <div style="font-family:'Century Gothic','Trebuchet MS',sans-serif;font-size:10pt;">${escapeHtml(texts.country_header)}</div>
        <div style="font-family:'Old English Text MT',var(--font-old-english),'Times New Roman',serif;font-size:13pt;font-weight:600;margin:1pt 0;">${escapeHtml(texts.university_header)}</div>
        <div style="font-family:'Century Gothic','Trebuchet MS',sans-serif;font-size:10pt;">${escapeHtml(texts.campus_header)}</div>
        <div style="font-family:'Century Gothic','Trebuchet MS',sans-serif;font-size:10pt;">${escapeHtml(texts.campus_address)}</div>
      </div>
    </div>
    <div style="width:${widthPt}pt;margin-left:-${sidePadPt}pt;border-top:4pt double #000;border-bottom:4pt double #000;padding:2pt 12pt;text-align:center;font-family:'Century Gothic','Trebuchet MS',sans-serif;color:#000;background:transparent;box-sizing:border-box;">
      ${collegeHtml}
    </div>
    <div style="text-align:center;font-family:'Century Gothic','Trebuchet MS',sans-serif;font-size:10pt;font-weight:700;color:#000;margin-top:8pt;">
      ${escapeHtml(texts.report_title)}
    </div>
  `;
}

function buildFooterHtml(
  media: TemplateMedia,
  widthPt: number,
  sidePadPt: number,
  texts: TemplateTextOverrides,
): string {
  return `
    <div style="width:${widthPt}pt;margin-left:-${sidePadPt}pt;border-top:4pt double #000;padding:4pt 14pt 8pt 14pt;box-sizing:border-box;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6pt;color:#000;">
        <div style="display:flex;align-items:center;gap:4pt;flex-shrink:0;padding-top:3pt;">
          <img src="${media.bagongPilipinas}" alt="Bagong Pilipinas" style="width:32pt;height:33pt;object-fit:contain;" />
          <img src="${media.cicsLogo}" alt="CICS Logo" style="width:34pt;height:34pt;object-fit:contain;" />
        </div>

        <div style="flex:1;display:grid;grid-template-columns:1fr 1.12fr 1.48fr;gap:7pt;font-family:'Candara','Calibri','Segoe UI',sans-serif;font-size:6.4pt;line-height:1.15;text-align:left;">
          <div>
            <div style="font-family:'Berlin Sans FB Demi','Trebuchet MS',sans-serif;font-weight:700;font-size:6.7pt;margin-bottom:1.5pt;">${escapeHtml(texts.vision_title)}</div>
            <div>${escapeHtml(texts.vision_body)}</div>
          </div>

          <div>
            <div style="font-family:'Berlin Sans FB Demi','Trebuchet MS',sans-serif;font-weight:700;font-size:6.7pt;margin-bottom:1.5pt;">${escapeHtml(texts.mission_title)}</div>
            <div>${escapeHtml(texts.mission_body)}</div>
          </div>

          <div>
            <div style="font-family:'Berlin Sans FB Demi','Trebuchet MS',sans-serif;font-weight:700;font-size:6.7pt;margin-bottom:1.5pt;">${escapeHtml(texts.pledge_title)}</div>
            <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:4pt;">
              <div>${escapeHtml(texts.pledge_body)}</div>
              <img src="${media.ambisyon}" alt="Ambisyon Natin 2040" style="width:50pt;height:23pt;object-fit:contain;flex-shrink:0;" />
            </div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:4pt;flex-shrink:0;padding-top:1pt;">
          <img src="${media.campus}" alt="CSU Gonzaga Campus" style="width:60pt;height:46pt;object-fit:contain;" />
          <img src="${media.qr}" alt="QR Code" style="width:45pt;height:45pt;object-fit:contain;" />
        </div>
      </div>
    </div>
  `;
}
