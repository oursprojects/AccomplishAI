"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Edit3, Eye, MessageSquareText, Save, Sparkles } from "lucide-react";
import { emptyReport, type ReportData } from "@/lib/report-schema";
import type { Profile } from "@/lib/supabase/database.types";
import type { TemplateReview } from "@/lib/templates/pipeline";
import type { QuotaStatus } from "@/lib/admin";
import { ReportChat, type ChatTurn } from "./ReportChat";
import { TemplateScannerCard } from "./TemplateScannerCard";
import { ReportEditor } from "./ReportEditor";
import { DocxPreviewPanel } from "./DocxPreviewPanel";

interface WorkspaceClientProps {
  userId: string;
  profile: Pick<Profile, "name_last_first" | "name_first_last" | "office" | "default_verifier" | "default_daily_hours">;
  initialReview: TemplateReview | null;
  initialReport: {
    id: string;
    raw_notes: string;
    structured_data: ReportData;
    chat_messages: ChatTurn[];
  } | null;
  initialDraft: {
    report_id: string | null;
    structured_data: ReportData;
    chat_messages: ChatTurn[];
  } | null;
  initialQuota: QuotaStatus;
}

type WorkspaceTab = "chat" | "edit" | "preview";

function seedData(
  profile: WorkspaceClientProps["profile"],
  report: WorkspaceClientProps["initialReport"],
  draft: WorkspaceClientProps["initialDraft"],
): ReportData {
  if (report) return { ...emptyReport(), ...report.structured_data };
  if (draft) {
    return {
      ...emptyReport(),
      ...draft.structured_data,
      intern_name_last_first: draft.structured_data.intern_name_last_first || profile.name_last_first || "",
      intern_name_first_last: draft.structured_data.intern_name_first_last || profile.name_first_last || "",
      office: draft.structured_data.office || profile.office || "YML",
    };
  }
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
        "I loaded your saved report. Tell me anything you'd like to add or update, and I'll update the preview.",
    };
  }

  const intro = profile.name_first_last
    ? `Hi **${profile.name_first_last}**! Your name and office (**${profile.office || "YML"}**) are pre-filled.`
    : `Hi! Paste or speak your weekly notes *(English or Tagalog)* and I'll put them straight into your **2026 Weekly Accomplishment Report**.`;

  return {
    id: "welcome",
    role: "assistant",
    content: `${intro}\n\nYou only need to share what you have — any remaining fields can be left blank or edited manually in **Edit**.`,
  };
}

