"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { Check, Copy, Download, FileText, Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { fetchCachedTemplateBytes, warmDocxPreview } from "@/lib/docx/client-cache";
import { defaultReportFileName, DOCX_MIME, fillTemplate } from "@/lib/docx/fill";
import { enhanceCsuPreviewChrome, PAPER_DIMENSIONS, type PaperSize } from "@/lib/docx/csu-template-chrome";
import { resolveTemplateTexts, type DetectedField } from "@/lib/docx/types";
import { DAYS, type ReportData } from "@/lib/report-schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface DocxPreviewPanelProps {
  templateId: string;
  templateVersion: string;
  fields: DetectedField[];
  data: ReportData;
  reportTitle?: string;
}

const PT_TO_PX = 96 / 72;

export function DocxPreviewPanel({ templateId, templateVersion, fields, data, reportTitle }: DocxPreviewPanelProps) {
  const inlineStageRef = useRef<HTMLDivElement | null>(null);
  const inlineContainerRef = useRef<HTMLDivElement | null>(null);
  const modalStageRef = useRef<HTMLDivElement | null>(null);
  const modalContainerRef = useRef<HTMLDivElement | null>(null);

  const templateBytesRef = useRef<ArrayBuffer | null>(null);
  const latestFilledRef = useRef<Uint8Array | null>(null);
  const lastStageWidthRef = useRef<number>(0);
  const hasRenderedOnceRef = useRef<boolean>(false);

  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paperSize: PaperSize = "letter";
  const [zoom, setZoom] = useState(0.7);
  const [manualZoom, setManualZoom] = useState(false);

  const customTexts = useMemo(() => resolveTemplateTexts(fields), [fields]);

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [modalZoom, setModalZoom] = useState(0.75);
  const [modalManualZoom, setModalManualZoom] = useState(false);

  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [customFileName, setCustomFileName] = useState("");
  const [copiedSummary, setCopiedSummary] = useState(false);

  async function handleCopySummaryText() {
    const dayNames = {
      mon: "Monday",
      tue: "Tuesday",
      wed: "Wednesday",
      thu: "Thursday",
      fri: "Friday",
    } as const;
    const lines: string[] = [
      `WEEKLY ACCOMPLISHMENT REPORT${reportTitle ? ` — ${reportTitle}` : ""}`,
      `Intern: ${data.intern_name_last_first || "-"} | Office: ${data.office || "-"}`,
      `Period: ${[data.date_from, data.date_to].filter(Boolean).join(" – ") || "-"}`,
      "",
    ];
    for (const d of DAYS) {
      const tasks = data[`${d}_accomplishments`]?.trim();
      if (tasks) {
        lines.push(`${dayNames[d]}:`);
        for (const item of tasks.split(/\r?\n/)) {
          if (item.trim()) lines.push(`• ${item.trim()}`);
        }
      }
    }
    if (data.hours_this_week || data.total_hours_worked) {
      lines.push("", `Hours This Week: ${data.hours_this_week || "-"} | Total Hours: ${data.total_hours_worked || "-"}`);
    }
    if (data.new_trainings?.trim()) lines.push(`New Trainings: ${data.new_trainings.trim()}`);
    if (data.problems_encountered?.trim()) lines.push(`Problems: ${data.problems_encountered.trim()}`);
    if (data.solutions_done?.trim()) lines.push(`Solutions: ${data.solutions_done.trim()}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopiedSummary(true);
      toast.success("Copied report summary text.");
      window.setTimeout(() => setCopiedSummary(false), 1800);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  const targetKey = `${templateId}:${templateVersion}`;
  const loadingTemplate = loadedKey !== targetKey && !error;
  const dims = PAPER_DIMENSIONS[paperSize];
  const pagePxW = Math.round(dims.widthPt * PT_TO_PX);
  const pagePxH = Math.round(dims.heightPt * PT_TO_PX);

  useEffect(() => {
    let cancelled = false;
    hasRenderedOnceRef.current = false;
    void warmDocxPreview().catch(() => {});

    async function load() {
      try {
        const buf = await fetchCachedTemplateBytes(templateId, templateVersion);
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
  }, [templateId, templateVersion, targetKey]);

  const computeFitZoom = useCallback(
    (stageEl: HTMLDivElement | null, maxCap: number) => {
      const w = stageEl?.clientWidth ?? 0;
      if (w <= 0) return null;
      const available = Math.max(240, w - 24);
      return Number(Math.min(maxCap, Math.max(0.32, available / pagePxW)).toFixed(2));
    },
    [pagePxW],
  );

  // Fit inline preview cleanly to mobile/desktop viewport and re-enhance if stage became visible
  useEffect(() => {
    const sync = () => {
      const width = inlineStageRef.current?.clientWidth ?? 0;
      const becameVisible = lastStageWidthRef.current === 0 && width > 0;
      lastStageWidthRef.current = width;

      if (becameVisible && inlineContainerRef.current && latestFilledRef.current) {
        enhanceCsuPreviewChrome(inlineContainerRef.current, latestFilledRef.current, paperSize, customTexts);
      }

      if (!manualZoom) {
        const fit = computeFitZoom(inlineStageRef.current, 0.96);
        if (fit !== null) setZoom(fit);
      }
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
  }, [manualZoom, computeFitZoom, paperSize, customTexts]);

  // Fit modal preview cleanly when opened or resized on mobile/tablet/desktop
  useEffect(() => {
    if (!previewModalOpen) return;
    const syncModal = () => {
      if (modalManualZoom) return;
      const fit = computeFitZoom(modalStageRef.current, 1.05);
      if (fit !== null) setModalZoom(fit);
    };
    const id = window.requestAnimationFrame(syncModal);
    window.addEventListener("resize", syncModal);
    let observer: ResizeObserver | undefined;
    if (modalStageRef.current && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(syncModal);
      observer.observe(modalStageRef.current);
    }
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("resize", syncModal);
      observer?.disconnect();
    };
  }, [previewModalOpen, modalManualZoom, computeFitZoom]);

  const renderInto = useCallback(
    async (targetEl: HTMLDivElement, filled: Uint8Array) => {
      const { renderAsync } = await warmDocxPreview();
      targetEl.innerHTML = "";
      await renderAsync(filled.slice().buffer, targetEl, undefined, {
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        useBase64URL: true,
      });
      enhanceCsuPreviewChrome(targetEl, filled, paperSize, customTexts);
    },
    [paperSize, customTexts],
  );

  // Render inline preview immediately on first load, and quickly debounce live edits
  useEffect(() => {
    if (loadedKey !== targetKey || !templateBytesRef.current || !inlineContainerRef.current) return;

    let cancelled = false;
    const delayMs = hasRenderedOnceRef.current ? 40 : 0;

    const run = async () => {
      if (!templateBytesRef.current || !inlineContainerRef.current) return;
      setRendering(true);
      setError(null);
      try {
        const filled = fillTemplate(templateBytesRef.current, data, fields, customTexts);
        latestFilledRef.current = filled;
        await renderInto(inlineContainerRef.current, filled);
        hasRenderedOnceRef.current = true;
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
    };

    if (delayMs === 0) {
      void run();
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => void run(), delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadedKey, targetKey, data, fields, customTexts, paperSize, previewModalOpen, renderInto]);

  function openDownloadPrompt() {
    setCustomFileName(defaultReportFileName(data, reportTitle));
    setDownloadModalOpen(true);
  }

  function confirmDownload(e: React.FormEvent) {
    e.preventDefault();
    if (!templateBytesRef.current) return;
    const filled = latestFilledRef.current ?? fillTemplate(templateBytesRef.current, data, fields, customTexts);
    const cleaned = customFileName
      .trim()
      .replace(/[<>:"/\\|?*]+/g, "-")
      .replace(/\.docx$/i, "");
    const finalName = `${cleaned || defaultReportFileName(data, reportTitle)}.docx`;
    const copy = new Uint8Array(filled);
    saveAs(new Blob([copy], { type: DOCX_MIME }), finalName);
    setDownloadModalOpen(false);
    toast.success(`Downloaded ${finalName}`);
  }

  return (
    <>
      <Card className="overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E2DC] bg-[#F8F8F6] px-3 sm:px-4 py-2.5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#1D4ED8]" />
            <h3 className="text-sm font-semibold text-[#141413]">Live Document Preview</h3>
            {(loadingTemplate || rendering) && (
              <span className="inline-flex items-center rounded-full bg-[#EFF4FF] px-2 py-0.5 text-[11px] font-medium text-[#1E40AF] animate-pulse">
                {loadingTemplate ? "Loading..." : "Updating..."}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="hidden sm:inline-flex items-center rounded-lg border border-[#D8D8D0] bg-white px-2.5 h-8 text-xs font-medium text-[#3D3D39]">
              {dims.label}
            </span>

            <div className="flex items-center rounded-lg border border-[#D8D8D0] bg-white text-xs overflow-hidden h-8">
              <button
                type="button"
                onClick={() => {
                  setManualZoom(true);
                  setZoom((z) => Math.max(0.28, +(z - 0.08).toFixed(2)));
                }}
                className="px-2 h-full text-[#52524E] hover:bg-[#F1F1EE] cursor-pointer"
                title="Zoom out"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="px-1.5 text-[11px] text-[#141413] font-mono">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => {
                  setManualZoom(true);
                  setZoom((z) => Math.min(1.25, +(z + 0.08).toFixed(2)));
                }}
                className="px-2 h-full text-[#52524E] hover:bg-[#F1F1EE] cursor-pointer"
                title="Zoom in"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              {manualZoom && (
                <button
                  type="button"
                  onClick={() => setManualZoom(false)}
                  className="border-l border-[#D8D8D0] px-2 h-full text-[10px] font-medium text-[#1E40AF] hover:bg-[#F1F1EE] cursor-pointer"
                  title="Fit to screen"
                >
                  Fit
                </button>
              )}
            </div>

            <Button type="button" size="sm" variant="outline" onClick={() => void handleCopySummaryText()}>
              {copiedSummary ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedSummary ? "Copied" : "Copy Text"}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setModalManualZoom(false);
                setPreviewModalOpen(true);
              }}
              disabled={loadingTemplate}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Preview Modal</span>
            </Button>

            <Button type="button" size="sm" onClick={openDownloadPrompt} disabled={loadingTemplate}>
              <Download className="h-3.5 w-3.5" />
              <span>Download .docx</span>
            </Button>
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
          className="docx-preview-stage overflow-auto bg-[#ECEAE2] p-3 flex justify-center max-h-[75dvh] lg:max-h-[calc(100dvh-9.5rem)]"
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
      </Card>

      {/* Large Preview Modal */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="flex h-[94dvh] max-h-[94dvh] w-full max-w-5xl flex-col bg-[#F8F8F6]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E2DC] bg-white px-3 sm:px-4 py-2.5 sm:py-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-[#1D4ED8] shrink-0" />
              <h2 className="text-xs sm:text-sm font-semibold text-[#141413] truncate">Document Preview</h2>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="hidden sm:inline-flex items-center rounded-lg border border-[#D8D8D0] bg-white px-2.5 h-8 text-xs font-medium text-[#3D3D39]">
                {dims.label}
              </span>

              <div className="flex items-center rounded-lg border border-[#D8D8D0] bg-white text-xs overflow-hidden h-8">
                <button
                  type="button"
                  onClick={() => {
                    setModalManualZoom(true);
                    setModalZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)));
                  }}
                  className="px-2 h-full text-[#52524E] hover:bg-[#F1F1EE] cursor-pointer"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="px-1.5 sm:px-2 text-[11px] font-mono text-[#141413]">
                  {Math.round(modalZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setModalManualZoom(true);
                    setModalZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)));
                  }}
                  className="px-2 h-full text-[#52524E] hover:bg-[#F1F1EE] cursor-pointer"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                {modalManualZoom && (
                  <button
                    type="button"
                    onClick={() => setModalManualZoom(false)}
                    className="border-l border-[#D8D8D0] px-2 h-full text-[10px] font-medium text-[#1E40AF] hover:bg-[#F1F1EE] cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3 inline mr-0.5" />
                    Fit
                  </button>
                )}
              </div>

              <Button type="button" size="sm" onClick={openDownloadPrompt}>
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download .docx</span>
                <span className="sm:hidden">.docx</span>
              </Button>

              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setPreviewModalOpen(false)}
                aria-label="Close preview modal"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div
            ref={modalStageRef}
            className="docx-preview-stage flex-1 min-h-0 overflow-auto bg-[#ECEAE2] p-2.5 sm:p-4 flex justify-center"
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
        </DialogContent>
      </Dialog>

      {/* Custom Filename Download Modal */}
      <Dialog open={downloadModalOpen} onOpenChange={setDownloadModalOpen}>
        <DialogContent>
          <form onSubmit={confirmDownload}>
            <DialogHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EFF4FF] text-[#1D4ED8]">
                    <Download className="h-4 w-4" />
                  </span>
                  <div>
                    <DialogTitle>Download Word Document</DialogTitle>
                    <DialogDescription>Choose a file name before saving your `.docx`.</DialogDescription>
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setDownloadModalOpen(false)}
                  aria-label="Cancel download"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogHeader>

            <div className="px-5 py-2">
              <label htmlFor="docx-filename" className="block text-xs font-medium text-[#52524E] mb-1.5">
                File name
              </label>
              <div className="flex items-center rounded-xl border border-[#D8D8D0] bg-[#F8F8F6] focus-within:border-[#1D4ED8] focus-within:bg-white overflow-hidden">
                <Input
                  id="docx-filename"
                  type="text"
                  autoFocus
                  value={customFileName}
                  onChange={(e) => setCustomFileName(e.target.value)}
                  placeholder="Weekly-Accomplishment-Report"
                  className="border-0 bg-transparent focus:bg-transparent"
                />
                <span className="border-l border-[#D8D8D0] bg-[#F1F1EE] px-3 py-2 text-xs font-mono text-[#5C5C57]">
                  .docx
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDownloadModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
