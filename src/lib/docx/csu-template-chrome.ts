import PizZip from "pizzip";

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

/**
 * docx-preview struggles with Word's <wp:anchor wrapNone="true" flipH/flipV>
 * page-edge waves and <v:rect><v:textbox> SVG fallbacks (rendering solid black
 * boxes and misplaced logos). For the official CSU CICS 2026 template, replace
 * only the rendered <header> and <footer> chrome inside each <section.docx>
 * using the exact PNG assets from the .docx archive while leaving the dynamic
 * body <article> untouched.
 */
export function enhanceCsuPreviewChrome(
  container: HTMLElement,
  docxBytes: ArrayBuffer | Uint8Array,
): void {
  const media = extractCsuMedia(docxBytes);
  if (!media) return;

  const sections = container.querySelectorAll<HTMLElement>("section.docx");
  sections.forEach((section) => {
    section.style.position = "relative";
    section.style.overflow = "hidden";
    section.style.display = "flex";
    section.style.flexDirection = "column";
    section.style.width = "612pt";
    section.style.minHeight = "790pt";
    section.style.padding = "22pt 72pt 14pt 72pt";
    section.style.background = "#ffffff";
    section.style.color = "#000000";

    // Remove previously injected wave layers if re-running
    section.querySelectorAll(".csu-wave-layer").forEach((el) => el.remove());

    // Top-right -> top-left orange/gold wave banner
    const topWave = document.createElement("img");
    topWave.src = media.wave;
    topWave.alt = "";
    topWave.className = "csu-wave-layer";
    topWave.style.cssText =
      "position:absolute;top:0;left:0;width:46pt;height:612pt;transform-origin:top left;transform:translateX(612pt) rotate(90deg);pointer-events:none;z-index:0;";
    section.prepend(topWave);

    // Bottom-left -> bottom-right orange/gold wave banner
    const bottomWave = document.createElement("img");
    bottomWave.src = media.wave;
    bottomWave.alt = "";
    bottomWave.className = "csu-wave-layer";
    bottomWave.style.cssText =
      "position:absolute;top:100%;left:0;width:42pt;height:612pt;transform-origin:top left;transform:rotate(-90deg);pointer-events:none;z-index:0;";
    section.prepend(bottomWave);

    const header = section.querySelector("header");
    if (header) {
      header.style.cssText = "position:relative;z-index:1;margin:0 0 8pt 0;padding:0;";
      header.innerHTML = buildHeaderHtml(media);
    }

    const article = section.querySelector("article");
    if (article) {
      article.style.position = "relative";
      article.style.zIndex = "1";
      article.style.marginBottom = "auto";
    }

    const footer = section.querySelector("footer");
    if (footer) {
      footer.style.cssText = "position:relative;z-index:1;margin:6pt 0 0 0;padding:0;";
      footer.innerHTML = buildFooterHtml(media);
    }
  });
}

function buildHeaderHtml(media: TemplateMedia): string {
  return `
    <div style="display:flex;align-items:center;justify-content:center;gap:10pt;padding-top:4pt;margin-bottom:4pt;">
      <img src="${media.csuLogo}" alt="CSU Logo" style="width:56pt;height:58pt;object-fit:contain;flex-shrink:0;" />
      <div style="text-align:center;line-height:1.15;color:#000;">
        <div style="font-family:'Century Gothic','Trebuchet MS',sans-serif;font-size:10pt;">Republic of the Philippines</div>
        <div style="font-family:'Old English Text MT','UnifrakturMaguntia','Times New Roman',serif;font-size:13pt;font-weight:600;margin:1pt 0;">Cagayan State University</div>
        <div style="font-family:'Century Gothic','Trebuchet MS',sans-serif;font-size:10pt;">GONZAGA CAMPUS</div>
        <div style="font-family:'Century Gothic','Trebuchet MS',sans-serif;font-size:10pt;">Gonzaga, Cagayan</div>
      </div>
    </div>
    <div style="width:612pt;margin-left:-72pt;border-top:4pt double #000;border-bottom:4pt double #000;padding:2pt 12pt;text-align:center;font-family:'Century Gothic','Trebuchet MS',sans-serif;color:#000;background:transparent;">
      <span style="font-size:14pt;font-weight:700;">C</span><span style="font-size:11pt;">OLLEGE</span>
      <span style="font-family:'Brush Script MT','Segoe Script',cursive;font-size:12pt;margin:0 2pt;">of</span>
      <span style="font-size:14pt;font-weight:700;">I</span><span style="font-size:11pt;">NFORMATION</span>
      <span style="font-family:'Brush Script MT','Segoe Script',cursive;font-size:12pt;margin:0 2pt;">and</span>
      <span style="font-size:14pt;font-weight:700;">C</span><span style="font-size:11pt;">OMPUTING</span>
      <span style="font-size:14pt;font-weight:700;margin-left:3pt;">S</span><span style="font-size:11pt;">CIENCES</span>
    </div>
    <div style="text-align:center;font-family:'Century Gothic','Trebuchet MS',sans-serif;font-size:10pt;font-weight:700;color:#000;margin-top:9pt;">
      WEEKLY ACCOMPLISHMENT REPORT
    </div>
  `;
}

function buildFooterHtml(media: TemplateMedia): string {
  return `
    <div style="width:612pt;margin-left:-72pt;border-top:4pt double #000;padding:4pt 14pt 8pt 14pt;box-sizing:border-box;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6pt;color:#000;">
        <div style="display:flex;align-items:center;gap:4pt;flex-shrink:0;padding-top:3pt;">
          <img src="${media.bagongPilipinas}" alt="Bagong Pilipinas" style="width:32pt;height:33pt;object-fit:contain;" />
          <img src="${media.cicsLogo}" alt="CICS Logo" style="width:34pt;height:34pt;object-fit:contain;" />
        </div>

        <div style="flex:1;display:grid;grid-template-columns:1fr 1.12fr 1.48fr;gap:7pt;font-family:'Candara','Calibri','Segoe UI',sans-serif;font-size:6.4pt;line-height:1.15;text-align:left;">
          <div>
            <div style="font-family:'Berlin Sans FB Demi','Trebuchet MS',sans-serif;font-weight:700;font-size:6.7pt;margin-bottom:1.5pt;">CSU VISION</div>
            <div>CSU is a university with global stature in the arts, culture, agriculture and fisheries, the sciences as well as technological and professional fields.</div>
          </div>

          <div>
            <div style="font-family:'Berlin Sans FB Demi','Trebuchet MS',sans-serif;font-weight:700;font-size:6.7pt;margin-bottom:1.5pt;">CSU MISSION</div>
            <div>CSU is committed to transform the lives of people and communities through high quality instruction and innovative research, development, production and extension.</div>
          </div>

          <div>
            <div style="font-family:'Berlin Sans FB Demi','Trebuchet MS',sans-serif;font-weight:700;font-size:6.7pt;margin-bottom:1.5pt;">GOALS AND OBJECTIVES</div>
            <div>1. To produce proficient, competent and committed graduates equipped with the knowledge, skills and positive values demanded by the IT profession; and</div>
            <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:4pt;margin-top:1pt;">
              <span>2. To produce research and extension-service-oriented graduates.</span>
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
