"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw, Type } from "lucide-react";
import {
  DEFAULT_TEMPLATE_TEXTS,
  resolveTemplateTexts,
  type TemplateTextOverrides,
} from "@/lib/docx/types";
import { invalidateTemplateCache } from "@/lib/docx/client-cache";
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

const TEXT_GROUPS: Array<{
  title: string;
  description: string;
  fields: Array<{ key: keyof TemplateTextOverrides; label: string; multiline?: boolean }>;
}> = [
  {
    title: "University Header & Banner",
    description: "Top header lines, college banner, and report title above the form.",
    fields: [
      { key: "country_header", label: "Country Header" },
      { key: "university_header", label: "University Header" },
      { key: "campus_header", label: "Campus Header" },
      { key: "campus_address", label: "Campus Address" },
      { key: "college_banner", label: "College Banner" },
      { key: "report_title", label: "Document Title" },
    ],
  },
  {
    title: "Form Labels, Days & Hours",
    description: "Every table column heading, weekday code, hour row label, and reflection prompt.",
    fields: [
      { key: "label_student_intern", label: "Student Intern Label" },
      { key: "label_office", label: "Office Label" },
      { key: "label_from", label: "From Date Label" },
      { key: "label_to", label: "To Date Label" },
      { key: "col_day", label: "Day Column Heading" },
      { key: "col_accomplishments", label: "Accomplishments Column Heading" },
      { key: "col_verified_by", label: "Verified By Column Heading" },
      { key: "day_mon", label: "Monday Code" },
      { key: "day_tue", label: "Tuesday Code" },
      { key: "day_wed", label: "Wednesday Code" },
      { key: "day_thu", label: "Thursday Code" },
      { key: "day_fri", label: "Friday Code" },
      { key: "label_hours_week", label: "Hours This Week Label" },
      { key: "label_total_hours", label: "Total Hours Worked Label" },
      { key: "label_new_trainings", label: "New Trainings Prompt" },
      { key: "label_problems", label: "Problems Encountered Prompt" },
      { key: "label_solutions", label: "Solutions Done Prompt" },
    ],
  },
  {
    title: "Signatories & Bottom Footer",
    description: "Prepared/Noted signatory lines plus the Vision, Mission & Goals footer.",
    fields: [
      { key: "label_prepared_by", label: "Prepared By Heading" },
      { key: "prepared_by_role", label: "Intern Signature Role" },
      { key: "label_noted_by", label: "Noted By Heading" },
      { key: "noted_by_name", label: "Noted By Name" },
      { key: "noted_by_title", label: "Noted By Position / Title" },
      { key: "label_date", label: "Date Label" },
      { key: "date_line", label: "Date Blank Line" },
      { key: "vision_title", label: "Vision Heading" },
      { key: "vision_body", label: "Vision Paragraph", multiline: true },
      { key: "mission_title", label: "Mission Heading" },
      { key: "mission_body", label: "Mission Paragraph", multiline: true },
      { key: "pledge_title", label: "Goals / Objectives Heading" },
      { key: "pledge_body", label: "Goals / Objectives Paragraph", multiline: true },
    ],
  },
];

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
  const [customTexts, setCustomTexts] = useState<TemplateTextOverrides>(() =>
    resolveTemplateTexts(initialReview?.fields),
  );
  const [baselineJson, setBaselineJson] = useState<string>(() =>
    JSON.stringify({
      rows: initialReview ? toEditableRows(initialReview) : [],
      texts: resolveTemplateTexts(initialReview?.fields),
    }),
  );
  const [textsExpanded, setTextsExpanded] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasChanges = JSON.stringify({ rows, texts: customTexts }) !== baselineJson;
  const isBusy = scanning || saving;
  const confirmDisabled = isBusy || (review?.template.status === "confirmed" && !hasChanges);

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
      const nextTexts = resolveTemplateTexts(json.review.fields);
      setReview(json.review);
      setRows(nextRows);
      setCustomTexts(nextTexts);
      setBaselineJson(JSON.stringify({ rows: nextRows, texts: nextTexts }));
      invalidateTemplateCache(json.review.template.id);
      toast.success("Scanned official template fields cleanly.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not scan template.");
    } finally {
      setScanning(false);
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
          customTexts,
        }),
      });
      const json = (await res.json()) as { review?: TemplateReview; error?: string };
      if (!res.ok || !json.review) throw new Error(json.error ?? "Could not save template changes.");
      const nextRows = toEditableRows(json.review);
      const nextTexts = resolveTemplateTexts(json.review.fields);
      setReview(json.review);
      setRows(nextRows);
      setCustomTexts(nextTexts);
      setBaselineJson(JSON.stringify({ rows: nextRows, texts: nextTexts }));
      invalidateTemplateCache(json.review.template.id);
      toast.success("Template mappings and custom texts saved to your private storage.");
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

  function updateText(key: keyof TemplateTextOverrides, value: string) {
    setCustomTexts((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section className="rounded-2xl border border-[#E2E2DC] bg-white p-4 sm:p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="inline-flex items-center rounded-full bg-[#F1F1EE] px-2.5 py-0.5 text-xs font-medium text-[#52524E]">
            Official Template · Strict 8.5&quot; × 11&quot;
          </span>
          <h2 className="mt-1.5 text-lg font-semibold text-[#141413]">
            {review ? `Template: ${review.template.name}` : "Set Up Your Official Report Template"}
          </h2>
          <p className="mt-1 text-sm text-[#5C5C57]">
            Customize every heading, label, signatory, and footer text on{" "}
            <code className="font-mono text-xs">2026-Weekly-Accomplishment-Report.docx</code> without altering its
            borders or layout.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={scanDefault}
            disabled={isBusy}
            className="rounded-xl bg-[#141413] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#34322E] disabled:pointer-events-none disabled:opacity-50 transition cursor-pointer"
          >
            {scanning ? "Scanning XML..." : review ? "Re-scan Built-in Template" : "Auto-Scan 2026 Template"}
          </button>
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
        <div className="space-y-5">
          {/* Editable Static Texts across the entire DOCX */}
          <div className="rounded-2xl border border-[#E2E2DC] bg-[#F8F8F6] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[#F1F1EE] border-b border-[#E2E2DC]">
              <button
                type="button"
                onClick={() => setTextsExpanded((v) => !v)}
                className="flex items-center gap-2 text-left cursor-pointer"
              >
                <Type className="h-4 w-4 text-[#1D4ED8]" />
                <div>
                  <h3 className="text-sm font-semibold text-[#141413]">Edit Every Template Text</h3>
                  <p className="text-xs text-[#5C5C57]">
                    Update headers, school/college banner, column labels, signatory names, or footer text.
                  </p>
                </div>
                {textsExpanded ? (
                  <ChevronUp className="h-4 w-4 text-[#5C5C57]" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[#5C5C57]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setCustomTexts({ ...DEFAULT_TEMPLATE_TEXTS })}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8D8D0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#3D3D39] hover:bg-[#F1F1EE] cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3 text-[#1D4ED8]" />
                <span>Reset Texts to Default</span>
              </button>
            </div>

            {textsExpanded && (
              <div className="p-4 space-y-5">
                {TEXT_GROUPS.map((group) => (
                  <div key={group.title} className="space-y-2.5">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#52524E]">{group.title}</h4>
                      <p className="text-[11px] text-[#52524E]">{group.description}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {group.fields.map((f) => (
                        <div key={f.key} className={f.multiline ? "sm:col-span-2 lg:col-span-3" : ""}>
                          <label htmlFor={`template-text-${f.key}`} className="block text-[11px] font-medium text-[#3D3D39] mb-1">
                            {f.label}
                          </label>
                          {f.multiline ? (
                            <textarea
                              id={`template-text-${f.key}`}
                              rows={2}
                              value={customTexts[f.key]}
                              onChange={(e) => updateText(f.key, e.target.value)}
                              className="w-full rounded-lg border border-[#D8D8D0] bg-white px-2.5 py-1.5 text-sm sm:text-xs text-[#141413] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/35 focus:border-[#1D4ED8]"
                            />
                          ) : (
                            <input
                              id={`template-text-${f.key}`}
                              type="text"
                              value={customTexts[f.key]}
                              onChange={(e) => updateText(f.key, e.target.value)}
                              className="w-full rounded-lg border border-[#D8D8D0] bg-white px-2.5 py-1.5 text-sm sm:text-xs text-[#141413] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/35 focus:border-[#1D4ED8]"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F1F1EE] pt-4">
            <div>
              <h3 className="text-sm font-semibold text-[#141413]">
                Detected Dynamic Fields ({rows.filter((r) => r.key).length} mapped)
              </h3>
              <p className="text-xs text-[#5C5C57]">
                Map each fillable Word cell to a report schema tag while keeping borders and typography intact.
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

          <div className="divide-y divide-[#F1F1EE] rounded-xl border border-[#E2E2DC] overflow-hidden">
            {rows.map((row, idx) => (
              <div
                key={row.candidateId}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3 bg-white hover:bg-[#F8F8F6]/80"
              >
                <div className="sm:col-span-4 min-w-0">
                  <p className="text-xs font-medium text-[#3D3D39] truncate">{row.context || row.candidateId}</p>
                  <p className="text-xs text-[#5C5C57] truncate mt-0.5">
                    Current:{" "}
                    <span className="font-mono text-[11px] text-[#52524E]">
                      {row.originalText ? row.originalText.replace(/\n/g, " / ") : "(blank cell)"}
                    </span>
                  </p>
                </div>

                <div className="sm:col-span-4">
                  <label htmlFor={`field-label-${row.candidateId}`} className="sr-only">
                    Field Label
                  </label>
                  <input
                    id={`field-label-${row.candidateId}`}
                    type="text"
                    value={row.label}
                    onChange={(e) => updateRow(idx, { label: e.target.value })}
                    placeholder="Display label"
                    className="w-full rounded-lg border border-[#D8D8D0] bg-white px-2.5 py-1.5 text-sm sm:text-xs text-[#141413] placeholder:text-[#5C5C57]/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/35 focus:border-[#1D4ED8]"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label htmlFor={`field-key-${row.candidateId}`} className="sr-only">
                    Schema Key
                  </label>
                  <select
                    id={`field-key-${row.candidateId}`}
                    value={row.key}
                    onChange={(e) => {
                      const nextKey = e.target.value as ReportKey | "";
                      updateRow(idx, {
                        key: nextKey,
                        label: nextKey ? REPORT_FIELD_META[nextKey].label : row.label,
                      });
                    }}
                    className="w-full rounded-lg border border-[#D8D8D0] bg-white px-2.5 py-1.5 text-sm sm:text-xs font-mono text-[#141413] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/35 focus:border-[#1D4ED8] cursor-pointer"
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

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirmDisabled}
              className="w-full sm:w-auto rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-50 transition cursor-pointer"
            >
              {saving
                ? "Saving Template..."
                : review.template.status === "confirmed" && !hasChanges
                  ? "Template Up to Date"
                  : "Save & Use This Template"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
