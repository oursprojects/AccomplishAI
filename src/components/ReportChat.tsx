"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Eraser,
  Eye,
  Send,
  Undo2,
} from "lucide-react";
import type { QuotaStatus } from "@/lib/admin";
import { DAYS, MAX_CHAT_MESSAGES, type ReportData, type ReportKey } from "@/lib/report-schema";
import { ReportPenIcon } from "@/components/icons/AccomplishIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
  reportId: string;
  data: ReportData;
  quota: QuotaStatus;
  messages: ChatTurn[];
  canUndo: boolean;
  onUndo: () => void;
  onMessagesChange: (next: ChatTurn[]) => void;
  onAiDataUpdate: (next: ReportData) => void;
  onQuotaChange: (next: QuotaStatus) => void;
  onClearChat: () => void;
  onOpenPreview: () => void;
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

export function ReportChat({
  reportId,
  data,
  quota,
  messages,
  canUndo,
  onUndo,
  onMessagesChange,
  onAiDataUpdate,
  onQuotaChange,
  onClearChat,
  onOpenPreview,
}: ReportChatProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const turnSeqRef = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function handleCopyReply(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // Ignore clipboard failures
    }
  }

  const missing = getMissingSummary(data);
  const quotaBlocked = !quota.allowed;
  const contextCount = messages.length;
  const contextAtLimit = contextCount >= MAX_CHAT_MESSAGES;
  const contextNearLimit = !contextAtLimit && contextCount >= MAX_CHAT_MESSAGES - 4;
  const composerDisabled = sending || quotaBlocked || contextAtLimit;

  async function sendMessage() {
    const text = input.trim();
    if (!text || composerDisabled) return;

    setError(null);
    const userTurn: ChatTurn = { id: `u-${++turnSeqRef.current}`, role: "user", content: text };
    const nextHistory = [...messages, userTurn];
    onMessagesChange(nextHistory);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
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

      if (json.structuredData && (json.updatedKeys?.length ?? 0) > 0) {
        onAiDataUpdate(json.structuredData);
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
    <Card className="overflow-hidden flex flex-col">
      {/* Header */}
      <div className="border-b border-[#E6E2D8] px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-[#F7F6F0]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#D97757] text-white shadow-2xs shrink-0">
            <ReportPenIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#1F1E1C] leading-tight">Report Assistant</h2>
            <p className="text-[11px] text-[#6B665E] truncate">
              {missing.length === 0
                ? "Auto-updates this report — all main sections filled"
                : "Auto-updates this report from your English or Tagalog notes"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={contextAtLimit ? "destructive" : contextNearLimit ? "warning" : "outline"}
            title="Messages in this report's chat context. Clear Chat keeps your filled document intact."
          >
            {contextCount}/{MAX_CHAT_MESSAGES} ctx
          </Badge>

          {canUndo && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onUndo}
              disabled={sending}
              title="Undo last change made to the report"
            >
              <Undo2 className="h-3 w-3 text-[#D97757]" />
              <span>Undo</span>
            </Button>
          )}

          {messages.length > 1 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onClearChat}
              disabled={sending}
              title="Clear chat messages only — keeps your filled .docx document intact"
            >
              <Eraser className="h-3 w-3 text-[#D97757]" />
              <span>Clear Chat</span>
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3.5 sm:px-4 py-4 space-y-3 min-h-[280px] max-h-[54vh] bg-[#FAF9F5]/70"
      >
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-2xs ${
                m.role === "user"
                  ? "bg-[#1F1E1C] text-white rounded-br-sm whitespace-pre-wrap"
                  : "bg-white border border-[#E6E2D8] text-[#1F1E1C] rounded-bl-sm"
              }`}
            >
              {m.role === "assistant" ? <ChatMarkdown content={m.content} /> : m.content}
            </div>
            {m.role === "assistant" && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {m.toolActions?.map((act, idx) => (
                  <Badge key={idx} variant="success" className="font-medium">
                    <Check className="h-3 w-3" />
                    {act}
                  </Badge>
                ))}
                {m.id !== "welcome" && m.id !== "welcome-existing" && m.id !== "cleared-chat" && (
                  <button
                    type="button"
                    onClick={() => void handleCopyReply(m.id, m.content)}
                    className="inline-flex items-center gap-1 rounded-full border border-[#DDD7CB] bg-white px-2 py-0.5 text-[11px] font-medium text-[#57544E] hover:bg-[#F4F2EA] cursor-pointer"
                    title="Copy reply"
                  >
                    {copiedId === m.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedId === m.id ? "Copied" : "Copy"}</span>
                  </button>
                )}
                {m.toolActions && m.toolActions.length > 0 && (
                  <button
                    type="button"
                    onClick={onOpenPreview}
                    className="lg:hidden inline-flex items-center gap-1 rounded-full bg-[#1F1E1C] px-2.5 py-0.5 text-[11px] font-medium text-white cursor-pointer"
                  >
                    <Eye className="h-3 w-3" />
                    <span>View Preview</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex items-start">
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm border border-[#E6E2D8] bg-white px-3.5 py-2.5 text-xs text-[#6B665E] animate-pulse">
              <ReportPenIcon className="h-3.5 w-3.5 text-[#D97757]" />
              <span>Updating this report...</span>
            </div>
          </div>
        )}
      </div>

      {/* Context limit warning banner */}
      {contextAtLimit && (
        <div className="mx-3.5 my-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
            <span>
              Chat context limit reached ({MAX_CHAT_MESSAGES} messages). Clear the chat to continue — your filled
              report fields stay untouched.
            </span>
          </span>
          <Button type="button" size="sm" onClick={onClearChat} className="bg-amber-900 hover:bg-amber-800">
            Clear Chat
          </Button>
        </div>
      )}

      {error && (
        <div className="mx-3.5 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Composer (no Update button — AI auto-updates the form) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
        className="border-t border-[#E6E2D8] bg-white p-3 space-y-2.5"
      >
        <Textarea
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          disabled={composerDisabled}
          placeholder={
            contextAtLimit
              ? "Click 'Clear Chat' to continue chatting — your document fields remain filled."
              : "Describe what you accomplished (English or Tagalog)... Enter to send"
          }
          className="resize-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <VoiceRecorder
              compact
              disabled={composerDisabled}
              onTranscript={(text) => setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenPreview}
              className="lg:hidden"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Preview</span>
            </Button>
          </div>

          <Button
            type="submit"
            variant="accent"
            disabled={composerDisabled || !input.trim()}
          >
            <Send className="h-3.5 w-3.5" />
            <span>{sending ? "Sending..." : "Send"}</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}
