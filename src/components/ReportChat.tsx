"use client";

import { useEffect, useRef, useState } from "react";
import type { QuotaStatus } from "@/lib/admin";
import { DAYS, type ReportData, type ReportKey } from "@/lib/report-schema";
import { VoiceRecorder } from "./VoiceRecorder";
import { ChatMarkdown } from "./ChatMarkdown";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolActions?: string[];
  updatedKeys?: ReportKey[];
}

interface ReportChatProps {
  data: ReportData;
  quota: QuotaStatus;
  savedId: string | null;
  messages: ChatTurn[];
  onMessagesChange: (next: ChatTurn[]) => void;
  onDataChange: (next: ReportData) => void;
  onQuotaChange: (next: QuotaStatus) => void;
  onNewReport: () => void;
  onOpenPreview: () => void;
  onSaveReport: () => void;
  saving: boolean;
}

function getMissingSummary(data: ReportData): string[] {
  const missing: string[] = [];
  if (!data.intern_name_last_first.trim() || !data.intern_name_first_last.trim()) missing.push("Intern name");
  if (!data.date_from.trim() || !data.date_to.trim()) missing.push("Dates (From–To)");
  if (!DAYS.some((d) => data[`${d}_accomplishments`].trim())) missing.push("Daily tasks (Mon–Fri)");
  if (!data.hours_this_week.trim()) missing.push("Hours this week");
  if (!data.total_hours_worked.trim()) missing.push("Total hours");
  return missing;
}

const QUICK_REPLIES = [
  "No new trainings, problems, or solutions this week.",
  "Total hours worked is the same as this week.",
  "Leave the remaining empty days blank.",
];

export function ReportChat({
  data,
  quota,
  savedId,
  messages,
  onMessagesChange,
  onDataChange,
  onQuotaChange,
  onNewReport,
  onOpenPreview,
  onSaveReport,
  saving,
}: ReportChatProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const turnSeqRef = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const missing = getMissingSummary(data);
  const quotaBlocked = !quota.allowed;

  async function sendMessage(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || sending || quotaBlocked) return;

    setError(null);
    const userTurn: ChatTurn = { id: `u-${++turnSeqRef.current}`, role: "user", content: text };
    const nextHistory = [...messages, userTurn];
    onMessagesChange(nextHistory);
    if (!textOverride) setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
          currentData: data,
        }),
      });
      const json = (await res.json()) as {
        reply?: string;
        structuredData?: ReportData;
        updatedKeys?: ReportKey[];
        toolActions?: string[];
        quota?: QuotaStatus;
        error?: string;
      };
      if (json.quota) onQuotaChange(json.quota);
      if (!res.ok || !json.reply) throw new Error(json.error ?? "Could not reach AI assistant.");

      if (json.structuredData) {
        onDataChange(json.structuredData);
      }

      const assistantTurn: ChatTurn = {
        id: `a-${++turnSeqRef.current}`,
        role: "assistant",
        content: json.reply,
        toolActions: json.toolActions,
        updatedKeys: json.updatedKeys,
      };
      onMessagesChange([...nextHistory, assistantTurn]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-100 px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white text-xs font-bold">
            AI
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 leading-tight">Report Assistant</h2>
            <p className="text-[11px] text-slate-500">
              {missing.length === 0
                ? "All required fields filled — ready to print or save"
                : `Missing: ${missing.join(", ")}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
              quota.isAdmin
                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                : quotaBlocked
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            {quota.isAdmin
              ? "Admin · Unlimited"
              : quota.isBlocked
                ? "AI Paused"
                : `${quota.remaining}/${quota.dailyLimit} prompts`}
          </span>

          {(savedId || messages.length > 1) && (
            <button
              type="button"
              onClick={onNewReport}
              disabled={sending}
              title="Delete conversation and reset report"
              className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
            >
              Reset Chat
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3.5 sm:px-4 py-4 space-y-3 min-h-[280px] max-h-[52vh] bg-slate-50/40"
      >
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-2xs ${
                m.role === "user"
                  ? "bg-slate-900 text-white rounded-br-sm whitespace-pre-wrap"
                  : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
              }`}
            >
              {m.role === "assistant" ? <ChatMarkdown content={m.content} /> : m.content}
            </div>
            {m.role === "assistant" && m.toolActions && m.toolActions.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {m.toolActions.map((act, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                  >
                    ✓ {act}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex items-start">
            <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-500 animate-pulse">
              Updating your report &amp; checking missing fields...
            </div>
          </div>
        )}
      </div>

      {/* Quick helper chips + Preview/Save shortcuts */}
      <div className="border-t border-slate-100 bg-white px-3.5 py-2 flex items-center gap-1.5 overflow-x-auto">
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            type="button"
            disabled={sending || quotaBlocked}
            onClick={() => void sendMessage(q)}
            className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
          >
            {q}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-3.5 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
        className="border-t border-slate-200 bg-white p-3 space-y-2.5"
      >
        <textarea
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          disabled={sending || quotaBlocked}
          placeholder="Tell me what you did this week, dates, hours, or answer my question... (Enter to send)"
          className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:bg-white resize-none disabled:opacity-60"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <VoiceRecorder
              compact
              disabled={sending || quota.isBlocked}
              onTranscript={(text) => setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))}
            />
            <button
              type="button"
              onClick={onSaveReport}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : savedId ? "Update Saved" : "Save"}
            </button>
            <button
              type="button"
              onClick={onOpenPreview}
              className="lg:hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Preview
            </button>
          </div>

          <button
            type="submit"
            disabled={sending || !input.trim() || quotaBlocked}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
