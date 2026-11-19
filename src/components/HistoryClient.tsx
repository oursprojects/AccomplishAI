"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReportData } from "@/lib/report-schema";

export interface ReportSummary {
  id: string;
  raw_notes: string;
  structured_data: Partial<ReportData>;
  created_at: string;
  updated_at: string;
}

export function HistoryClient({ initialReports }: { initialReports: ReportSummary[] }) {
  const [reports, setReports] = useState<ReportSummary[]>(initialReports);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Report History</h1>
          <p className="text-sm text-slate-600">Reopen any saved weekly report to edit, preview, print, or download.</p>
        </div>
        <Link
          href="/"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition"
        >
          New Report
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-800">No saved reports yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Generate your first Weekly Accomplishment Report and tap &ldquo;Save Report to History&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const d = report.structured_data;
            const period = [d.date_from, d.date_to].filter(Boolean).join(" – ") || "Untitled Weekly Report";
            const created = new Date(report.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            return (
              <article
                key={report.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">{period}</h2>
                    {d.office && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {d.office}
                      </span>
                    )}
                    {d.hours_this_week && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        {d.hours_this_week} hrs
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Saved {created}
                    {d.intern_name_last_first ? ` · ${d.intern_name_last_first}` : ""}
                  </p>
                  {report.raw_notes && (
                    <p className="text-xs text-slate-600 line-clamp-2 pt-0.5">{report.raw_notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/?reportId=${report.id}`}
                    className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition"
                  >
                    Open & Print
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(report.id)}
                    disabled={deletingId === report.id}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition cursor-pointer"
                  >
                    {deletingId === report.id ? "..." : "Delete"}
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
