"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, FileType2, Loader2 } from "lucide-react";
import { AnimatedDownloadIcon } from "@/components/icons/AnimatedIcons";
import { exportChatFile, type ChatFileSpec, type ExportFileFormat } from "@/lib/chat-file-export";

const FORMAT_META: Record<
  ExportFileFormat,
  { label: string; ext: string; badgeClass: string; Icon: typeof FileText }
> = {
  docx: {
    label: "Word Document",
    ext: ".docx",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
    Icon: FileText,
  },
  pdf: {
    label: "PDF Document",
    ext: ".pdf",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
    Icon: FileType2,
  },
  xlsx: {
    label: "Excel Workbook",
    ext: ".xlsx",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    Icon: FileSpreadsheet,
  },
};

export function ChatFileExport({ spec }: { spec: ChatFileSpec }) {
  const [downloadingFormat, setDownloadingFormat] = useState<ExportFileFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const primary = FORMAT_META[spec.format];
  const PrimaryIcon = primary.Icon;
  const secondaryFormats = (["docx", "pdf", "xlsx"] as const).filter((f) => f !== spec.format);

  const totalRows =
    (spec.table?.rows.length ?? 0) +
    spec.sheets.reduce((sum, sh) => sum + sh.rows.length, 0) +
    spec.sections.reduce((sum, s) => sum + (s.table?.rows.length ?? 0), 0);

  async function handleDownload(fmt: ExportFileFormat) {
    setError(null);
    setDownloadingFormat(fmt);
    try {
      await exportChatFile(spec, fmt);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to generate .${fmt} file.`);
    } finally {
      setDownloadingFormat(null);
    }
  }

  return (
    <div className="my-2.5 rounded-xl border border-[#E2E2DC] bg-[#F8F8F6] p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="flex size-9 items-center justify-center rounded-lg border border-[#E2E2DC] bg-white text-[#1D4ED8] shrink-0">
            <PrimaryIcon className="size-4.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="text-xs sm:text-sm font-medium text-[#141413] truncate">{spec.title}</h4>
              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${primary.badgeClass}`}>
                {primary.ext.toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] text-[#141413]/60 tabular-nums truncate">
              {spec.filename}
              {primary.ext}
              {spec.sheets.length > 0 ? ` · ${spec.sheets.length} sheet${spec.sheets.length === 1 ? "" : "s"}` : ""}
              {totalRows > 0 ? ` · ${totalRows} row${totalRows === 1 ? "" : "s"}` : ""}
              {spec.sections.length > 0
                ? ` · ${spec.sections.length} section${spec.sections.length === 1 ? "" : "s"}`
                : ""}
            </p>
          </div>
        </div>
      </div>

      {spec.subtitle && <p className="text-xs text-[#141413]/70 text-pretty leading-relaxed">{spec.subtitle}</p>}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={downloadingFormat !== null}
          onClick={() => void handleDownload(spec.format)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1E40AF] transition duration-150 cursor-pointer disabled:opacity-60"
        >
          {downloadingFormat === spec.format ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <AnimatedDownloadIcon className="size-3.5" />
          )}
          <span>{`Download ${primary.ext.toUpperCase()}`}</span>
        </button>

        {secondaryFormats.map((fmt) => {
          const meta = FORMAT_META[fmt];
          const Icon = meta.Icon;
          return (
            <button
              key={fmt}
              type="button"
              disabled={downloadingFormat !== null}
              onClick={() => void handleDownload(fmt)}
              title={`Also download as ${meta.label}`}
              className="inline-flex items-center gap-1 rounded-lg border border-[#D8D8D0] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#141413]/75 hover:bg-[#F1F1EE] transition duration-150 cursor-pointer disabled:opacity-60"
            >
              {downloadingFormat === fmt ? (
                <Loader2 className="size-3 animate-spin text-[#1D4ED8]" />
              ) : (
                <Icon className="size-3 text-[#52524E]" />
              )}
              <span>{meta.ext.toUpperCase()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
