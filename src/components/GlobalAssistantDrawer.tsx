"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Database,
  Eraser,
  ExternalLink,
  Loader2,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type { QuotaStatus } from "@/lib/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "./ChatMarkdown";

interface GlobalChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolActions?: string[];
  mcpToolsUsed?: string[];
  createdReportId?: string;
}

const THINKING_PHRASES = [
  "Querying your AccomplishAI workspace via MCP...",
  "Reading saved weekly reports & OJT hours...",
  "Checking internship schedule & profile defaults...",
] as const;

const STARTER_PROMPTS = [
  "Summarize all my weeks & remaining OJT hours",
  "Which weekly reports are still incomplete?",
  "Create my next weekly report",
  "Mark Dec 21 & Dec 28 as holiday break weeks",
] as const;

const INITIAL_WELCOME: GlobalChatTurn = {
  id: "global-welcome",
  role: "assistant",
  content:
    "Hi! I'm your **Overall Accomplish AI** connected via **MCP · Supabase**.\n\nI can read across **all your weekly reports, OJT hours, holiday calendar, profile defaults, and template status** — and I can also create new reports or mark holiday weeks right from here.",
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
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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

  async function submitPrompt(promptText: string, attempt = 0) {
    const trimmed = promptText.trim();
    if (!trimmed) return;

    const baseHistory =
      attempt === 0
        ? [...messages, { id: `u-${crypto.randomUUID()}`, role: "user" as const, content: trimmed }]
        : messages;

    if (attempt === 0) {
      setMessages(baseHistory);
      setInput("");
    }

    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/chat-global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPath: pathname,
          messages: baseHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const json = (await res.json()) as {
        reply?: string;
        toolActions?: string[];
        mcpToolsUsed?: string[];
        createdReportId?: string;
        mutated?: boolean;
        retryAfterSeconds?: number;
        error?: string;
      };

      if (res.status === 429 && attempt < 1) {
        const waitSecs = Math.max(2, Math.min(8, Number(json.retryAfterSeconds ?? 4)));
        await new Promise((r) => setTimeout(r, waitSecs * 1000));
        return submitPrompt(trimmed, attempt + 1);
      }

      if (!res.ok || !json.reply) {
        throw new Error(json.error ?? "Could not reach Overall AI.");
      }

      const assistantTurn: GlobalChatTurn = {
        id: `a-${crypto.randomUUID()}`,
        role: "assistant",
        content: json.reply,
        toolActions: json.toolActions,
        mcpToolsUsed: json.mcpToolsUsed,
        createdReportId: json.createdReportId,
      };
      setMessages([...baseHistory, assistantTurn]);

      if (json.mutated || json.createdReportId) {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-[#1F1E1C]/35 backdrop-blur-[1px]"
        onClick={() => onOpenChange(false)}
      />
      <aside
        role="dialog"
        aria-label="Overall Accomplish AI Assistant"
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[#E6E2D8] bg-[#FAF9F5] shadow-2xl"
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
                <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
                  <Database className="h-2.5 w-2.5 text-[#D97757]" />
                  <span>MCP · Supabase</span>
                </Badge>
              </div>
              <p className="text-[11px] text-[#6B665E] truncate">
                Knows all reports, OJT hours, profile, holidays &amp; template
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {messages.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={sending}
                onClick={() => setMessages([INITIAL_WELCOME])}
                title="Clear conversation"
              >
                <Eraser className="h-3.5 w-3.5 text-[#D97757]" />
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
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B665E]">Quick Workspace Prompts</p>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending || blocked}
                  onClick={() => void submitPrompt(q)}
                  className="rounded-lg border border-[#DDD7CB] bg-white px-2.5 py-1 text-[11px] font-medium text-[#4A463F] hover:bg-[#FDF3EF] hover:border-[#D97757]/50 hover:text-[#9F4427] transition cursor-pointer disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
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
          <div className="mx-4 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitPrompt(input);
          }}
          className="border-t border-[#E6E2D8] bg-white p-3 shrink-0"
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
                  : "Ask about all reports, hours, holidays, profile, or create a report..."
              }
              className="flex-1 bg-transparent py-1 text-sm text-[#1F1E1C] placeholder:text-[#8A847A] outline-none resize-none max-h-28 disabled:opacity-60"
            />
            <Button
              type="submit"
              size="sm"
              variant="accent"
              disabled={sending || blocked || !input.trim()}
              className="h-8 px-3 shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{sending ? "..." : "Ask"}</span>
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}