function snapshotOf(data: ReportData, messages: ChatTurn[]): string {
  return JSON.stringify({
    data,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
}

export function WorkspaceClient({
  userId,
  profile,
  initialReview,
  initialReport,
  initialDraft,
  initialQuota,
}: WorkspaceClientProps) {
  const [review, setReview] = useState<TemplateReview | null>(initialReview);
  const [quota, setQuota] = useState<QuotaStatus>(initialQuota);
  const [data, setData] = useState<ReportData>(() => seedData(profile, initialReport, initialDraft));
  const [savedId, setSavedId] = useState<string | null>(initialReport?.id ?? initialDraft?.report_id ?? null);
  const [messages, setMessages] = useState<ChatTurn[]>(() => {
    if (initialReport?.chat_messages?.length) return initialReport.chat_messages;
    if (initialDraft?.chat_messages?.length) return initialDraft.chat_messages;
    return [buildWelcomeMessage(profile, initialReport)];
  });

  // Track last-saved state so Save is disabled whenever there are no unsaved edits
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => {
    if (initialReport) {
      const initData = seedData(profile, initialReport, null);
      const initMsgs = initialReport.chat_messages.length
        ? initialReport.chat_messages
        : [buildWelcomeMessage(profile, initialReport)];
      return snapshotOf(initData, initMsgs);
    }
    if (initialDraft && (initialDraft.chat_messages.length > 0 || Object.values(initialDraft.structured_data).some(Boolean))) {
      // Unsaved cross-device draft still has unsaved changes relative to empty report
      return "";
    }
    const freshData = seedData(profile, null, null);
    const freshMsgs = [buildWelcomeMessage(profile, null)];
    return snapshotOf(freshData, freshMsgs);
  });

  const currentSnapshot = useMemo(() => snapshotOf(data, messages), [data, messages]);
  const hasChanges = currentSnapshot !== savedSnapshot;

  const [tab, setTab] = useState<WorkspaceTab>(initialReport ? "edit" : "chat");
  const [desktopLeftMode, setDesktopLeftMode] = useState<"chat" | "edit">(initialReport ? "edit" : "chat");

  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Sync ongoing edits across devices (debounced)
  useEffect(() => {
    if (!hasChanges && !initialDraft) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/workspace-draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: savedId,
          structuredData: data,
          chatMessages: messages.map(({ id, role, content, toolActions }) => ({
            id,
            role,
            content,
            ...(toolActions ? { toolActions } : {}),
          })),
        }),
      }).catch(() => {});
    }, 900);
    return () => window.clearTimeout(timer);
  }, [userId, savedId, data, messages, hasChanges, initialDraft]);

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
    if (!hasChanges || saving) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const userNotes = messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n");
      const rawNotes = userNotes || initialReport?.raw_notes || "";
      const serializedMsgs = messages.map(({ id, role, content, toolActions }) => ({
        id,
        role,
        content,
        ...(toolActions ? { toolActions } : {}),
      }));

      const url = savedId ? `/api/reports/${savedId}` : "/api/reports";
      const method = savedId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: review?.template.id ?? null,
          rawNotes,
          structuredData: data,
          chatMessages: serializedMsgs,
        }),
      });
      const json = (await res.json()) as { report?: { id: string }; error?: string };
      if (!res.ok || !json.report) throw new Error(json.error ?? "Could not save report.");

      setSavedId(json.report.id);
      setSavedSnapshot(currentSnapshot);
      setNotice(savedId ? "Saved changes to report history." : "Report saved to history.");

      void fetch("/api/workspace-draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: json.report.id,
          structuredData: data,
          chatMessages: serializedMsgs,
        }),
      }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save report.");
    } finally {
      setSaving(false);
    }
  }

  function handleResetConversation() {
    const freshData = seedData(profile, null, null);
    const freshMsgs = [buildWelcomeMessage(profile, null)];
    setSavedId(null);
    setData(freshData);
    setMessages(freshMsgs);
    setSavedSnapshot(snapshotOf(freshData, freshMsgs));
    setNotice("Conversation deleted and report reset across all devices.");
    setError(null);
    setTab("chat");
    setDesktopLeftMode("chat");
    void fetch("/api/workspace-draft", { method: "DELETE" }).catch(() => {});
  }

  if (!review) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-[#D97757]/30 bg-[#D97757]/10 p-4 text-sm text-[#1F1E1C]">
          <p className="font-semibold">Template Setup</p>
          <p className="mt-1 text-xs sm:text-sm text-[#57544E]">
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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#D97757]/30 bg-[#D97757]/10 px-4 py-2.5 text-xs sm:text-sm text-[#1F1E1C]">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#C96442] shrink-0" />
            <span>
              Auto-detected <strong>{review.fields.length} fields</strong> from{" "}
              <code className="font-mono text-xs">{review.template.name}</code> — original design preserved.
            </span>
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/template" className="font-medium underline underline-offset-4 text-[#C96442]">
              Review Fields
            </Link>
            <button
              type="button"
              disabled={confirming}
              onClick={handleQuickConfirm}
              className="rounded-xl bg-[#D97757] px-3 py-1 text-xs font-medium text-white hover:bg-[#C96442] disabled:opacity-60 cursor-pointer"
            >
              {confirming ? "Saving..." : "Looks Good"}
            </button>
          </div>
        </div>
      )}

      {profileMissingName && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs sm:text-sm text-amber-900">
          <span>Tip: Set your default intern name &amp; verifier in Profile (or tell the AI assistant in chat).</span>
          <Link href="/profile" className="font-semibold underline underline-offset-4">
            Open Profile
          </Link>
        </div>
      )}

      {/* Mobile tab bar */}
      <div className="lg:hidden sticky top-[57px] z-20 grid grid-cols-3 rounded-2xl border border-[#E6E4DD] bg-white/95 backdrop-blur p-1 shadow-xs">
        <button
          type="button"
          onClick={() => setTab("chat")}
          className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
            tab === "chat" ? "bg-[#1F1E1C] text-white shadow-2xs" : "text-[#57544E] hover:bg-[#F4F2EA]"
          }`}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          <span>1. Chat</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("edit")}
          className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
            tab === "edit" ? "bg-[#1F1E1C] text-white shadow-2xs" : "text-[#57544E] hover:bg-[#F4F2EA]"
          }`}
        >
          <Edit3 className="h-3.5 w-3.5" />
          <span>2. Edit</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("preview")}
          className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
            tab === "preview" ? "bg-[#1F1E1C] text-white shadow-2xs" : "text-[#57544E] hover:bg-[#F4F2EA]"
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          <span>3. Preview</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left column: Chatbot + Manual Editor */}
        <div className="lg:col-span-6 space-y-4">
          <div className="hidden lg:grid grid-cols-2 rounded-2xl border border-[#E6E4DD] bg-white p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setDesktopLeftMode("chat")}
              className={`inline-flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
                desktopLeftMode === "chat" ? "bg-[#1F1E1C] text-white" : "text-[#57544E] hover:bg-[#F4F2EA]"
              }`}
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              <span>AI Chatbot Assistant</span>
            </button>
            <button
              type="button"
              onClick={() => setDesktopLeftMode("edit")}
              className={`inline-flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
                desktopLeftMode === "edit" ? "bg-[#1F1E1C] text-white" : "text-[#57544E] hover:bg-[#F4F2EA]"
              }`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Manual Field Editor</span>
            </button>
          </div>

          <div
            className={`${tab === "chat" ? "block" : "hidden"} ${
              desktopLeftMode === "chat" ? "lg:block" : "lg:hidden"
            }`}
          >
            <ReportChat
              data={data}
              quota={quota}
              savedId={savedId}
              hasChanges={hasChanges}
              messages={messages}
              onMessagesChange={setMessages}
              onDataChange={setData}
              onQuotaChange={setQuota}
              onNewReport={handleResetConversation}
              onOpenPreview={() => setTab("preview")}
              onSaveReport={handleSave}
              saving={saving}
            />
          </div>

          <div
            className={`${tab === "edit" ? "block" : "hidden"} ${
              desktopLeftMode === "edit" ? "lg:block" : "lg:hidden"
            }`}
          >
            <ReportEditor
              data={data}
              onChange={setData}
              onSave={handleSave}
              saving={saving}
              savedId={savedId}
              hasChanges={hasChanges}
            />
          </div>
        </div>

        {/* Right column: Live 1-Page DOCX Preview */}
        <div className={`${tab === "preview" ? "block" : "hidden lg:block"} lg:col-span-6 lg:sticky lg:top-6`}>
          <DocxPreviewPanel
            templateId={review.template.id}
            templateVersion={review.template.updated_at}
            fields={review.fields}
            data={data}
          />
          <div className="mt-3 flex justify-end lg:hidden">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1F1E1C] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#33312E] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
            >
              {hasChanges ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              <span>
                {saving
                  ? "Saving..."
                  : !hasChanges
                    ? "No Changes to Save"
                    : savedId
                      ? "Update Saved Report"
                      : "Save Report to History"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
