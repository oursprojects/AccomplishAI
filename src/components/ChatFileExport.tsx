"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, FileType2, Loader2 } from "lucide-react";
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
    <div className="my-2.5 rounded-2xl border border-[#E6E2D8] bg-[#FAF9F5] p-3.5 shadow-2xs space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E6E2D8] bg-white text-[#D97757] shrink-0">
            <PrimaryIcon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="text-xs sm:text-sm font-semibold text-[#1F1E1C] truncate">{spec.title}</h4>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${primary.badgeClass}`}>
                {primary.ext.toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] text-[#6B665E] truncate">
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

      {spec.subtitle && <p className="text-xs text-[#4A463F] leading-relaxed">{spec.subtitle}</p>}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={downloadingFormat !== null}
          onClick={() => void handleDownload(spec.format)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#D97757] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#C86343] transition shadow-2xs cursor-pointer disabled:opacity-60"
        >
          {downloadingFormat === spec.format ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
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
              className="inline-flex items-center gap-1 rounded-xl border border-[#DDD7CB] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#4A463F] hover:bg-[#F4F2EA] transition cursor-pointer disabled:opacity-60"
            >
              {downloadingFormat === fmt ? (
                <Loader2 className="h-3 w-3 animate-spin text-[#D97757]" />
              ) : (
                <Icon className="h-3 w-3 text-[#6B665E]" />
              )}
              <span>{meta.ext.toUpperCase()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
