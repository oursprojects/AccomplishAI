"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Eraser,
  Eye,
  Send,
  Undo2,
} from "lucide-react";
import type { QuotaStatus } from "@/lib/admin";
import { DAYS, type ReportData, type ReportKey } from "@/lib/report-schema";
import { ReportPenIcon } from "@/components/icons/AccomplishIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChatMarkdown } from "./ChatMarkdown";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolActions?: string[];
  mcpToolsUsed?: string[];
  updatedKeys?: ReportKey[];
}

interface ReportChatProps {
  reportId: string;
  data: ReportData;
  quota: QuotaStatus;
  maxChatMessages: number;
  messages: ChatTurn[];
  canUndo: boolean;
  onUndo: () => void;
  onMessagesChange: (next: ChatTurn[]) => void;
  onAiDataUpdate: (next: ReportData) => void;
  onQuotaChange: (next: QuotaStatus) => void;
  onClearChat: () => void;
  onOpenPreview: () => void;
}

const THINKING_PHRASES = [
  "Reading your notes & organizing daily tasks...",
  "Converting entries into past-tense report bullets...",
  "Calculating weekly hours & checking dates...",
  "Syncing updates to your live document preview...",
] as const;

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
  maxChatMessages,
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
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedRetryPayload, setFailedRetryPayload] = useState<ChatTurn[] | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!sending) return;
    const id = window.setInterval(() => {
      setThinkingIdx((prev) => (prev + 1) % THINKING_PHRASES.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, [sending]);

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
  const contextAtLimit = contextCount >= maxChatMessages;
  const contextNearLimit = !contextAtLimit && contextCount >= Math.max(2, maxChatMessages - 4);
  const composerDisabled = sending || quotaBlocked || contextAtLimit;

  async function submitHistory(nextHistory: ChatTurn[], attempt = 0): Promise<void> {
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
        mcpToolsUsed?: string[];
        quota?: QuotaStatus;
        retryAfterSeconds?: number;
        error?: string;
      };
      if (json.quota) onQuotaChange(json.quota);

      if (res.status === 429 && attempt < 1) {
        const waitSecs = Math.max(2, Math.min(8, Number(json.retryAfterSeconds ?? 4)));
        setQueueNotice(`High concurrent traffic — retrying automatically in ${waitSecs}s...`);
        await new Promise((r) => setTimeout(r, waitSecs * 1000));
        setQueueNotice(null);
        return submitHistory(nextHistory, attempt + 1);
      }

      if (!res.ok || !json.reply) {
        throw new Error(json.error ?? "Could not reach AI assistant.");
      }

      if (json.structuredData && JSON.stringify(json.structuredData) !== JSON.stringify(data)) {
        onAiDataUpdate(json.structuredData);
      }

      setFailedRetryPayload(null);
      const assistantTurn: ChatTurn = {
        id: `a-${crypto.randomUUID()}`,
        role: "assistant",
        content: json.reply,
        toolActions: json.toolActions,
        mcpToolsUsed: json.mcpToolsUsed,
        updatedKeys: json.updatedKeys,
      };
      onMessagesChange([...nextHistory, assistantTurn]);
    } catch (err) {
      setQueueNotice(null);
      setFailedRetryPayload(nextHistory);
      setError(err instanceof Error ? err.message : "Failed to send message.");
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || composerDisabled) return;

    setError(null);
    setQueueNotice(null);
    setFailedRetryPayload(null);
    const userTurn: ChatTurn = { id: `u-${crypto.randomUUID()}`, role: "user", content: text };
    const nextHistory = [...messages, userTurn];
    onMessagesChange(nextHistory);
    setInput("");
    setSending(true);
    try {
      await submitHistory(nextHistory, 0);
    } finally {
      setSending(false);
    }
  }

  async function retryLastFailed() {
    if (!failedRetryPayload || sending) return;
    setError(null);
    setQueueNotice(null);
    setSending(true);
    try {
      await submitHistory(failedRetryPayload, 0);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="overflow-hidden flex flex-col">
      {/* Header */}
      <div className="border-b border-[#E6E2D8] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-[#F7F6F0]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#D97757] text-white shadow-2xs shrink-0">
            <ReportPenIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#1F1E1C] leading-tight">Report Assistant</h2>
            <p className="text-[11px] text-[#6B665E] truncate">
              {missing.length === 0
                ? "Main sections complete — ask anytime for tweaks or polish"
                : "Share rough notes in English or Tagalog to build your preview"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            title="AI reads & updates your Supabase database via AccomplishAI's built-in MCP server (/api/mcp)"
            className="gap-1 text-[10px]"
          >
            <Database className="h-3 w-3 text-[#D97757]" />
            <span>MCP · Supabase</span>
          </Badge>
          <Badge
            variant={contextAtLimit ? "destructive" : contextNearLimit ? "warning" : "outline"}
            title="Messages in this report's chat context (configurable by Admin)."
          >
            {contextCount}/{maxChatMessages} ctx
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
        role="log"
        aria-live="polite"
        aria-label="Accomplish AI conversation"
        className="flex-1 overflow-y-auto px-3.5 sm:px-4 py-3.5 space-y-3 min-h-[260px] max-h-[54vh] bg-[#FAF9F5]/70"
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
                {m.mcpToolsUsed?.map((toolName) => (
                  <Badge
                    key={toolName}
                    variant="outline"
                    className="font-mono text-[10px] gap-1"
                    title="Executed over AccomplishAI's Supabase-backed MCP server"
                  >
                    <Database className="h-2.5 w-2.5 text-[#D97757]" />
                    <span>{`MCP: ${toolName}`}</span>
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
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm border border-[#E6E2D8] bg-white px-3.5 py-2 text-xs text-[#6B665E] animate-pulse">
              <ReportPenIcon className="h-3.5 w-3.5 text-[#D97757]" />
              <span>{queueNotice ?? THINKING_PHRASES[thinkingIdx]}</span>
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
              Chat context limit reached ({maxChatMessages} messages). Clear the chat to continue — your report fields
              stay untouched.
            </span>
          </span>
          <Button type="button" size="sm" onClick={onClearChat} className="bg-amber-900 hover:bg-amber-800">
            Clear Chat
          </Button>
        </div>
      )}

      {error && (
        <div className="mx-3.5 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          {failedRetryPayload && (
            <Button type="button" size="sm" variant="destructive" onClick={() => void retryLastFailed()}>
              Retry
            </Button>
          )}
        </div>
      )}

      {/* Compact integrated composer (no mic, no bulky footer) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
        className="border-t border-[#E6E2D8] bg-white p-2.5"
      >
        <div className="flex items-end gap-2 rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-2.5 py-1.5 focus-within:border-[#D97757] focus-within:bg-white transition">
          <textarea
            rows={2}
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
                ? "Click 'Clear Chat' above to continue..."
                : "Share your accomplishments or edits... (Enter to send)"
            }
            className="flex-1 bg-transparent py-1 text-sm text-[#1F1E1C] placeholder:text-[#8A847A] outline-none resize-none max-h-28 disabled:opacity-60"
          />

          <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenPreview}
              className="lg:hidden h-8 px-2.5"
              title="View document preview"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="accent"
              disabled={composerDisabled || !input.trim()}
              className="h-8 px-3"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{sending ? "..." : "Send"}</span>
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
