"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ClipboardPaste,
  Edit3,
  Eye,
  FileText,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Save,
  Undo2,
  X,
} from "lucide-react";
import { emptyReport, type ReportData } from "@/lib/report-schema";
import type { Profile } from "@/lib/supabase/database.types";
import type { TemplateReview } from "@/lib/templates/pipeline";
import type { QuotaStatus } from "@/lib/admin";
import { AccomplishCheckIcon } from "@/components/icons/AccomplishIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ReportChat, type ChatTurn } from "./ReportChat";
import { TemplateScannerCard } from "./TemplateScannerCard";
import { ReportEditor } from "./ReportEditor";
import { DocxPreviewPanel } from "./DocxPreviewPanel";

interface WorkspaceClientProps {
  userId: string;
  profile: Pick<
    Profile,
    "name_last_first" | "name_first_last" | "office" | "default_verifier" | "default_daily_hours" | "internship_start_date"
  >;
  holidayMondays?: string[];
  previousTotalHours?: string;
  initialReview: TemplateReview | null;
  initialReport: {
    id: string;
    title: string;
    raw_notes: string;
    structured_data: ReportData;
    chat_messages: ChatTurn[];
  };
  initialQuota: QuotaStatus;
  maxChatMessages?: number;
}

type WorkspaceTab = "chat" | "edit" | "preview";

function seedReportData(
  profile: WorkspaceClientProps["profile"],
  report: WorkspaceClientProps["initialReport"],
): ReportData {
  return {
    ...emptyReport(),
    ...report.structured_data,
    intern_name_last_first: report.structured_data.intern_name_last_first || profile.name_last_first || "",
    intern_name_first_last: report.structured_data.intern_name_first_last || profile.name_first_last || "",
    office: report.structured_data.office || profile.office || "DNX",
  };
}

function buildWelcomeMessage(profile: WorkspaceClientProps["profile"]): ChatTurn {
  const intro = profile.name_first_last
    ? `Hi **${profile.name_first_last}**! Your profile defaults (**${profile.office || "DNX"}**) are ready.`
    : `Hi! Tell me what you accomplished this week *(English or Tagalog)* and I'll automatically update this report.`;

  return {
    id: "welcome",
    role: "assistant",
    content: `${intro}\n\nShare only what you have — I'll record your accomplished tasks into the preview and you can refine or undo anytime.`,
  };
}

function formSnapshotOf(title: string, data: ReportData): string {
  return JSON.stringify({ title: title.trim(), data });
}

