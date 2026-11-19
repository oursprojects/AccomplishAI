"use client";

import { useEffect, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { DOCX_MIME, fillTemplate } from "@/lib/docx/fill";
import { enhanceCsuPreviewChrome, PAPER_DIMENSIONS, type PaperSize } from "@/lib/docx/csu-template-chrome";
import type { DetectedField } from "@/lib/docx/types";
import type { ReportData } from "@/lib/report-schema";

interface DocxPreviewPanelProps {
  templateId: string;
  templateVersion: string;
  fields: DetectedField[];
  data: ReportData;
}

export function DocxPreviewPanel({ templateId, templateVersion, fields, data }: DocxPreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const templateBytesRef = useRef<ArrayBuffer | null>(null);
  const latestFilledRef = useRef<Uint8Array | null>(null);

  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paperSize, setPaperSize] = useState<PaperSize>("letter");
  const [zoom, setZoom] = useState(0.68);
  const [manualZoom, setManualZoom] = useState(false);

  const targetKey = `${templateId}:${templateVersion}`;
  const loadingTemplate = loadedKey !== targetKey && !error;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/template-file?templateId=${encodeURIComponent(templateId)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? "Failed to fetch tagged template.");
        }
        const buf = await res.arrayBuffer();
        if (!cancelled) {
          templateBytesRef.current = buf;
          setError(null);
          setLoadedKey(targetKey);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load template.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [templateId, targetKey]);

  // Fit preview width cleanly to any mobile or desktop viewport (including tab switches)
  useEffect(() => {
    const updateZoom = () => {
      if (manualZoom) return;
      const stageWidth = stageRef.current?.clientWidth || window.innerWidth;
      if (stageWidth <= 0) return;
      // 612pt ~= 816px + 32px wrapper padding = 848px
      const fit = Math.min(0.85, Math.max(0.34, (stageWidth - 24) / 848));
      setZoom(Number(fit.toFixed(2)));
    };
    updateZoom();
    window.addEventListener("resize", updateZoom);
    let observer: ResizeObserver | undefined;
    if (stageRef.current && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        updateZoom();
        if (containerRef.current && latestFilledRef.current && stageRef.current && stageRef.current.clientWidth > 0) {
          enhanceCsuPreviewChrome(containerRef.current, latestFilledRef.current, paperSize);
        }
      });
      observer.observe(stageRef.current);
    }
    return () => {
      window.removeEventListener("resize", updateZoom);
      observer?.disconnect();
    };
  }, [manualZoom, paperSize]);

  // Dynamic @page size and physical print dimensions (never depend on vh)
  useEffect(() => {
    const dims = PAPER_DIMENSIONS[paperSize];
    const printHeightPt = dims.heightPt - 2; // 2pt safety margin prevents blank trailing page 2
    const style = document.createElement("style");
    style.id = "accomplish-print-page-size";
    style.textContent = `
      @page { size: ${dims.widthIn} ${dims.heightIn}; margin: 0; }
      @media print {
        .docx-preview-stage .docx-wrapper > section.docx {
          width: ${dims.widthPt}pt !important;
          height: ${printHeightPt}pt !important;
          min-height: ${printHeightPt}pt !important;
          max-height: ${printHeightPt}pt !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, [paperSize]);

  useEffect(() => {
    if (loadedKey !== targetKey || !templateBytesRef.current || !containerRef.current) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!templateBytesRef.current || !containerRef.current) return;
      setRendering(true);
      setError(null);
      try {
        const filled = fillTemplate(templateBytesRef.current, data, fields);
        latestFilledRef.current = filled;

        const { renderAsync } = await import("docx-preview");
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        await renderAsync(filled.buffer as ArrayBuffer, containerRef.current, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          useBase64URL: true,
        });
        if (!cancelled && containerRef.current) {
          enhanceCsuPreviewChrome(containerRef.current, filled, paperSize);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not render document preview.");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadedKey, targetKey, data, fields, paperSize]);

  function handleDownload() {
    if (!templateBytesRef.current) return;
    const filled = latestFilledRef.current ?? fillTemplate(templateBytesRef.current, data, fields);
    const slug = [data.date_from, data.date_to]
      .filter(Boolean)
      .join("-to-")
      .replace(/[^a-zA-Z0-9-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const fileName = slug ? `Weekly-Accomplishment-Report_${slug}.docx` : "2026-Weekly-Accomplishment-Report.docx";
    const copy = new Uint8Array(filled);
    saveAs(new Blob([copy], { type: DOCX_MIME }), fileName);
  }

  return (
    <div className="docx-print-root rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 px-3 sm:px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">1-Page Document Preview</h3>
          {(loadingTemplate || rendering) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 animate-pulse">
              {loadingTemplate ? "Loading..." : "Updating..."}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <select
            aria-label="Paper size"
            value={paperSize}
            onChange={(e) => setPaperSize(e.target.value as PaperSize)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-slate-900"
          >
            <option value="letter">{PAPER_DIMENSIONS.letter.label}</option>
            <option value="folio">{PAPER_DIMENSIONS.folio.label}</option>
          </select>

          <div className="hidden sm:flex items-center rounded-lg border border-slate-200 bg-white text-xs">
            <button
              type="button"
              onClick={() => {
                setManualZoom(true);
                setZoom((z) => Math.max(0.35, +(z - 0.08).toFixed(2)));
              }}
              className="px-2 py-1 text-slate-600 hover:bg-slate-100 cursor-pointer"
              title="Zoom out"
            >
              −
            </button>
            <span className="px-2 text-slate-700 font-mono">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => {
                setManualZoom(true);
                setZoom((z) => Math.min(1.2, +(z + 0.08).toFixed(2)));
              }}
              className="px-2 py-1 text-slate-600 hover:bg-slate-100 cursor-pointer"
              title="Zoom in"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={loadingTemplate}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50 transition cursor-pointer"
          >
            Download .docx
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            disabled={loadingTemplate}
            className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
          >
            Print 1 Page / PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="no-print m-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div ref={stageRef} className="docx-preview-stage overflow-auto bg-slate-200 max-h-[76vh] lg:max-h-[calc(100vh-10rem)]">
        <div ref={containerRef} style={{ zoom }} className="min-h-[380px]" />
      </div>
    </div>
  );
}
