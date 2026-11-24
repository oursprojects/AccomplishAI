"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Check,
  Copy,
  Database,
  Eraser,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import type { QuotaStatus } from "@/lib/admin";
import { parseJsonResponse } from "@/lib/client-json";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "./ChatMarkdown";
import { VoiceRecorder } from "./VoiceRecorder";

interface GlobalChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolActions?: string[];
  mcpToolsUsed?: string[];
  createdReportId?: string;
  model?: string;
}

const THINKING_PHRASES = [
  "Thinking through your request...",
  "Checking AccomplishAI workspace via MCP...",
  "Synthesizing response, code, or chart...",
] as const;

const STARTER_PROMPTS = [
  "Chart my weekly & cumulative OJT hours",
  "Summarize all my weeks & remaining OJT hours",
  "Which weekly reports are still incomplete?",
  "Create my next weekly report",
  "Draft a polite email to my OJT supervisor",
  "Explain REST vs GraphQL with code examples",
] as const;

const INITIAL_WELCOME: GlobalChatTurn = {
  id: "global-welcome",
  role: "assistant",
  content:
    "Hi! I'm **Overall Accomplish AI** — your full **ChatGPT-style assistant** connected via **MCP · Supabase**.\n\n- **Ask anything like ChatGPT:** coding & debugging, SQL, writing, emails, math, translations, charts, or explanations.\n- **Manage your OJT workspace:** summarize all weeks, **render interactive charts**, create/edit reports, check hours, and update holiday weeks.",
};

interface GlobalAssistantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
  quota?: QuotaStatus;
}

