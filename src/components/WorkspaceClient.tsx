"use client";

import { useState } from "react";
import Link from "next/link";
import { emptyReport, type ReportData } from "@/lib/report-schema";
import type { Profile } from "@/lib/supabase/database.types";
import type { TemplateReview } from "@/lib/templates/pipeline";
import { VoiceRecorder } from "./VoiceRecorder";
import { TemplateScannerCard } from "./TemplateScannerCard";
import { ReportEditor } from "./ReportEditor";
import { DocxPreviewPanel } from "./DocxPreviewPanel";

interface WorkspaceClientProps {
  profile: Pick<Profile, "name_last_first" | "name_first_last" | "office" | "default_verifier" | "default_daily_hours">;
  initialReview: TemplateReview | null;
  initialReport: {
    id: string;
    raw_notes: string;
    structured_data: ReportData;
  } | null;
}

type MobileTab = "notes" | "edit" | "preview";

function seedFromProfile(
  profile: WorkspaceClientProps["profile"],
  report: WorkspaceClientProps["initialReport"],
): ReportData {
  if (report) return { ...emptyReport(), ...report.structured_data };
  return {
    ...emptyReport(),
    intern_name_last_first: profile.name_last_first || "",
    intern_name_first_last: profile.name_first_last || "",
    office: profile.office || "YML",
  };
}

export function WorkspaceClient({ profile, initialReview, initialReport }: WorkspaceClientProps) {
  const [review, setReview] = useState<TemplateReview | null>(initialReview);
  const [rawNotes, setRawNotes] = useState(initialReport?.raw_notes ?? "");
  const [data, setData] = useState<ReportData>(() => seedFromProfile(profile, initialReport));
  const [savedId, setSavedId] = useState<string | null>(initialReport?.id ?? null);
  const [tab, setTab] = useState<MobileTab>(initialReport ? "edit" : "notes");

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleQuickConfirm() {
    if (!review) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/scan-template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: review.template.id,
          assignments: review.fields.map((f) => ({
            candidateId: f.candidateId,
            key: f.key,
            label: f.label,
          })),
        }),
      });
      const json = (await res.json()) as { review?: TemplateReview };
      if (res.ok && json.review) setReview(json.review);
    } finally {
      setConfirming(false);
    }
  }

  async function handleGenerate() {
    if (!rawNotes.trim()) {
      setError("Type or speak your weekly notes first.");
      return;
    }
    setError(null);
    setNotice(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawNotes,
          templateId: review?.template.id,
          existingData: data,
        }),
      });
      const json = (await res.json()) as { structuredData?: ReportData; error?: string };
      if (!res.ok || !json.structuredData) throw new Error(json.error ?? "AI generation failed.");
      setData(json.structuredData);
      setNotice("Report generated! Review any field or jump straight to Preview & Print.");
      setTab("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate report.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const url = savedId ? `/api/reports/${savedId}` : "/api/reports";
      const method = savedId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: review?.template.id ?? null,
          rawNotes,
          structuredData: data,
        }),
      });
      const json = (await res.json()) as { report?: { id: string }; error?: string };
      if (!res.ok || !json.report) throw new Error(json.error ?? "Could not save report.");
      setSavedId(json.report.id);
      setNotice(savedId ? "Saved changes to report history." : "Report saved to history.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save report.");
    } finally {
      setSaving(false);
    }
  }

  function handleStartNew() {
    setSavedId(null);
    setRawNotes("");
    setData(seedFromProfile(profile, null));
    setNotice(null);
    setError(null);
    setTab("notes");
  }

  if (!review) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 text-sm text-indigo-950">
          <p className="font-semibold">Template Setup</p>
          <p className="mt-1 text-xs sm:text-sm text-indigo-900/80">
            Click <strong>Auto-Scan 2026 Template</strong> to initialize your personal{" "}
            <code className="font-mono text-xs">2026-Weekly-Accomplishment-Report.docx</code>.
          </p>
        </div>
        <TemplateScannerCard initialReview={null} onConfirmed={(confirmed) => setReview(confirmed)} />
      </div>
    );
  }

  const profileMissingName = !profile.name_last_first || !profile.name_first_last;

  return (
    <div className="space-y-4">
      {review.template.status === "pending_review" && (
        <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs sm:text-sm text-indigo-950">
          <span>
            Auto-detected <strong>{review.fields.length} fields</strong> from{" "}
            <code className="font-mono text-xs">{review.template.name}</code> — layout &amp; signatories preserved.
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/template" className="font-medium underline underline-offset-4">
              Review Fields
            </Link>
            <button
              type="button"
              disabled={confirming}
              onClick={handleQuickConfirm}
              className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60 cursor-pointer"
            >
              {confirming ? "Saving..." : "Looks Good"}
            </button>
          </div>
        </div>
      )}
      {profileMissingName && (
        <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-900">
          <span>Set your default intern name & verifier so every report auto-fills automatically.</span>
          <Link href="/profile" className="font-semibold underline underline-offset-4">
            Open Profile
          </Link>
        </div>
      )}

      {/* Mobile tab bar */}
      <div className="no-print lg:hidden grid grid-cols-3 rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
        {(
          [
            { id: "notes", label: "1. Notes" },
            { id: "edit", label: "2. Edit" },
            { id: "preview", label: "3. Preview" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-lg py-2 text-xs font-semibold transition cursor-pointer ${
              tab === item.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="no-print rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="no-print rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left column: Notes + Structured Editor */}
        <div className="no-print lg:col-span-6 space-y-5">
          {/* Raw Notes & Voice Input */}
          <section
            className={`${
              tab === "notes" ? "block" : "hidden lg:block"
            } rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Weekly Notes & Voice Input</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Speak or jot down what you did Mon–Fri, hours, trainings, and issues. AI formats it cleanly.
                </p>
              </div>
              {savedId && (
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  New Report
                </button>
              )}
            </div>

            <textarea
              rows={6}
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              placeholder="Example: Week of Nov 16 to Nov 20, 2026. Monday attended orientation and set up workstation. Tuesday helped configure switches in the server room. Wednesday fixed printer driver issues. Thursday updated inventory spreadsheet. Friday tested backup scripts. 40 hours this week, total 120 hours. Training: basic VLAN setup. Problem: unclear ticket details. Solution: clarified requirements with supervisor."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-900 outline-none focus:border-slate-900 focus:bg-white resize-y"
            />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <VoiceRecorder
                disabled={generating}
                onTranscript={(text) => setRawNotes((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text))}
              />

              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !rawNotes.trim()}
                className="w-full sm:w-auto rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
              >
                {generating ? "Formatting with AI..." : "Generate Report"}
              </button>
            </div>
          </section>

          {/* Inline Field Editor */}
          <div className={tab === "edit" ? "block" : "hidden lg:block"}>
            <ReportEditor data={data} onChange={setData} onSave={handleSave} saving={saving} savedId={savedId} />
          </div>
        </div>

        {/* Right column: Live DOCX Preview & Print */}
        <div
          className={`${
            tab === "preview" ? "block" : "hidden lg:block"
          } print:block lg:col-span-6 lg:sticky lg:top-20`}
        >
          <DocxPreviewPanel
            templateId={review.template.id}
            templateVersion={review.template.updated_at}
            fields={review.fields}
            data={data}
          />
          <div className="no-print mt-3 flex justify-end lg:hidden">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              {saving ? "Saving..." : savedId ? "Update Saved Report" : "Save Report to History"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