export function WorkspaceClient({
  profile,
  holidayMondays = [],
  previousTotalHours = "",
  initialReview,
  initialReport,
  initialQuota,
  maxChatMessages = 16,
}: WorkspaceClientProps) {
  const [review, setReview] = useState<TemplateReview | null>(initialReview);
  const [quota, setQuota] = useState<QuotaStatus>(initialQuota);

  const initialSeeded = useMemo(() => seedReportData(profile, initialReport), [profile, initialReport]);
  const [title, setTitle] = useState<string>(() => initialReport.title ?? "");
  const [data, setData] = useState<ReportData>(() => initialSeeded);
  const [undoStack, setUndoStack] = useState<Array<{ title: string; data: ReportData }>>([]);

  const savedStateRef = useRef<{ title: string; data: ReportData }>({
    title: initialReport.title ?? "",
    data: initialSeeded,
  });
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    formSnapshotOf(initialReport.title ?? "", initialSeeded),
  );

  const [messages, setMessages] = useState<ChatTurn[]>(() =>
    initialReport.chat_messages.length ? initialReport.chat_messages : [buildWelcomeMessage(profile)],
  );

  const currentSnapshot = useMemo(() => formSnapshotOf(title, data), [title, data]);
  const hasChanges = currentSnapshot !== savedSnapshot;

  // Keep live preview synced when server props refresh (e.g. edited via Overall AI) while user has no unsaved edits
  const serverSnapshot = useMemo(
    () => formSnapshotOf(initialReport.title ?? "", initialSeeded),
    [initialReport.title, initialSeeded],
  );
  useEffect(() => {
    if (serverSnapshot === savedSnapshot) return;
    if (currentSnapshot !== savedSnapshot) return;
    const id = window.requestAnimationFrame(() => {
      savedStateRef.current = { title: initialReport.title ?? "", data: initialSeeded };
      setSavedSnapshot(serverSnapshot);
      setTitle(initialReport.title ?? "");
      setData(initialSeeded);
    });
    return () => window.cancelAnimationFrame(id);
  }, [serverSnapshot, savedSnapshot, currentSnapshot, initialReport.title, initialSeeded]);

  const [tab, setTab] = useState<WorkspaceTab>("preview");
  const [desktopLeftMode, setDesktopLeftMode] = useState<"chat" | "edit">("chat");

  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [quickNotesOpen, setQuickNotesOpen] = useState(false);
  const [quickNotesText, setQuickNotesText] = useState("");
  const [generatingFromNotes, setGeneratingFromNotes] = useState(false);

  async function handleQuickFillNotes(e: React.FormEvent) {
    e.preventDefault();
    if (!quickNotesText.trim() || generatingFromNotes) return;
    setGeneratingFromNotes(true);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawNotes: quickNotesText.trim(),
          templateId: review?.template.id,
        }),
      });
      const json = (await res.json()) as {
        structuredData?: ReportData;
        quota?: QuotaStatus;
        error?: string;
      };
      if (json.quota) setQuota(json.quota);
      if (!res.ok || !json.structuredData) {
        throw new Error(json.error ?? "Failed to fill report from notes.");
      }
      pushUndoSnapshot(title, data);
      const merged: ReportData = {
        ...json.structuredData,
        date_from: json.structuredData.date_from || data.date_from,
        date_to: json.structuredData.date_to || data.date_to,
      };
      setData(merged);
      setQuickNotesOpen(false);
      setQuickNotesText("");
      toast.success("Filled report from your raw notes — review the live preview or click Undo anytime.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not process raw notes.");
    } finally {
      setGeneratingFromNotes(false);
    }
  }

  function pushUndoSnapshot(prevTitle: string, prevData: ReportData) {
    setUndoStack((prev) => [...prev.slice(-24), { title: prevTitle, data: prevData }]);
  }

  function handleDataChange(next: ReportData) {
    pushUndoSnapshot(title, data);
    setData(next);
  }

  function handleTitleChange(nextTitle: string) {
    setTitle(nextTitle);
  }

  function handleAiDataUpdate(next: ReportData) {
    pushUndoSnapshot(title, data);
    setData(next);
    // AI route already persisted structuredData to DB, keep saved snapshot in sync
    savedStateRef.current = { title, data: next };
    setSavedSnapshot(formSnapshotOf(title, next));
  }

  async function persistReportPatch(nextTitle: string, nextData: ReportData, nextMsgs?: ChatTurn[]) {
    const serialized = nextMsgs?.map(({ id, role, content, toolActions, mcpToolsUsed }) => ({
      id,
      role,
      content,
      ...(toolActions ? { toolActions } : {}),
      ...(mcpToolsUsed ? { mcpToolsUsed } : {}),
    }));
    await fetch(`/api/reports/${initialReport.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle.trim(),
        structuredData: nextData,
        ...(serialized ? { chatMessages: serialized } : {}),
      }),
    }).catch(() => {});
  }

  function handleUndo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setTitle(prev.title);
    setData(prev.data);
    toast.info("Reverted the last change.");
    void persistReportPatch(prev.title, prev.data);
  }

  function handleCancelChanges() {
    const baseline = savedStateRef.current;
    pushUndoSnapshot(title, data);
    setTitle(baseline.title);
    setData(baseline.data);
    toast.info("Cancelled unsaved edits and restored last saved version.");
  }

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
      const json = (await res.json()) as { review?: TemplateReview; error?: string };
      if (!res.ok || !json.review) throw new Error(json.error ?? "Could not confirm template.");
      setReview(json.review);
      toast.success("Template confirmed and saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not confirm template.");
    } finally {
      setConfirming(false);
    }
  }

  async function handleSave() {
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      const userNotes = messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n");
      const rawNotes = userNotes || initialReport.raw_notes || "";
      const serializedMsgs = messages.map(({ id, role, content, toolActions, mcpToolsUsed }) => ({
        id,
        role,
        content,
        ...(toolActions ? { toolActions } : {}),
        ...(mcpToolsUsed ? { mcpToolsUsed } : {}),
      }));

      const res = await fetch(`/api/reports/${initialReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          rawNotes,
          structuredData: data,
          chatMessages: serializedMsgs,
        }),
      });
      const json = (await res.json()) as { report?: { id: string }; error?: string };
      if (!res.ok || !json.report) throw new Error(json.error ?? "Could not save report.");

      savedStateRef.current = { title: title.trim(), data };
      setSavedSnapshot(formSnapshotOf(title.trim(), data));
      toast.success("Saved changes to this report.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save report.");
    } finally {
      setSaving(false);
    }
  }

  /** Clears ONLY chat messages while keeping all filled report fields intact. */
  function handleClearChat() {
    const freshMsgs: ChatTurn[] = [
      {
        id: "cleared-chat",
        role: "assistant",
        content:
          "Conversation cleared. **All filled fields in your report document were kept intact.** Send more updates anytime!",
      },
    ];
    setMessages(freshMsgs);
    toast.info("Conversation cleared. Your document fields remain intact.");
    void persistReportPatch(title, data, freshMsgs);
  }

  // Auto-save debounced edits for this specific report
  useEffect(() => {
    if (!hasChanges) return;
    const timer = window.setTimeout(() => {
      void fetch(`/api/reports/${initialReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          structuredData: data,
        }),
      })
        .then(async (r) => {
          if (r.ok) {
            savedStateRef.current = { title: title.trim(), data };
            setSavedSnapshot(formSnapshotOf(title.trim(), data));
          } else {
            const j = (await r.json().catch(() => ({}))) as { error?: string };
            if (j.error) toast.error(j.error);
          }
        })
        .catch(() => {});
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [initialReport.id, title, data, hasChanges]);

  if (!review) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-[#D97757]/30 bg-[#FDF3EF] p-4 text-sm text-[#1F1E1C]">
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
  const fallbackTitle = [data.date_from, data.date_to].filter(Boolean).join(" – ") || "Untitled Weekly Report";

  const workspaceBusy = saving || confirming || generatingFromNotes;

  return (
    <div className="space-y-4 pb-8">
      {/* Top report bar showing exact report being edited + Undo / Cancel / Save */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[#E6E2D8] bg-white px-3.5 sm:px-4 py-2.5 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#DDD7CB] bg-[#FAF9F5] px-2.5 text-xs font-medium text-[#4A463F] hover:bg-[#F4F2EA] transition shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reports</span>
          </Link>

          <FileText className="h-4 w-4 text-[#D97757] shrink-0" />
          <div className="min-w-0 flex-1">
            <input
              type="text"
              maxLength={120}
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder={fallbackTitle}
              aria-label="Report title"
              className="w-full max-w-md bg-transparent text-sm font-semibold text-[#1F1E1C] placeholder:text-[#6B665E] outline-none border-b border-transparent focus:border-[#D97757] py-0.5 transition"
            />
          </div>

          <Badge variant={hasChanges ? "warning" : "success"} className="hidden sm:inline-flex shrink-0">
            {hasChanges ? "Unsaved edits" : "Synced"}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!quota.allowed || workspaceBusy}
            onClick={() => setQuickNotesOpen(true)}
            title="Paste a whole week of raw notes and fill the report in 1 prompt"
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-[#D97757]" />
            <span className="hidden sm:inline">Paste Notes</span>
          </Button>
          {undoStack.length > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={handleUndo} disabled={workspaceBusy}>
              <Undo2 className="h-3.5 w-3.5 text-[#D97757]" />
              <span>Undo</span>
            </Button>
          )}
          {hasChanges && (
            <Button type="button" size="sm" variant="outline" onClick={handleCancelChanges} disabled={workspaceBusy}>
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Cancel</span>
            </Button>
          )}
          <Button type="button" size="sm" onClick={handleSave} disabled={workspaceBusy || !hasChanges}>
            {hasChanges ? <Save className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            <span>{saving ? "Saving..." : !hasChanges ? "Saved" : "Save"}</span>
          </Button>
        </div>
      </div>

      {review.template.status === "pending_review" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#D97757]/30 bg-[#FDF3EF] px-4 py-2.5 text-xs sm:text-sm text-[#1F1E1C]">
          <span className="inline-flex items-center gap-2">
            <AccomplishCheckIcon className="h-4 w-4 text-[#C86343] shrink-0" />
            <span>
              Auto-detected <strong>{review.fields.length} fields</strong> from{" "}
              <code className="font-mono text-xs">{review.template.name}</code> — original design preserved.
            </span>
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/template" className="font-medium underline underline-offset-4 text-[#C86343]">
              Review Fields
            </Link>
            <Button type="button" size="sm" variant="accent" disabled={confirming} onClick={handleQuickConfirm}>
              {confirming ? "Saving..." : "Looks Good"}
            </Button>
          </div>
        </div>
      )}

      {profileMissingName && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs sm:text-sm text-amber-900">
          <span>Tip: Set your default intern name &amp; verifier in Profile so new reports pre-fill automatically.</span>
          <Link href="/profile" className="font-semibold underline underline-offset-4">
            Open Profile
          </Link>
        </div>
      )}

      {/* Mobile & tablet tab bar — Live Preview is front and center alongside Chat & Edit */}
      <div className="lg:hidden sticky top-[53px] z-20 grid grid-cols-3 gap-1 rounded-2xl border border-[#E6E2D8] bg-white/95 backdrop-blur p-1 shadow-xs">
        <button
          type="button"
          onClick={() => setTab("preview")}
          className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
            tab === "preview" ? "bg-[#1F1E1C] text-white shadow-2xs" : "text-[#57544E] hover:bg-[#F4F2EA]"
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Document</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("chat")}
          className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
            tab === "chat" ? "bg-[#1F1E1C] text-white shadow-2xs" : "text-[#57544E] hover:bg-[#F4F2EA]"
          }`}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          <span>AI Chat</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("edit")}
          className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
            tab === "edit" ? "bg-[#1F1E1C] text-white shadow-2xs" : "text-[#57544E] hover:bg-[#F4F2EA]"
          }`}
        >
          <Edit3 className="h-3.5 w-3.5" />
          <span>Edit Fields</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Main Focus Column: Live 1-Page DOCX Preview (first on desktop left/center or right? Let's place prominent lg:col-span-7 on the left/main area OR responsive order-1 / lg:order-2!) */}
        <div
          className={`${
            tab === "preview" ? "block" : "hidden lg:block"
          } lg:col-span-7 lg:order-2 lg:sticky lg:top-[4.25rem]`}
        >
          <DocxPreviewPanel
            templateId={review.template.id}
            templateVersion={review.template.updated_at}
            fields={review.fields}
            data={data}
            reportTitle={title}
          />
        </div>

        {/* Interactive Chat + Manual Edit Column */}
        <div className="lg:col-span-5 lg:order-1 space-y-3.5">
          <div className="hidden lg:grid grid-cols-2 rounded-2xl border border-[#E6E2D8] bg-white p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setDesktopLeftMode("chat")}
              className={`inline-flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
                desktopLeftMode === "chat" ? "bg-[#1F1E1C] text-white" : "text-[#57544E] hover:bg-[#F4F2EA]"
              }`}
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              <span>AI Assistant</span>
            </button>
            <button
              type="button"
              onClick={() => setDesktopLeftMode("edit")}
              className={`inline-flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
                desktopLeftMode === "edit" ? "bg-[#1F1E1C] text-white" : "text-[#57544E] hover:bg-[#F4F2EA]"
              }`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Manual Edit</span>
            </button>
          </div>

          <div
            className={`${tab === "chat" ? "block" : "hidden"} ${
              desktopLeftMode === "chat" ? "lg:block" : "lg:hidden"
            }`}
          >
            <ReportChat
              reportId={initialReport.id}
              data={data}
              quota={quota}
              maxChatMessages={maxChatMessages}
              messages={messages}
              canUndo={undoStack.length > 0}
              onUndo={handleUndo}
              onMessagesChange={setMessages}
              onAiDataUpdate={handleAiDataUpdate}
              onQuotaChange={setQuota}
              onClearChat={handleClearChat}
              onOpenPreview={() => setTab("preview")}
            />
          </div>

          <div
            className={`${tab === "edit" ? "block" : "hidden"} ${
              desktopLeftMode === "edit" ? "lg:block" : "lg:hidden"
            }`}
          >
            <ReportEditor
              title={title}
              onTitleChange={handleTitleChange}
              data={data}
              onChange={handleDataChange}
              onSave={handleSave}
              onUndo={handleUndo}
              onCancelChanges={handleCancelChanges}
              canUndo={undoStack.length > 0}
              saving={saving}
              hasChanges={hasChanges}
              defaultVerifier={profile.default_verifier}
              defaultDailyHours={profile.default_daily_hours}
              previousTotalHours={previousTotalHours}
              internshipStartDate={profile.internship_start_date ?? null}
              holidayMondays={holidayMondays}
            />
          </div>
        </div>
      </div>

      {/* 1-Click Batch Paste Notes Modal */}
      <Dialog open={quickNotesOpen} onOpenChange={setQuickNotesOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleQuickFillNotes}>
            <DialogHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <DialogTitle>1-Click Fill from Raw Weekly Notes</DialogTitle>
                  <DialogDescription>
                    Paste your Monday–Friday notes (English or Tagalog) to convert everything into past-tense tasks in a
                    single AI prompt.
                  </DialogDescription>
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => setQuickNotesOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogHeader>
            <div className="px-5 py-2">
              <Textarea
                rows={7}
                autoFocus
                required
                value={quickNotesText}
                onChange={(e) => setQuickNotesText(e.target.value)}
                placeholder="Paste your Monday to Friday notes here..."
                className="resize-y"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={generatingFromNotes}
                onClick={() => setQuickNotesOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={generatingFromNotes || !quickNotesText.trim()}>
                {generatingFromNotes ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ClipboardPaste className="h-3.5 w-3.5" />
                )}
                <span>{generatingFromNotes ? "Filling Report..." : "Fill Report"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
