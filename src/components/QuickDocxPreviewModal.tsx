"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { Download, FileText, Loader2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { fetchCachedTemplateBytes, warmDocxPreview } from "@/lib/docx/client-cache";
import { defaultReportFileName, DOCX_MIME, fillTemplate } from "@/lib/docx/fill";
import { enhanceCsuPreviewChrome, PAPER_DIMENSIONS, type PaperSize } from "@/lib/docx/csu-template-chrome";
import { resolveTemplateTexts, type DetectedField } from "@/lib/docx/types";
import type { ReportData } from "@/lib/report-schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

interface QuickDocxPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  templateVersion?: string;
  fields: Pick<DetectedField, "key" | "kind" | "customTexts">[];
  data: Partial<ReportData>;
  reportTitle?: string;
  cachedTemplateBytes?: ArrayBuffer | null;
  onTemplateBytesLoaded?: (bytes: ArrayBuffer) => void;
}

const PT_TO_PX = 96 / 72;

export function QuickDocxPreviewModal({
  open,
  onOpenChange,
  templateId,
  templateVersion,
  fields,
  data,
  reportTitle,
  cachedTemplateBytes,
  onTemplateBytesLoaded,
}: QuickDocxPreviewModalProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [filledBytes, setFilledBytes] = useState<Uint8Array | null>(null);

  const paperSize: PaperSize = "letter";
  const [zoom, setZoom] = useState(0.75);
  const [manualZoom, setManualZoom] = useState(false);
  const [loading, setLoading] = useState(false);

  const customTexts = useMemo(() => resolveTemplateTexts(fields), [fields]);
  const dims = PAPER_DIMENSIONS[paperSize];
  const pagePxW = Math.round(dims.widthPt * PT_TO_PX);
  const pagePxH = Math.round(dims.heightPt * PT_TO_PX);

  const computeFitZoom = useCallback(() => {
    const w = stageRef.current?.clientWidth ?? 0;
    if (w <= 0) return null;
    const available = Math.max(240, w - 24);
    return Number(Math.min(1.05, Math.max(0.32, available / pagePxW)).toFixed(2));
  }, [pagePxW]);

  useEffect(() => {
    if (!open) return;
    const sync = () => {
      if (manualZoom) return;
      const fit = computeFitZoom();
      if (fit !== null) setZoom(fit);
    };
    const raf = window.requestAnimationFrame(sync);
    window.addEventListener("resize", sync);
    let observer: ResizeObserver | undefined;
    if (stageRef.current && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(sync);
      observer.observe(stageRef.current);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", sync);
      observer?.disconnect();
    };
  }, [open, manualZoom, computeFitZoom]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function renderPreview() {
      setLoading(true);
      try {
        let bytes = cachedTemplateBytes ?? null;
        if (!bytes) {
          bytes = await fetchCachedTemplateBytes(templateId, templateVersion);
          onTemplateBytesLoaded?.(bytes);
        }
        if (cancelled || !containerRef.current) return;

        const filled = fillTemplate(bytes, data, fields, customTexts);
        if (!cancelled) setFilledBytes(filled);

        const { renderAsync } = await warmDocxPreview();
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
          enhanceCsuPreviewChrome(containerRef.current, filled, paperSize, customTexts);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Could not render document preview.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void renderPreview();
    return () => {
      cancelled = true;
    };
  }, [open, templateId, templateVersion, fields, data, customTexts, paperSize, cachedTemplateBytes, onTemplateBytesLoaded]);

  function handleDownload() {
    if (!filledBytes) return;
    const name = `${defaultReportFileName(data, reportTitle)}.docx`;
    const copy = new Uint8Array(filledBytes);
    saveAs(new Blob([copy], { type: DOCX_MIME }), name);
    toast.success(`Downloaded ${name}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94dvh] max-h-[94dvh] w-full max-w-5xl flex-col bg-[#F8F8F6]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E2DC] bg-white px-3 sm:px-4 py-2.5 sm:py-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-[#1D4ED8] shrink-0" />
            <h2 className="text-xs sm:text-sm font-semibold text-[#141413] truncate">
              {reportTitle ? `Preview — ${reportTitle}` : "Document Preview"}
            </h2>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1D4ED8] shrink-0" />}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="hidden sm:inline-flex items-center rounded-lg border border-[#D8D8D0] bg-white px-2.5 h-8 text-xs font-medium text-[#3D3D39]">
              {dims.label}
            </span>

            <div className="flex items-center rounded-lg border border-[#D8D8D0] bg-white text-xs overflow-hidden h-8">
              <button
                type="button"
                onClick={() => {
                  setManualZoom(true);
                  setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)));
                }}
                className="px-2 h-full text-[#52524E] hover:bg-[#F1F1EE] cursor-pointer"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="px-1.5 sm:px-2 text-[11px] font-mono text-[#141413]">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => {
                  setManualZoom(true);
                  setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)));
                }}
                className="px-2 h-full text-[#52524E] hover:bg-[#F1F1EE] cursor-pointer"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              {manualZoom && (
                <button
                  type="button"
                  onClick={() => setManualZoom(false)}
                  className="border-l border-[#D8D8D0] px-2 h-full text-[10px] font-medium text-[#1E40AF] hover:bg-[#F1F1EE] cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3 inline mr-0.5" />
                  Fit
                </button>
              )}
            </div>

            <Button type="button" size="sm" disabled={loading || !filledBytes} onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download .docx</span>
              <span className="sm:hidden">.docx</span>
            </Button>

            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => onOpenChange(false)}
              aria-label="Close preview modal"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          ref={stageRef}
          className="docx-preview-stage flex-1 min-h-0 overflow-auto bg-[#ECEAE2] p-2.5 sm:p-4 flex justify-center"
        >
          <div
            style={{
              width: `${Math.round(pagePxW * zoom)}px`,
              height: `${Math.round(pagePxH * zoom)}px`,
              flexShrink: 0,
            }}
          >
            <div
              ref={containerRef}
              style={{
                width: `${dims.widthPt}pt`,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
