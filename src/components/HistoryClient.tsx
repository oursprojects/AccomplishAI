"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Check,
  Clock,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { ReportData } from "@/lib/report-schema";

export interface ReportSummary {
  id: string;
  title: string;
  raw_notes: string;
  structured_data: Partial<ReportData>;
  created_at: string;
  updated_at: string;
}

export function HistoryClient({
  initialReports,
  maxReports,
  canCreateReport,
}: {
  initialReports: ReportSummary[];
  maxReports: number | null;
  canCreateReport: boolean;
}) {
  const [reports, setReports] = useState<ReportSummary[]>(initialReports);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startRename(report: ReportSummary) {
    const d = report.structured_data;
    const fallback = [d.date_from, d.date_to].filter(Boolean).join(" – ") || "Untitled Weekly Report";
    setRenamingId(report.id);
    setRenameValue(report.title.trim() || fallback);
    setError(null);
  }

  async function saveRename(id: string) {
    const nextTitle = renameValue.trim();
    if (!nextTitle) return;
    setSavingRename(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      const json = (await res.json()) as { report?: { title?: string }; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not rename report.");
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, title: json.report?.title ?? nextTitle } : r)));
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed.");
    } finally {
      setSavingRename(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this saved report?")) return;
    setError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Could not delete report.");
      }
      setReports((prev) => prev.filter((r) => r.id !== id));
      try {
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i);
          if (k && k.endsWith(`_${id}`)) window.localStorage.removeItem(k);
        }
      } catch {
        // Ignore storage errors
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[#1F1E1C]">Report History</h1>
            <span className="rounded-full bg-[#F4F2EA] border border-[#E6E2D8] px-2.5 py-0.5 text-[11px] font-medium text-[#57544E]">
              {reports.length} {maxReports === null ? "saved" : `/ ${maxReports} max`}
            </span>
          </div>
          <p className="text-sm text-[#6B665E]">
            Each saved report keeps its own conversation and .docx preview. Rename, reopen, or start a new one anytime.
          </p>
        </div>

        <Link
          href="/?new=1"
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition ${
            canCreateReport
              ? "bg-[#D97757] text-white hover:bg-[#C86343]"
              : "bg-[#E8E4DA] text-[#7A746B] pointer-events-none"
          }`}
          title={canCreateReport ? "Start a brand new blank report" : "Saved report limit reached"}
        >
          <Plus className="h-4 w-4" />
          <span>New Report</span>
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#DDD7CB] bg-white p-10 text-center">
          <p className="text-sm font-medium text-[#1F1E1C]">No saved reports yet</p>
          <p className="mt-1 text-xs text-[#6B665E]">
            Create your first Weekly Accomplishment Report in Report Chat and click &ldquo;Save Report&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const d = report.structured_data;
            const dateFallback = [d.date_from, d.date_to].filter(Boolean).join(" – ") || "Untitled Weekly Report";
            const displayTitle = report.title.trim() || dateFallback;
            const created = new Date(report.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            const isRenaming = renamingId === report.id;

            return (
              <article
                key={report.id}
                className="rounded-2xl border border-[#E6E2D8] bg-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="min-w-0 space-y-1 flex-1">
                  {isRenaming ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveRename(report.id);
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        maxLength={120}
                        autoFocus
                        placeholder="Enter report title..."
                        className="w-full max-w-sm rounded-lg border border-[#D97757] bg-[#FAF9F5] px-2.5 py-1 text-sm font-medium text-[#1F1E1C] outline-none"
                      />
                      <button
                        type="submit"
                        disabled={savingRename || !renameValue.trim()}
                        className="inline-flex items-center justify-center rounded-lg bg-[#1F1E1C] p-1.5 text-white hover:bg-[#33312E] disabled:opacity-50 cursor-pointer"
                        title="Save title"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="inline-flex items-center justify-center rounded-lg border border-[#DDD7CB] p-1.5 text-[#6B665E] hover:bg-[#F4F2EA] cursor-pointer"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-[#D97757] shrink-0" />
                      <h2 className="text-sm font-semibold text-[#1F1E1C]">{displayTitle}</h2>
                      <button
                        type="button"
                        onClick={() => startRename(report)}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#6B665E] hover:bg-[#F4F2EA] hover:text-[#1F1E1C] transition cursor-pointer"
                        title="Rename report"
                      >
                        <Pencil className="h-3 w-3" />
                        <span>Rename</span>
                      </button>
                      {d.office && (
                        <span className="rounded-full bg-[#F4F2EA] px-2 py-0.5 text-[11px] font-medium text-[#57544E]">
                          {d.office}
                        </span>
                      )}
                      {d.hours_this_week && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          <Clock className="h-3 w-3" />
                          {d.hours_this_week} hrs
                        </span>
                      )}
                    </div>
                  )}

                  <p className="inline-flex items-center gap-1 text-xs text-[#6B665E]">
                    <Calendar className="h-3 w-3" />
                    Saved {created}
                    {d.intern_name_last_first ? ` · ${d.intern_name_last_first}` : ""}
                    {report.title.trim() && [d.date_from, d.date_to].filter(Boolean).length > 0
                      ? ` · ${[d.date_from, d.date_to].filter(Boolean).join(" – ")}`
                      : ""}
                  </p>
                  {report.raw_notes && (
                    <p className="text-xs text-[#57544E] line-clamp-2 pt-0.5">{report.raw_notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/?reportId=${report.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1F1E1C] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#33312E] transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open &amp; Download</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(report.id)}
                    disabled={deletingId === report.id}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#E6E2D8] px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{deletingId === report.id ? "..." : "Delete"}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
