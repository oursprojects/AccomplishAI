"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { Download, FileText, Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
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

const PT_TO_PX = 96 / 72;

function defaultFileName(data: ReportData): string {
  const slug = [data.date_from, data.date_to]
    .filter(Boolean)
    .join("_to_")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `Weekly-Accomplishment-Report_${slug}` : "2026-Weekly-Accomplishment-Report";
}

export function DocxPreviewPanel({ templateId, templateVersion, fields, data }: DocxPreviewPanelProps) {
  const inlineStageRef = useRef<HTMLDivElement | null>(null);
  const inlineContainerRef = useRef<HTMLDivElement | null>(null);
  const modalStageRef = useRef<HTMLDivElement | null>(null);
  const modalContainerRef = useRef<HTMLDivElement | null>(null);

  const templateBytesRef = useRef<ArrayBuffer | null>(null);
  const latestFilledRef = useRef<Uint8Array | null>(null);

  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paperSize, setPaperSize] = useState<PaperSize>("letter");
  const [zoom, setZoom] = useState(0.55);
  const [manualZoom, setManualZoom] = useState(false);

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [modalZoom, setModalZoom] = useState(0.75);
  const [modalManualZoom, setModalManualZoom] = useState(false);

  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [customFileName, setCustomFileName] = useState("");

  const targetKey = `${templateId}:${templateVersion}`;
  const loadingTemplate = loadedKey !== targetKey && !error;
  const dims = PAPER_DIMENSIONS[paperSize];
  const pagePxW = Math.round(dims.widthPt * PT_TO_PX);
  const pagePxH = Math.round(dims.heightPt * PT_TO_PX);

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

  const computeFitZoom = useCallback(
    (stageEl: HTMLDivElement | null, maxCap: number) => {
      const w = stageEl?.clientWidth ?? 0;
      if (w <= 0) return null;
      const available = Math.max(240, w - 24);
      return Number(Math.min(maxCap, Math.max(0.32, available / pagePxW)).toFixed(2));
    },
    [pagePxW],
  );

  // Fit inline preview cleanly to mobile/desktop viewport whenever visible or resized
  useEffect(() => {
    const sync = () => {
      if (manualZoom) return;
      const fit = computeFitZoom(inlineStageRef.current, 0.85);
      if (fit !== null) setZoom(fit);
    };
    sync();
    window.addEventListener("resize", sync);
    let observer: ResizeObserver | undefined;
    if (inlineStageRef.current && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(sync);
      observer.observe(inlineStageRef.current);
    }
    return () => {
      window.removeEventListener("resize", sync);
      observer?.disconnect();
    };
  }, [manualZoom, computeFitZoom]);

  // Fit modal preview cleanly when opened
  useEffect(() => {
    if (!previewModalOpen) return;
    const syncModal = () => {
      if (modalManualZoom) return;
      const fit = computeFitZoom(modalStageRef.current, 1.05);
      if (fit !== null) setModalZoom(fit);
    };
    const id = window.requestAnimationFrame(syncModal);
    window.addEventListener("resize", syncModal);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("resize", syncModal);
    };
  }, [previewModalOpen, modalManualZoom, computeFitZoom]);

  const renderInto = useCallback(
    async (targetEl: HTMLDivElement, filled: Uint8Array) => {
      const { renderAsync } = await import("docx-preview");
      targetEl.innerHTML = "";
      await renderAsync(filled.buffer as ArrayBuffer, targetEl, undefined, {
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        useBase64URL: true,
      });
      enhanceCsuPreviewChrome(targetEl, filled, paperSize);
    },
    [paperSize],
  );

  // Render inline preview whenever data, template, or paperSize changes
  useEffect(() => {
    if (loadedKey !== targetKey || !templateBytesRef.current || !inlineContainerRef.current) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!templateBytesRef.current || !inlineContainerRef.current) return;
      setRendering(true);
      setError(null);
      try {
        const filled = fillTemplate(templateBytesRef.current, data, fields);
        latestFilledRef.current = filled;
        await renderInto(inlineContainerRef.current, filled);
        if (!cancelled && previewModalOpen && modalContainerRef.current) {
          await renderInto(modalContainerRef.current, filled);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not render document preview.");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadedKey, targetKey, data, fields, paperSize, previewModalOpen, renderInto]);

  function openDownloadPrompt() {
    setCustomFileName(defaultFileName(data));
    setDownloadModalOpen(true);
  }

  function confirmDownload(e: React.FormEvent) {
    e.preventDefault();
    if (!templateBytesRef.current) return;
    const filled = latestFilledRef.current ?? fillTemplate(templateBytesRef.current, data, fields);
    const cleaned = customFileName
      .trim()
      .replace(/[<>:"/\\|?*]+/g, "-")
      .replace(/\.docx$/i, "");
    const finalName = `${cleaned || defaultFileName(data)}.docx`;
    const copy = new Uint8Array(filled);
    saveAs(new Blob([copy], { type: DOCX_MIME }), finalName);
    setDownloadModalOpen(false);
  }

  return (
    <>
      <div className="rounded-2xl border border-[#E6E4DD] bg-white shadow-xs overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6E4DD] bg-[#F7F6F0] px-3 sm:px-4 py-2.5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#C96442]" />
            <h3 className="text-sm font-semibold text-[#1F1E1C]">Live Document Preview</h3>
            {(loadingTemplate || rendering) && (
              <span className="inline-flex items-center rounded-full bg-[#D97757]/15 px-2 py-0.5 text-[11px] font-medium text-[#C96442] animate-pulse">
                {loadingTemplate ? "Loading..." : "Updating..."}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Paper size"
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as PaperSize)}
              className="rounded-xl border border-[#E0DDD3] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1F1E1C] outline-none focus:border-[#1F1E1C]"
            >
              <option value="letter">{PAPER_DIMENSIONS.letter.label}</option>
              <option value="folio">{PAPER_DIMENSIONS.folio.label}</option>
            </select>

            {/* Zoom controls visible on ALL viewports (including mobile) */}
            <div className="flex items-center rounded-xl border border-[#E0DDD3] bg-white text-xs overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setManualZoom(true);
                  setZoom((z) => Math.max(0.28, +(z - 0.08).toFixed(2)));
                }}
                className="p-1.5 text-[#57544E] hover:bg-[#F4F2EA] cursor-pointer"
                title="Zoom out"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="px-1.5 text-[11px] text-[#1F1E1C] font-mono">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => {
                  setManualZoom(true);
                  setZoom((z) => Math.min(1.25, +(z + 0.08).toFixed(2)));
                }}
                className="p-1.5 text-[#57544E] hover:bg-[#F4F2EA] cursor-pointer"
                title="Zoom in"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              {manualZoom && (
                <button
                  type="button"
                  onClick={() => setManualZoom(false)}
                  className="border-l border-[#E0DDD3] px-1.5 py-1 text-[10px] font-medium text-[#C96442] hover:bg-[#F4F2EA] cursor-pointer"
                  title="Fit to screen"
                >
                  Fit
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setModalManualZoom(false);
                setPreviewModalOpen(true);
              }}
              disabled={loadingTemplate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E0DDD3] bg-white px-3 py-1.5 text-xs font-medium text-[#1F1E1C] hover:bg-[#F4F2EA] disabled:opacity-50 transition cursor-pointer"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Preview Modal</span>
            </button>

            <button
              type="button"
              onClick={openDownloadPrompt}
              disabled={loadingTemplate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1F1E1C] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#33312E] disabled:opacity-50 transition cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download .docx</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="m-3.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Transform-scaled stage so mobile & desktop render identically */}
        <div
          ref={inlineStageRef}
          className="docx-preview-stage overflow-auto bg-[#ECEAE2] p-3 flex justify-center max-h-[75vh] lg:max-h-[calc(100vh-8.5rem)]"
        >
          <div
            style={{
              width: `${Math.round(pagePxW * zoom)}px`,
              height: `${Math.round(pagePxH * zoom)}px`,
              flexShrink: 0,
            }}
          >
            <div
              ref={inlineContainerRef}
              style={{
                width: `${dims.widthPt}pt`,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        </div>
      </div>

      {/* Full-Screen / Large Preview Modal */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1E1C]/60 backdrop-blur-xs p-2 sm:p-5">
          <div className="flex h-[94vh] w-full max-w-5xl flex-col rounded-2xl border border-[#E6E4DD] bg-[#FAF9F5] shadow-2xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6E4DD] bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#C96442]" />
                <h2 className="text-sm font-semibold text-[#1F1E1C]">Document Preview</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Modal paper size"
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value as PaperSize)}
                  className="rounded-xl border border-[#E0DDD3] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1F1E1C]"
                >
                  <option value="letter">{PAPER_DIMENSIONS.letter.label}</option>
                  <option value="folio">{PAPER_DIMENSIONS.folio.label}</option>
                </select>

                <div className="flex items-center rounded-xl border border-[#E0DDD3] bg-white text-xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setModalManualZoom(true);
                      setModalZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)));
                    }}
                    className="p-1.5 text-[#57544E] hover:bg-[#F4F2EA] cursor-pointer"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-2 text-[11px] font-mono text-[#1F1E1C]">
                    {Math.round(modalZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setModalManualZoom(true);
                      setModalZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)));
                    }}
                    className="p-1.5 text-[#57544E] hover:bg-[#F4F2EA] cursor-pointer"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  {modalManualZoom && (
                    <button
                      type="button"
                      onClick={() => setModalManualZoom(false)}
                      className="border-l border-[#E0DDD3] px-2 py-1 text-[10px] font-medium text-[#C96442] hover:bg-[#F4F2EA] cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3 inline mr-0.5" />
                      Fit
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={openDownloadPrompt}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#1F1E1C] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#33312E] cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download .docx</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  aria-label="Close preview modal"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#E0DDD3] bg-white text-[#57544E] hover:bg-[#F4F2EA] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              ref={modalStageRef}
              className="docx-preview-stage flex-1 overflow-auto bg-[#ECEAE2] p-4 flex justify-center"
            >
              <div
                style={{
                  width: `${Math.round(pagePxW * modalZoom)}px`,
                  height: `${Math.round(pagePxH * modalZoom)}px`,
                  flexShrink: 0,
                }}
              >
                <div
                  ref={modalContainerRef}
                  style={{
                    width: `${dims.widthPt}pt`,
                    transform: `scale(${modalZoom})`,
                    transformOrigin: "top left",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Filename Download Modal */}
      {downloadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1E1C]/50 backdrop-blur-xs p-4">
          <form
            onSubmit={confirmDownload}
            className="w-full max-w-md rounded-2xl border border-[#E6E4DD] bg-white p-5 shadow-xl space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D97757]/15 text-[#C96442]">
                  <Download className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[#1F1E1C]">Download Word Document</h3>
                  <p className="text-xs text-[#66645E]">Choose a file name before saving your `.docx`.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDownloadModalOpen(false)}
                className="rounded-lg p-1 text-[#66645E] hover:bg-[#F4F2EA] cursor-pointer"
                aria-label="Cancel download"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label htmlFor="docx-filename" className="block text-xs font-medium text-[#57544E] mb-1.5">
                File name
              </label>
              <div className="flex items-center rounded-xl border border-[#E0DDD3] bg-[#FAF9F5] focus-within:border-[#1F1E1C] focus-within:bg-white overflow-hidden">
                <input
                  id="docx-filename"
                  type="text"
                  autoFocus
                  value={customFileName}
                  onChange={(e) => setCustomFileName(e.target.value)}
                  placeholder="Weekly-Accomplishment-Report"
                  className="flex-1 bg-transparent px-3 py-2 text-sm text-[#1F1E1C] outline-none"
                />
                <span className="border-l border-[#E0DDD3] bg-[#F4F2EA] px-3 py-2 text-xs font-mono text-[#66645E]">
                  .docx
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDownloadModalOpen(false)}
                className="rounded-xl border border-[#E0DDD3] bg-white px-4 py-2 text-xs font-medium text-[#57544E] hover:bg-[#F4F2EA] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1F1E1C] px-4 py-2 text-xs font-medium text-white hover:bg-[#33312E] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
