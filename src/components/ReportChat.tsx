"use client";

import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Database,
  Eraser,
  Eye,
  Loader2,
  Square,
  Undo2,
} from "lucide-react";
import type { QuotaStatus } from "@/lib/admin";
import { parseJsonResponse } from "@/lib/client-json";
import { DAYS, type ReportData, type ReportKey } from "@/lib/report-schema";
import { ReportPenIcon } from "@/components/icons/AccomplishIcons";
import { AnimatedCheckIcon, AnimatedSendIcon } from "@/components/icons/AnimatedIcons";
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text";
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
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
  const hasAnyTasks = DAYS.some((d) => data[`${d}_accomplishments`].trim().length > 0);
  const missingReflections =
    !data.new_trainings.trim() && !data.problems_encountered.trim() && !data.solutions_done.trim();

  const quickPrompts: Array<{ label: string; prompt: string }> = [];
  if (hasAnyTasks) {
    quickPrompts.push({
      label: "Polish past tense",
      prompt: "Review my Monday-Friday tasks and polish any grammar or tense into formal past-tense report bullets.",
    });
    if (missingReflections) {
      quickPrompts.push({
        label: "Draft reflections",
        prompt:
          "Based on my daily tasks, draft concise realistic new trainings, problems encountered, and solutions done in the report.",
      });
    }
    if (!data.hours_this_week.trim() || !data.total_hours_worked.trim()) {
      quickPrompts.push({
        label: "Compute hours",
        prompt: "Calculate and fill my hours this week and cumulative total hours worked.",
      });
    }
  } else {
    quickPrompts.push({
      label: "Fill week dates & profile",
      prompt: "Auto-fill my report dates from my internship calendar and profile defaults.",
    });
    quickPrompts.push({
      label: "Check what's missing",
      prompt: "Check which fields are currently missing in this report.",
    });
  }

  const quotaBlocked = !quota.allowed;
  const contextCount = messages.length;
  const composerDisabled = sending || quotaBlocked;
  void maxChatMessages;

  function handleStop() {
    abortRef.current?.abort();
  }

  async function submitHistory(nextHistory: ChatTurn[], attempt = 0): Promise<void> {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/chat-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          reportId,
          messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
          currentData: data,
        }),
      });
      const json = await parseJsonResponse<{
        reply?: string;
        structuredData?: ReportData;
        updatedKeys?: ReportKey[];
        toolActions?: string[];
        mcpToolsUsed?: string[];
        quota?: QuotaStatus;
        retryAfterSeconds?: number;
        error?: string;
      }>(res);
      if (json?.quota) onQuotaChange(json.quota);

      if (res.status === 429 && attempt < 1) {
        const waitSecs = Math.max(2, Math.min(8, Number(json?.retryAfterSeconds ?? 4)));
        setQueueNotice(`High concurrent traffic — retrying automatically in ${waitSecs}s...`);
        await new Promise((r) => setTimeout(r, waitSecs * 1000));
        setQueueNotice(null);
        return submitHistory(nextHistory, attempt + 1);
      }

      if (!res.ok || !json?.reply) {
        throw new Error(json?.error ?? `Could not reach AI assistant (HTTP ${res.status}).`);
      }

      if (
        json.structuredData &&
        ((json.updatedKeys && json.updatedKeys.length > 0) || JSON.stringify(json.structuredData) !== JSON.stringify(data))
      ) {
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
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Generation stopped.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to send message.");
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || composerDisabled) return;

    setError(null);
    setQueueNotice(null);
    setFailedRetryPayload(null);
    const userTurn: ChatTurn = { id: `u-${crypto.randomUUID()}`, role: "user", content: text };
    const nextHistory = [...messages, userTurn];
    onMessagesChange(nextHistory);
    if (!overrideText) {
      setInput("");
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
        inputRef.current.style.overflowY = "hidden";
      }
    }
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
      <div className="border-b border-[#E2E2DC] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-[#F1F1EE]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#1D4ED8] text-white shrink-0">
            <ReportPenIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-[#141413] leading-tight">Report Assistant</h2>
            <p className="text-[11px] text-[#141413]/60 truncate">
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
            <Database className="size-3 text-[#1D4ED8]" />
            <span>MCP · Supabase</span>
          </Badge>
          <Badge
            variant="outline"
            title="Unlimited conversation history with automatic sliding context window."
          >
            {contextCount} msg{contextCount === 1 ? "" : "s"} · ∞
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
              <Undo2 className="size-3 text-[#1D4ED8]" />
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
              <Eraser className="size-3 text-[#1D4ED8]" />
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
        className="flex-1 min-h-[260px] max-h-[54dvh] overflow-y-auto px-3.5 sm:px-4 py-3.5 space-y-3 bg-[#F8F8F6]"
      >
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-[#141413] text-white rounded-br-xs whitespace-pre-wrap"
                  : "bg-white border border-[#E2E2DC] text-[#141413] rounded-bl-xs"
              }`}
            >
              {m.role === "assistant" ? <ChatMarkdown content={m.content} /> : m.content}
            </div>
            {m.role === "assistant" && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {m.toolActions?.map((act, idx) => (
                  <Badge key={idx} variant="success" className="font-medium">
                    <AnimatedCheckIcon className="size-3" />
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
                    <Database className="size-2.5 text-[#1D4ED8]" />
                    <span>{`MCP: ${toolName}`}</span>
                  </Badge>
                ))}
                {m.id !== "welcome" && m.id !== "welcome-existing" && m.id !== "cleared-chat" && (
                  <button
                    type="button"
                    onClick={() => void handleCopyReply(m.id, m.content)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#D8D8D0] bg-white px-2 py-0.5 text-[11px] font-medium text-[#141413]/70 hover:bg-[#F1F1EE] cursor-pointer"
                    title="Copy reply"
                  >
                    {copiedId === m.id ? <AnimatedCheckIcon className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    <span>{copiedId === m.id ? "Copied" : "Copy"}</span>
                  </button>
                )}
                {m.toolActions && m.toolActions.length > 0 && (
                  <button
                    type="button"
                    onClick={onOpenPreview}
                    className="lg:hidden inline-flex items-center gap-1 rounded-md bg-[#141413] px-2.5 py-0.5 text-[11px] font-medium text-white cursor-pointer"
                  >
                    <Eye className="size-3" />
                    <span>View Preview</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex items-start">
            <div className="inline-flex items-center gap-2 rounded-xl rounded-bl-xs border border-[#E2E2DC] bg-white px-3.5 py-2 text-xs">
              <Loader2 className="size-3.5 animate-spin text-[#1D4ED8]" />
              <AnimatedShinyText>{queueNotice ?? THINKING_PHRASES[thinkingIdx]}</AnimatedShinyText>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-3.5 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          {failedRetryPayload && (
            <Button type="button" size="sm" variant="destructive" onClick={() => void retryLastFailed()}>
              Retry
            </Button>
          )}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
        className="border-t border-[#E2E2DC] bg-white p-2.5 space-y-2"
      >
        {quickPrompts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.slice(0, 3).map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={composerDisabled}
                onClick={() => void sendMessage(item.prompt)}
                className="rounded-md border border-[#D8D8D0] bg-[#F8F8F6] px-2.5 py-1 text-[11px] font-medium text-[#141413] hover:border-[#C7D7FE] hover:bg-[#EFF4FF] hover:text-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/40 transition cursor-pointer disabled:opacity-50"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-lg border border-[#D8D8D0] bg-[#F8F8F6] px-2.5 py-1.5 focus-within:border-[#1D4ED8] focus-within:bg-white transition duration-150">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              const nextH = Math.min(el.scrollHeight, 120);
              el.style.height = `${nextH}px`;
              el.style.overflowY = el.scrollHeight > 120 ? "auto" : "hidden";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            disabled={composerDisabled}
            placeholder="Ask AI or paste weekly notes…"
            className="flex-1 bg-transparent py-1.5 text-base sm:text-sm leading-snug text-[#141413] placeholder:text-[#5C5C57]/75 outline-none resize-none overflow-hidden max-h-[120px] disabled:opacity-60"
          />

          <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenPreview}
              className="lg:hidden h-9 w-9 p-0 sm:h-8 sm:w-auto sm:px-2.5"
              title="View document preview"
              aria-label="View document preview"
            >
              <Eye className="size-3.5" />
            </Button>
            {sending ? (
              <Button type="button" size="sm" variant="destructive" onClick={handleStop} className="h-9 sm:h-8 px-3">
                <Square className="size-3 fill-current" />
                <span>Stop</span>
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                variant="accent"
                disabled={composerDisabled || !input.trim()}
                className="h-9 sm:h-8 px-3"
              >
                <AnimatedSendIcon className="size-3.5" />
                <span>Send</span>
              </Button>
            )}
          </div>
        </div>
      </form>
    </Card>
  );
}