export function GlobalAssistantDrawer({
  open,
  onOpenChange,
  userEmail,
  quota,
}: GlobalAssistantDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const storageKey = `accomplish-global-ai:${userEmail || "user"}`;

  const [messages, setMessages] = useState<GlobalChatTurn[]>([INITIAL_WELCOME]);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [wideMode, setWideMode] = useState(false);
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Restore session conversation cleanly across route transitions without synchronous render loops
  useEffect(() => {
    if (hydratedKey === storageKey) return;
    let restored: GlobalChatTurn[] | null = null;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as GlobalChatTurn[];
        if (Array.isArray(parsed) && parsed.length > 0) restored = parsed;
      }
    } catch {
      // Ignore storage errors
    }
    const id = window.requestAnimationFrame(() => {
      if (restored) setMessages(restored);
      setHydratedKey(storageKey);
    });
    return () => window.cancelAnimationFrame(id);
  }, [storageKey, hydratedKey]);

  useEffect(() => {
    if (hydratedKey !== storageKey) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-24)));
    } catch {
      // Ignore storage quota errors
    }
  }, [messages, storageKey, hydratedKey]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (!sending) return;
    const id = window.setInterval(() => {
      setThinkingIdx((prev) => (prev + 1) % THINKING_PHRASES.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, [sending]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  async function runChatTurn(historyToSend: GlobalChatTurn[], attempt = 0): Promise<void> {
    if (historyToSend.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setSending(true);

    try {
      const res = await fetch("/api/chat-global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          currentPath: pathname,
          messages: historyToSend.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const json = await parseJsonResponse<{
        reply?: string;
        toolActions?: string[];
        mcpToolsUsed?: string[];
        createdReportId?: string;
        mutated?: boolean;
        model?: string;
        retryAfterSeconds?: number;
        error?: string;
      }>(res);

      if (res.status === 429 && attempt < 1) {
        const waitSecs = Math.max(2, Math.min(8, Number(json?.retryAfterSeconds ?? 4)));
        await new Promise((r) => setTimeout(r, waitSecs * 1000));
        return runChatTurn(historyToSend, attempt + 1);
      }

      if (!res.ok || !json?.reply) {
        throw new Error(json?.error ?? `Could not reach Overall AI (HTTP ${res.status}).`);
      }

      const assistantTurn: GlobalChatTurn = {
        id: `a-${crypto.randomUUID()}`,
        role: "assistant",
        content: json.reply,
        toolActions: json.toolActions,
        mcpToolsUsed: json.mcpToolsUsed,
        createdReportId: json.createdReportId,
        model: json.model,
      };
      setMessages([...historyToSend, assistantTurn]);

      if (json.mutated || json.createdReportId) {
        router.refresh();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Generation stopped.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to send message.");
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setSending(false);
    }
  }

  async function submitPrompt(promptText: string) {
    const trimmed = promptText.trim();
    if (!trimmed || sending) return;

    const baseHistory: GlobalChatTurn[] = [
      ...messages,
      { id: `u-${crypto.randomUUID()}`, role: "user", content: trimmed },
    ];
    setMessages(baseHistory);
    setInput("");
    await runChatTurn(baseHistory);
  }

  async function handleRegenerate() {
    if (sending || messages.length < 2) return;
    const lastIdx = messages.length - 1;
    const baseHistory = messages[lastIdx]?.role === "assistant" ? messages.slice(0, lastIdx) : messages;
    if (!baseHistory.some((m) => m.role === "user")) return;
    setMessages(baseHistory);
    await runChatTurn(baseHistory);
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  async function handleCopy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((p) => (p === id ? null : p)), 1500);
    } catch {
      // Ignore clipboard failure
    }
  }

  if (!open) return null;

  const blocked = quota ? !quota.allowed : false;
  const lastAssistantIdx = messages.reduce((acc, m, idx) => (m.role === "assistant" && m.id !== "global-welcome" ? idx : acc), -1);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-[#1F1E1C]/35 backdrop-blur-[1px]"
        onClick={() => onOpenChange(false)}
      />
      <aside
        role="dialog"
        aria-label="Overall Accomplish AI Assistant"
        className={`relative z-10 flex h-full w-full flex-col border-l border-[#E6E2D8] bg-[#FAF9F5] shadow-2xl transition-[max-width] duration-200 ${
          wideMode ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[#E6E2D8] bg-white px-4 py-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D97757] text-white shadow-2xs shrink-0">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#1F1E1C] truncate">Overall Accomplish AI</h2>
                <Badge variant="outline" className="text-[10px] gap-1 shrink-0 hidden sm:inline-flex">
                  <Database className="h-2.5 w-2.5 text-[#D97757]" />
                  <span>ChatGPT + MCP</span>
                </Badge>
              </div>
              <p className="text-[11px] text-[#6B665E] truncate">
                General AI, interactive charts &amp; full Supabase workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setWideMode((v) => !v)}
              title={wideMode ? "Compact drawer view" : "Expand wide view"}
              aria-label={wideMode ? "Compact drawer view" : "Expand wide view"}
              className="hidden sm:inline-flex"
            >
              {wideMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            {messages.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={sending}
                onClick={() => {
                  setError(null);
                  setMessages([INITIAL_WELCOME]);
                }}
                title="New chat"
                aria-label="New chat"
              >
                <Eraser className="h-3.5 w-3.5 text-[#D97757]" />
                <span className="hidden sm:inline text-xs">New chat</span>
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              aria-label="Close Overall AI"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Starter suggestions when thread is fresh */}
        {messages.length === 1 && (
          <div className="border-b border-[#E6E2D8] bg-[#F7F6F0] px-4 py-2.5 space-y-1.5 shrink-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B665E]">
              Try Workspace, Charts, or General Prompts
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending || blocked}
                  onClick={() => void submitPrompt(q)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#DDD7CB] bg-white px-2.5 py-1 text-[11px] font-medium text-[#4A463F] hover:bg-[#FDF3EF] hover:border-[#D97757]/50 hover:text-[#9F4427] transition cursor-pointer disabled:opacity-50"
                >
                  {q.startsWith("Chart") && <BarChart3 className="h-3 w-3 text-[#D97757]" />}
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((m, mIdx) => (
            <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-2xs ${
                  m.role === "user"
                    ? "max-w-[85%] bg-[#1F1E1C] text-white rounded-br-sm whitespace-pre-wrap"
                    : "w-full max-w-[96%] bg-white border border-[#E6E2D8] text-[#1F1E1C] rounded-bl-sm"
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
                  {m.mcpToolsUsed?.map((tool) => (
                    <Badge key={tool} variant="outline" className="font-mono text-[10px] gap-1">
                      <Database className="h-2.5 w-2.5 text-[#D97757]" />
                      <span>{`MCP: ${tool}`}</span>
                    </Badge>
                  ))}
                  {m.createdReportId && (
                    <Link
                      href={`/reports/${m.createdReportId}`}
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center gap-1 rounded-full bg-[#D97757] px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-[#C86343] transition"
                    >
                      <span>Open Report</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  {m.id !== "global-welcome" && (
                    <button
                      type="button"
                      onClick={() => void handleCopy(m.id, m.content)}
                      className="inline-flex items-center gap-1 rounded-full border border-[#DDD7CB] bg-white px-2 py-0.5 text-[11px] font-medium text-[#57544E] hover:bg-[#F4F2EA] cursor-pointer"
                    >
                      {copiedId === m.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedId === m.id ? "Copied" : "Copy"}</span>
                    </button>
                  )}
                  {mIdx === lastAssistantIdx && !sending && (
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => void handleRegenerate()}
                      className="inline-flex items-center gap-1 rounded-full border border-[#DDD7CB] bg-white px-2 py-0.5 text-[11px] font-medium text-[#57544E] hover:bg-[#F4F2EA] cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Regenerate</span>
                    </button>
                  )}
                  {m.model && (
                    <span className="text-[10px] font-mono text-[#8A847A] px-1">{m.model}</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="flex items-start">
              <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm border border-[#E6E2D8] bg-white px-3.5 py-2 text-xs text-[#6B665E] animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D97757]" />
                <span>{THINKING_PHRASES[thinkingIdx]}</span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <span>{error}</span>
            {!sending && messages[messages.length - 1]?.role === "user" && (
              <button
                type="button"
                onClick={() => void runChatTurn(messages)}
                className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100 shrink-0 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitPrompt(input);
          }}
          className="border-t border-[#E6E2D8] bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0 space-y-2"
        >
          <div className="flex items-end gap-2 rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-2.5 py-1.5 focus-within:border-[#D97757] focus-within:bg-white transition">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitPrompt(input);
                }
              }}
              disabled={sending || blocked}
              placeholder={
                blocked
                  ? "Daily prompt limit reached."
                  : "Ask anything (charts, code, writing, OJT reports, hours, holidays)..."
              }
              className="flex-1 bg-transparent py-1 text-sm text-[#1F1E1C] placeholder:text-[#8A847A] outline-none resize-none max-h-36 disabled:opacity-60"
            />
            <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
              <VoiceRecorder
                compact
                disabled={sending || blocked}
                onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
              />
              {sending ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={handleStop}
                  className="h-8 px-3"
                >
                  <Square className="h-3 w-3 fill-current" />
                  <span>Stop</span>
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  variant="accent"
                  disabled={blocked || !input.trim()}
                  className="h-8 px-3"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Ask</span>
                </Button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-[#8A847A] px-1">
            Press <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift+Enter</kbd> for newline · Ask for a{" "}
            <span className="font-medium text-[#57544E]">bar, line, or pie chart</span> anytime
          </p>
        </form>
      </aside>
    </div>
  );
}
