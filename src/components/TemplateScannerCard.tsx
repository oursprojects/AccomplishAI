"use client";

import { useRef, useState } from "react";
import { REPORT_FIELD_META, REPORT_KEYS, type ReportKey } from "@/lib/report-schema";
import type { TemplateReview } from "@/lib/templates/pipeline";
import { toast } from "@/components/ui/toast";

interface TemplateScannerCardProps {
  initialReview: TemplateReview | null;
  onConfirmed?: (review: TemplateReview) => void;
}

interface EditableRow {
  candidateId: string;
  context: string;
  originalText: string;
  key: ReportKey | "";
  label: string;
  source: string;
}

function toEditableRows(review: TemplateReview): EditableRow[] {
  const mapped: EditableRow[] = review.fields.map((f) => ({
    candidateId: f.candidateId,
    context: f.context,
    originalText: f.originalText,
    key: f.key,
    label: f.label,
    source: f.source,
  }));
  const extra: EditableRow[] = review.unassigned.map((u) => ({
    candidateId: u.id,
    context: u.context,
    originalText: u.currentText,
    key: "",
    label: u.context || "Unassigned area",
    source: "unassigned",
  }));
  return [...mapped, ...extra];
}

export function TemplateScannerCard({ initialReview, onConfirmed }: TemplateScannerCardProps) {
  const [review, setReview] = useState<TemplateReview | null>(initialReview);
  const [rows, setRows] = useState<EditableRow[]>(initialReview ? toEditableRows(initialReview) : []);
  const [baselineJson, setBaselineJson] = useState<string>(() =>
    initialReview ? JSON.stringify(toEditableRows(initialReview)) : "[]",
  );
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const hasMappingChanges = JSON.stringify(rows) !== baselineJson;
  const confirmDisabled = saving || (review?.template.status === "confirmed" && !hasMappingChanges);

  async function scanDefault() {
    setScanning(true);
    try {
      const res = await fetch("/api/scan-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useDefault: true }),
      });
      const json = (await res.json()) as { review?: TemplateReview; error?: string };
      if (!res.ok || !json.review) throw new Error(json.error ?? "Scan failed.");
      const nextRows = toEditableRows(json.review);
      setReview(json.review);
      setRows(nextRows);
      setBaselineJson(JSON.stringify(nextRows));
      toast.success("Scanned template fields cleanly.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not scan template.");
    } finally {
      setScanning(false);
    }
  }

  async function scanUpload(file: File) {
    setScanning(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/scan-template", { method: "POST", body: form });
      const json = (await res.json()) as { review?: TemplateReview; error?: string };
      if (!res.ok || !json.review) throw new Error(json.error ?? "Scan failed.");
      const nextRows = toEditableRows(json.review);
      setReview(json.review);
      setRows(nextRows);
      setBaselineJson(JSON.stringify(nextRows));
      toast.success("Uploaded and scanned custom .docx template.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not scan uploaded file.");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleConfirm() {
    if (!review || confirmDisabled) return;
    setSaving(true);
    try {
      const res = await fetch("/api/scan-template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: review.template.id,
          assignments: rows.map((r) => ({
            candidateId: r.candidateId,
            key: r.key || null,
            label: r.label,
          })),
        }),
      });
      const json = (await res.json()) as { review?: TemplateReview; error?: string };
      if (!res.ok || !json.review) throw new Error(json.error ?? "Could not save field mapping.");
      const nextRows = toEditableRows(json.review);
      setReview(json.review);
      setRows(nextRows);
      setBaselineJson(JSON.stringify(nextRows));
      toast.success("Template tagged and saved to your private storage.");
      onConfirmed?.(json.review);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not confirm template.");
    } finally {
      setSaving(false);
    }
  }

  function updateRow(idx: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            Official Template Preservation
          </span>
          <h2 className="mt-1.5 text-lg font-semibold text-slate-900">
            {review ? `Template: ${review.template.name}` : "Set Up Your Official Report Template"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Auto-scans <code className="font-mono text-xs">2026-Weekly-Accomplishment-Report.docx</code>, injects{" "}
            <code className="font-mono text-xs">{"{tags}"}</code> without altering Word borders, fonts, headers, or
            signatories, and saves your personal master copy to Supabase Storage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={scanDefault}
            disabled={scanning}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 transition cursor-pointer"
          >
            {scanning ? "Scanning XML..." : review ? "Re-scan Built-in Template" : "Auto-Scan 2026 Template"}
          </button>

          <label className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer">
            Upload .docx
            <input
              ref={fileRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              disabled={scanning}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) scanUpload(file);
              }}
            />
          </label>
        </div>
      </div>

      {review && review.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800 space-y-1">
          {review.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {review && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Detected Fields ({rows.filter((r) => r.key).length} mapped)
              </h3>
              <p className="text-xs text-slate-500">
                Review or rename labels below. Each schema key maps to one Word cell while keeping original styling.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                review.template.status === "confirmed"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {review.template.status === "confirmed" ? "Confirmed" : "Pending one-time confirmation"}
            </span>
          </div>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
            {rows.map((row, idx) => (
              <div
                key={row.candidateId}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3 bg-white hover:bg-slate-50/70"
              >
                <div className="sm:col-span-4 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{row.context || row.candidateId}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    Current:{" "}
                    <span className="font-mono text-[11px] text-slate-600">
                      {row.originalText ? row.originalText.replace(/\n/g, " / ") : "(blank cell)"}
                    </span>
                  </p>
                </div>

                <div className="sm:col-span-4">
                  <label className="sr-only">Field Label</label>
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) => updateRow(idx, { label: e.target.value })}
                    placeholder="Display label"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-slate-900"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="sr-only">Schema Key</label>
                  <select
                    value={row.key}
                    onChange={(e) => {
                      const nextKey = e.target.value as ReportKey | "";
                      updateRow(idx, {
                        key: nextKey,
                        label: nextKey ? REPORT_FIELD_META[nextKey].label : row.label,
                      });
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800 outline-none focus:border-slate-900"
                  >
                    <option value="">-- Skip / Do not tag --</option>
                    {REPORT_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {`{${k}}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {review.preserved.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-xs font-semibold text-slate-700">Preserved Verbatim (Untouched in .docx)</p>
              <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                {review.preserved.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{p.context}:</span>
                    <code className="rounded bg-white px-1.5 py-0.5 border border-slate-200 font-mono text-[11px]">
                      {p.currentText}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirmDisabled}
              className="w-full sm:w-auto rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-50 transition cursor-pointer"
            >
              {saving
                ? "Tagging & Saving..."
                : review.template.status === "confirmed" && !hasMappingChanges
                  ? "Template Confirmed"
                  : "Confirm & Use This Template"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
