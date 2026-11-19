"use client";

import { useEffect, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { DOCX_MIME, fillTemplate } from "@/lib/docx/fill";
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
  const templateBytesRef = useRef<ArrayBuffer | null>(null);
  const latestFilledRef = useRef<Uint8Array | null>(null);

  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.75);

  const targetKey = `${templateId}:${templateVersion}`;
  const loadingTemplate = loadedKey !== targetKey && !error;

  // Fetch the user's tagged master.docx whenever templateId or updated_at changes
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

  // Auto-pick comfortable zoom on narrow screens
  useEffect(() => {
    const updateZoom = () => {
      const w = window.innerWidth;
      if (w < 480) setZoom(0.42);
      else if (w < 640) setZoom(0.55);
      else if (w < 1024) setZoom(0.72);
      else setZoom(0.68);
    };
    updateZoom();
    window.addEventListener("resize", updateZoom);
    return () => window.removeEventListener("resize", updateZoom);
  }, []);

  // Re-fill and render with docx-preview whenever data or template changes (debounced)
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
  }, [loadedKey, targetKey, data, fields]);

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

  function handlePrint() {
    window.print();
  }

  return (
    <div className="docx-print-root rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Live Document Preview</h3>
          {(loadingTemplate || rendering) && (
            <span className="text-xs text-slate-500 animate-pulse">
              {loadingTemplate ? "Loading template..." : "Updating..."}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden sm:flex items-center rounded-lg border border-slate-200 bg-white text-xs">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
              className="px-2 py-1 text-slate-600 hover:bg-slate-100 cursor-pointer"
              title="Zoom out"
            >
              −
            </button>
            <span className="px-2 text-slate-700 font-mono">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.1).toFixed(2)))}
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
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50 transition cursor-pointer"
          >
            Download .docx
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={loadingTemplate}
            className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs sm:text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="no-print m-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="docx-preview-stage overflow-auto bg-slate-200 max-h-[75vh] lg:max-h-[calc(100vh-11rem)]">
        <div ref={containerRef} style={{ zoom }} className="min-h-[420px]" />
      </div>
    </div>
  );
}
