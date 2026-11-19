"use client";

import { useState } from "react";
import Link from "next/link";
import { emptyReport, type ReportData } from "@/lib/report-schema";
import type { Profile } from "@/lib/supabase/database.types";
import type { TemplateReview } from "@/lib/templates/pipeline";
import type { QuotaStatus } from "@/lib/admin";
import { ReportChat, type ChatTurn } from "./ReportChat";
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
  initialQuota: QuotaStatus;
}

type WorkspaceTab = "chat" | "edit" | "preview";

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

function buildWelcomeMessage(
  profile: WorkspaceClientProps["profile"],
  report: WorkspaceClientProps["initialReport"],
): ChatTurn {
  if (report) {
    return {
      id: "welcome-existing",
      role: "assistant",
      content:
        "I loaded your saved report. Tell me anything you'd like to add or update (for example: extra tasks, hours, or dates), and I'll update the 1-page preview.",
    };
  }

  const missingProfile: string[] = [];
  if (!profile.name_last_first.trim() || !profile.name_first_last.trim()) {
    missingProfile.push("your full name");
  }
  const intro = profile.name_first_last
    ? `Hi **${profile.name_first_last}**! I pre-filled your name and office (**${profile.office || "YML"}**).`
    : `Hi! Tell me what you accomplished this week *(or tap Voice to speak)*.`;

  const askList = [
    ...missingProfile,
    "**Week dates** (*From – To*)",
    "**Daily tasks** (*Mon–Fri*)",
    "**Hours worked** (*this week & total*)",
    "**New trainings, problems, or solutions**",
  ];

  return {
    id: "welcome",
    role: "assistant",
    content: `${intro}\n\nShare what you have for your **Weekly Accomplishment Report** — if anything is still needed, I'll ask:\n- ${askList.join("\n- ")}`,
  };
}

export function WorkspaceClient({ profile, initialReview, initialReport, initialQuota }: WorkspaceClientProps) {
  const [review, setReview] = useState<TemplateReview | null>(initialReview);
  const [quota, setQuota] = useState<QuotaStatus>(initialQuota);
  const [data, setData] = useState<ReportData>(() => seedFromProfile(profile, initialReport));
  const [savedId, setSavedId] = useState<string | null>(initialReport?.id ?? null);
  const [messages, setMessages] = useState<ChatTurn[]>(() => [buildWelcomeMessage(profile, initialReport)]);
  const [tab, setTab] = useState<WorkspaceTab>(initialReport ? "edit" : "chat");
  const [desktopLeftMode, setDesktopLeftMode] = useState<"chat" | "edit">(initialReport ? "edit" : "chat");

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

  async function handleSave() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const userNotes = messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n");
      const rawNotes = userNotes || initialReport?.raw_notes || "";

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
    setData(seedFromProfile(profile, null));
    setMessages([buildWelcomeMessage(profile, null)]);
    setNotice(null);
    setError(null);
    setTab("chat");
    setDesktopLeftMode("chat");
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
        <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/90 px-4 py-2.5 text-xs sm:text-sm text-indigo-950">
          <span>
            Auto-detected <strong>{review.fields.length} fields</strong> from{" "}
            <code className="font-mono text-xs">{review.template.name}</code> — original design preserved.
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
        <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs sm:text-sm text-amber-900">
          <span>Tip: Set your default intern name &amp; verifier in Profile (or tell the AI assistant in chat).</span>
          <Link href="/profile" className="font-semibold underline underline-offset-4">
            Open Profile
          </Link>
        </div>
      )}

      {/* Mobile tab bar */}
      <div className="no-print lg:hidden sticky top-[96px] z-20 grid grid-cols-3 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur p-1 shadow-xs">
        {(
          [
            { id: "chat", label: "1. AI Chat" },
            { id: "edit", label: "2. Edit" },
            { id: "preview", label: "3. Preview" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`min-h-[38px] rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
              tab === item.id ? "bg-slate-900 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
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
        {/* Left column: Chatbot + Manual Editor */}
        <div className="no-print lg:col-span-6 space-y-4">
          {/* Desktop mode toggle between AI Chat and Manual Field Editor */}
          <div className="hidden lg:grid grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setDesktopLeftMode("chat")}
              className={`rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
                desktopLeftMode === "chat" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              AI Chatbot Assistant
            </button>
            <button
              type="button"
              onClick={() => setDesktopLeftMode("edit")}
              className={`rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
                desktopLeftMode === "edit" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Manual Field Editor
            </button>
          </div>

          <div className={`${tab === "chat" ? "block" : "hidden"} ${desktopLeftMode === "chat" ? "lg:block" : "lg:hidden"}`}>
            <ReportChat
              data={data}
              quota={quota}
              savedId={savedId}
              messages={messages}
              onMessagesChange={setMessages}
              onDataChange={setData}
              onQuotaChange={setQuota}
              onNewReport={handleStartNew}
              onOpenPreview={() => setTab("preview")}
              onSaveReport={handleSave}
              saving={saving}
            />
          </div>

          <div className={`${tab === "edit" ? "block" : "hidden"} ${desktopLeftMode === "edit" ? "lg:block" : "lg:hidden"}`}>
            <ReportEditor data={data} onChange={setData} onSave={handleSave} saving={saving} savedId={savedId} />
          </div>
        </div>

        {/* Right column: Live 1-Page DOCX Preview & Print */}
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
              className="w-full min-h-[42px] rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              {saving ? "Saving..." : savedId ? "Update Saved Report" : "Save Report to History"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
