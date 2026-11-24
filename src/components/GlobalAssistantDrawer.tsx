"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FileType2,
  GitBranch,
  History,
  Loader2,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Slash,
  Square,
  Trash2,
  TrendingUp,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  AnimatedCheckIcon,
  AnimatedRefreshIcon,
  AnimatedSendIcon,
} from "@/components/icons/AnimatedIcons";
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text";
import type { QuotaStatus } from "@/lib/admin";
import { exportChatFile } from "@/lib/chat-file-export";
import {
  ACCEPTED_CHAT_FILE_EXTENSIONS,
  formatFileSize,
  readChatAttachment,
  type AttachedChatFile,
} from "@/lib/chat-file-reader";
import { parseJsonResponse } from "@/lib/client-json";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "./ChatMarkdown";
import { VoiceRecorder } from "./VoiceRecorder";

interface ChatAttachmentMeta {
  name: string;
  sizeBytes: number;
}

interface GlobalChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachmentMeta[];
  toolActions?: string[];
  mcpToolsUsed?: string[];
  createdReportId?: string;
  model?: string;
}

interface SavedThread {
  id: string;
  title: string;
  updatedAt: string;
  messages: GlobalChatTurn[];
}

const THINKING_PHRASES = [
  "Thinking through your request...",
  "Checking AccomplishAI workspace via MCP...",
  "Synthesizing response, chart, diagram, or file...",
] as const;

const STARTER_PROMPTS = [
  "Analyze my OJT analytics & chart weekly + cumulative hours",
  "Export my OJT progress to Excel & PDF",
  "Create a Mermaid flowchart of my OJT workflow",
  "Search across all my reports for challenges & solutions",
  "Create my next weekly report",
  "Explain REST vs GraphQL with code examples",
] as const;

const SLASH_COMMANDS = [
  {
    cmd: "/analytics",
    label: "OJT Analytics & Forecast",
    desc: "Compute pace, projected finish date & progress chart",
    template: "Analyze my OJT analytics, projected completion date, and chart my weekly & cumulative hours.",
    Icon: TrendingUp,
  },
  {
    cmd: "/chart",
    label: "Interactive Chart",
    desc: "Generate a Bar, Line, or Pie chart",
    template: "Create an interactive bar/line chart of ",
    Icon: BarChart3,
  },
  {
    cmd: "/mermaid",
    label: "Mermaid Diagram",
    desc: "Flowchart, Sequence, ERD, Timeline, or Mindmap",
    template: "Create a Mermaid diagram for ",
    Icon: GitBranch,
  },
  {
    cmd: "/excel",
    label: "Excel Workbook (.xlsx)",
    desc: "Export tables or OJT hours into Excel",
    template: "Generate a downloadable Excel (.xlsx) workbook of ",
    Icon: FileSpreadsheet,
  },
  {
    cmd: "/pdf",
    label: "PDF Document (.pdf)",
    desc: "Generate a formatted PDF summary or report",
    template: "Generate a downloadable PDF report of ",
    Icon: FileType2,
  },
  {
    cmd: "/docx",
    label: "Word Document (.docx)",
    desc: "Generate a formatted .docx document or letter",
    template: "Generate a downloadable Word (.docx) document for ",
    Icon: FileText,
  },
  {
    cmd: "/search",
    label: "Search All Reports",
    desc: "Find keywords, trainings, or problems across weeks",
    template: "Search across all my saved weekly reports for ",
    Icon: Search,
  },
] as const;

const INITIAL_WELCOME: GlobalChatTurn = {
  id: "global-welcome",
  role: "assistant",
  content:
    "Hi! I'm **Overall Accomplish AI** — your full **ChatGPT-style assistant** connected via **MCP · Supabase**.\n\n- **Ask anything like ChatGPT:** coding, SQL, writing, emails, math, translations, **charts**, **Mermaid diagrams**, or **DOCX / PDF / Excel** exports.\n- **Analyze & manage your OJT workspace:** attach files (`.docx`, `.csv`, `.json`, `.txt`, code), type `/` for quick tools, forecast completion dates, and edit reports.",
};

function makeEmptyThread(): SavedThread {
  return {
    id: `thr-${crypto.randomUUID()}`,
    title: "New Chat",
    updatedAt: new Date().toISOString(),
    messages: [INITIAL_WELCOME],
  };
}

function stripForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " Code or chart omitted. ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const threadsStorageKey = `accomplish-global-threads:${userEmail || "user"}`;
  const legacySessionKey = `accomplish-global-ai:${userEmail || "user"}`;

  const [threads, setThreads] = useState<SavedThread[]>(() => [makeEmptyThread()]);
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<AttachedChatFile[]>([]);
  const [draggingFile, setDraggingFile] = useState(false);
  const [sending, setSending] = useState(false);
  const [wideMode, setWideMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? threads[0];
  const messages = useMemo(() => activeThread?.messages ?? [INITIAL_WELCOME], [activeThread]);

  function updateActiveMessages(updater: (prev: GlobalChatTurn[]) => GlobalChatTurn[], titleCandidate?: string) {
    setThreads((prevThreads) => {
      const targetId = activeThread?.id ?? prevThreads[0]?.id;
      return prevThreads.map((t) => {
        if (t.id !== targetId) return t;
        const nextMsgs = updater(t.messages);
        const nextTitle =
          t.title === "New Chat" && titleCandidate
            ? titleCandidate.trim().slice(0, 46) || "New Chat"
            : t.title;
        return {
          ...t,
          title: nextTitle,
          updatedAt: new Date().toISOString(),
          messages: nextMsgs.slice(-200),
        };
      });
    });
  }

  // Hydrate saved multi-thread history cleanly from localStorage (migrating legacy sessionStorage if present)
  useEffect(() => {
    if (hydratedKey === threadsStorageKey) return;
    let restored: SavedThread[] | null = null;
    try {
      const raw = window.localStorage.getItem(threadsStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedThread[];
        if (Array.isArray(parsed) && parsed.length > 0) restored = parsed;
      } else {
        const legacyRaw = window.sessionStorage.getItem(legacySessionKey);
        if (legacyRaw) {
          const legacyMsgs = JSON.parse(legacyRaw) as GlobalChatTurn[];
          if (Array.isArray(legacyMsgs) && legacyMsgs.length > 1) {
            const firstUser = legacyMsgs.find((m) => m.role === "user");
            restored = [
              {
                id: `thr-${crypto.randomUUID()}`,
                title: firstUser?.content.slice(0, 46) || "Previous Chat",
                updatedAt: new Date().toISOString(),
                messages: legacyMsgs,
              },
            ];
          }
        }
      }
    } catch {
      // Ignore storage errors
    }

    const id = window.requestAnimationFrame(() => {
      if (restored && restored.length > 0) {
        setThreads(restored);
        setActiveThreadId(restored[0].id);
      } else {
        setThreads((prev) => {
          setActiveThreadId(prev[0]?.id ?? "");
          return prev;
        });
      }
      setHydratedKey(threadsStorageKey);
    });
    return () => window.cancelAnimationFrame(id);
  }, [threadsStorageKey, legacySessionKey, hydratedKey]);

  useEffect(() => {
    if (hydratedKey !== threadsStorageKey) return;
    try {
      window.localStorage.setItem(threadsStorageKey, JSON.stringify(threads.slice(0, 20)));
    } catch {
      // Ignore storage quota errors
    }
  }, [threads, threadsStorageKey, hydratedKey]);

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
      if (e.key === "Escape") {
        if (exportMenuOpen) setExportMenuOpen(false);
        else if (historyOpen) setHistoryOpen(false);
        else onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange, exportMenuOpen, historyOpen]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  async function runChatTurn(
    historyToSend: GlobalChatTurn[],
    attachedFiles: AttachedChatFile[] = [],
    attempt = 0,
  ): Promise<void> {
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
          messages: historyToSend.slice(-24).map((m) => ({ role: m.role, content: m.content })),
          attachments: attachedFiles.map((a) => ({ name: a.name, textContent: a.textContent })),
        }),
      });
      const json = await parseJsonResponse<{
        reply?: string;
        toolActions?: string[];
        mcpToolsUsed?: string[];
        createdReportId?: string;
        updatedReport?: { id: string; structuredData: Record<string, string> };
        mutated?: boolean;
        model?: string;
        retryAfterSeconds?: number;
        error?: string;
      }>(res);

      if (res.status === 429 && attempt < 1) {
        const waitSecs = Math.max(2, Math.min(8, Number(json?.retryAfterSeconds ?? 4)));
        await new Promise((r) => setTimeout(r, waitSecs * 1000));
        return runChatTurn(historyToSend, attachedFiles, attempt + 1);
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
      updateActiveMessages(() => [...historyToSend, assistantTurn]);

      if (json.updatedReport) {
        window.dispatchEvent(new CustomEvent("accomplish:report-updated", { detail: json.updatedReport }));
      }
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
    if ((!trimmed && attachments.length === 0) || sending) return;

    const finalText = trimmed || `Please analyze the attached file${attachments.length > 1 ? "s" : ""}.`;
    const attachedNow = [...attachments];
    const userTurn: GlobalChatTurn = {
      id: `u-${crypto.randomUUID()}`,
      role: "user",
      content: finalText,
      ...(attachedNow.length > 0
        ? { attachments: attachedNow.map((a) => ({ name: a.name, sizeBytes: a.sizeBytes })) }
        : {}),
    };

    const baseHistory = [...messages, userTurn];
    updateActiveMessages(() => baseHistory, finalText);
    setInput("");
    setAttachments([]);
    await runChatTurn(baseHistory, attachedNow);
  }

  async function handleSaveEdit(msgId: string) {
    const trimmed = editingText.trim();
    if (!trimmed || sending) return;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;

    const truncated = messages.slice(0, idx + 1).map((m, i) => (i === idx ? { ...m, content: trimmed } : m));
    setEditingId(null);
    setEditingText("");
    updateActiveMessages(() => truncated, idx <= 1 ? trimmed : undefined);
    await runChatTurn(truncated);
  }

  async function handleRegenerate() {
    if (sending || messages.length < 2) return;
    const lastIdx = messages.length - 1;
    const baseHistory = messages[lastIdx]?.role === "assistant" ? messages.slice(0, lastIdx) : messages;
    if (!baseHistory.some((m) => m.role === "user")) return;
    updateActiveMessages(() => baseHistory);
    await runChatTurn(baseHistory);
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleNewChat() {
    if (sending) return;
    const fresh = makeEmptyThread();
    setThreads((prev) => [fresh, ...prev].slice(0, 20));
    setActiveThreadId(fresh.id);
    setHistoryOpen(false);
    setError(null);
    setEditingId(null);
    setAttachments([]);
  }

  function handleDeleteThread(id: string) {
    if (sending) return;
    setThreads((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (remaining.length === 0) {
        const fresh = makeEmptyThread();
        setActiveThreadId(fresh.id);
        return [fresh];
      }
      if (id === activeThread?.id) {
        setActiveThreadId(remaining[0].id);
      }
      return remaining;
    });
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const slots = Math.max(0, 3 - attachments.length);
    if (slots === 0) {
      setError("Maximum 3 file attachments per message.");
      return;
    }

    const added: AttachedChatFile[] = [];
    for (const file of Array.from(files).slice(0, slots)) {
      try {
        added.push(await readChatAttachment(file));
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not attach ${file.name}.`);
      }
    }
    if (added.length > 0) {
      setAttachments((prev) => [...prev, ...added].slice(0, 3));
    }
  }

  async function handleExportThread(fmt: "docx" | "pdf" | "md") {
    setExportMenuOpen(false);
    const title = activeThread?.title && activeThread.title !== "New Chat" ? activeThread.title : "Overall AI Chat";
    const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "accomplish-chat";
    const turns = messages.filter((m) => m.id !== "global-welcome");

    if (fmt === "md") {
      const mdText = [
        `# ${title}`,
        `_Exported from AccomplishAI on ${new Date().toLocaleString()}_`,
        "",
        ...turns.map((m) => `### ${m.role === "user" ? "You" : "Overall Accomplish AI"}\n\n${m.content}`),
      ].join("\n\n");
      const blob = new Blob([mdText], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.md`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    await exportChatFile(
      {
        format: fmt,
        filename,
        title,
        subtitle: `Exported from Overall Accomplish AI · ${new Date().toLocaleDateString()}`,
        sections: turns.map((m) => ({
          heading: m.role === "user" ? "You" : "Overall Accomplish AI",
          paragraphs: m.content.split(/\n{2,}/).filter(Boolean),
        })),
        sheets: [],
      },
      fmt,
    );
  }

  function toggleSpeak(id: string, content: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("Text-to-speech is not supported in this browser.");
      return;
    }
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const clean = stripForSpeech(content);
    if (!clean) return;
    const utt = new SpeechSynthesisUtterance(clean);
    utt.onend = () => setSpeakingId((cur) => (cur === id ? null : cur));
    utt.onerror = () => setSpeakingId((cur) => (cur === id ? null : cur));
    setSpeakingId(id);
    window.speechSynthesis.speak(utt);
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
  const lastAssistantIdx = messages.reduce(
    (acc, m, idx) => (m.role === "assistant" && m.id !== "global-welcome" ? idx : acc),
    -1,
  );
  const slashQuery = input.startsWith("/") && !input.includes("\n") ? input.toLowerCase() : null;
  const filteredCommands =
    slashQuery !== null
      ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(slashQuery) || c.label.toLowerCase().includes(slashQuery.slice(1)))
      : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-[#141413]/40"
        onClick={() => onOpenChange(false)}
      />
      <aside
        role="dialog"
        aria-label="Overall Accomplish AI Assistant"
        onDragOver={(e) => {
          e.preventDefault();
          setDraggingFile(true);
        }}
        onDragLeave={() => setDraggingFile(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDraggingFile(false);
          void handleFilesSelected(e.dataTransfer.files);
        }}
        className={`relative z-10 flex h-full w-full flex-col border-l border-[#E2E2DC] bg-[#F8F8F6] shadow-2xl transition-[max-width] duration-150 ${
          wideMode ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        {/* Drag overlay */}
        {draggingFile && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[#1D4ED8]/10 border-2 border-dashed border-[#1D4ED8] m-2 rounded-xl">
            <div className="rounded-lg bg-white border border-[#E2E2DC] px-4 py-2.5 text-xs font-medium text-[#141413] shadow-md">
              Drop .docx, .csv, .json, .txt, or code file to attach
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[#E2E2DC] bg-white px-4 py-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex size-9 items-center justify-center rounded-lg bg-[#1D4ED8] text-white shrink-0">
              <MessageSquareText className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium text-[#141413] truncate">Overall Accomplish AI</h2>
                <Badge variant="outline" className="text-[10px] gap-1 shrink-0 hidden sm:inline-flex">
                  <Database className="size-2.5 text-[#1D4ED8]" />
                  <span>MCP</span>
                </Badge>
              </div>
              <p className="text-[11px] text-[#141413]/55 truncate">
                Charts, Mermaid, DOCX/PDF/Excel &amp; Supabase tools
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 relative">
            <Button
              type="button"
              size="sm"
              variant={historyOpen ? "accent" : "outline"}
              onClick={() => {
                setExportMenuOpen(false);
                setHistoryOpen((v) => !v);
              }}
              title="Saved chat history"
            >
              <History className="size-3.5" />
              <span className="hidden sm:inline text-xs tabular-nums">{threads.length}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={sending}
              onClick={handleNewChat}
              title="Start new chat thread"
            >
              <Plus className="size-3.5 text-[#1D4ED8]" />
              <span className="hidden sm:inline text-xs">New</span>
            </Button>

            {messages.length > 1 && (
              <div className="relative">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setHistoryOpen(false);
                    setExportMenuOpen((v) => !v);
                  }}
                  title="Export conversation"
                  aria-label="Export conversation"
                >
                  <Download className="size-4" />
                </Button>
                {exportMenuOpen && (
                  <div className="absolute right-0 top-10 z-30 w-44 rounded-lg border border-[#E2E2DC] bg-white p-1 shadow-lg text-xs">
                    <button
                      type="button"
                      onClick={() => void handleExportThread("pdf")}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-[#F1F1EE] cursor-pointer"
                    >
                      <FileType2 className="size-3.5 text-red-600" />
                      <span>Export PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportThread("docx")}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-[#F1F1EE] cursor-pointer"
                    >
                      <FileText className="size-3.5 text-[#1D4ED8]" />
                      <span>Export Word (.docx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportThread("md")}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-[#F1F1EE] cursor-pointer"
                    >
                      <FileText className="size-3.5 text-[#141413]/65" />
                      <span>Export Markdown</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setWideMode((v) => !v)}
              title={wideMode ? "Compact drawer view" : "Expand wide view"}
              aria-label={wideMode ? "Compact drawer view" : "Expand wide view"}
              className="hidden sm:inline-flex"
            >
              {wideMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              aria-label="Close Overall AI"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Saved Threads Switcher Panel */}
        {historyOpen && (
          <div className="border-b border-[#E2E2DC] bg-[#F1F1EE] px-4 py-2.5 space-y-2 max-h-56 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#141413]/65">
                Saved Conversations ({threads.length})
              </span>
              <button
                type="button"
                onClick={handleNewChat}
                className="text-[11px] font-medium text-[#1D4ED8] hover:underline cursor-pointer"
              >
                + New Chat
              </button>
            </div>
            <div className="space-y-1">
              {threads.map((t) => {
                const isActive = t.id === activeThread?.id;
                return (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                      isActive ? "border-[#1D4ED8] bg-white" : "border-[#E2E2DC] bg-white/80 hover:bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveThreadId(t.id);
                        setHistoryOpen(false);
                        setError(null);
                      }}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <span className="block font-medium text-[#141413] truncate">{t.title}</span>
                      <span className="block text-[10px] text-[#141413]/45 tabular-nums">
                        {t.messages.length - 1} msg{t.messages.length - 1 === 1 ? "" : "s"} ·{" "}
                        {new Date(t.updatedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => handleDeleteThread(t.id)}
                      title="Delete conversation"
                      aria-label="Delete conversation"
                      className="rounded-md p-1 text-[#141413]/45 hover:bg-red-50 hover:text-red-600 cursor-pointer disabled:opacity-40"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Starter suggestions when thread is fresh */}
        {messages.length === 1 && (
          <div className="border-b border-[#E2E2DC] bg-[#F1F1EE]/70 px-4 py-2.5 space-y-1.5 shrink-0">
            <p className="text-[11px] font-medium text-[#141413]/60">
              Suggested prompts
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending || blocked}
                  onClick={() => void submitPrompt(q)}
                  className="inline-flex items-center gap-1 rounded-md border border-[#D8D8D0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#141413]/80 hover:bg-[#EFF4FF] hover:border-[#C7D7FE] hover:text-[#1D4ED8] transition duration-150 cursor-pointer disabled:opacity-50"
                >
                  {q.includes("chart") && <BarChart3 className="size-3 text-[#1D4ED8]" />}
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((m, mIdx) => (
            <div key={m.id} className={`group flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              {m.role === "user" && editingId === m.id ? (
                <div className="w-full max-w-[90%] rounded-xl border border-[#1D4ED8] bg-white p-2.5 space-y-2">
                  <textarea
                    rows={3}
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    className="w-full bg-[#F8F8F6] rounded-lg border border-[#D8D8D0] p-2 text-sm text-[#141413] outline-none focus:border-[#1D4ED8]"
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="accent"
                      disabled={sending || !editingText.trim()}
                      onClick={() => void handleSaveEdit(m.id)}
                    >
                      Save &amp; Resend
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "max-w-[85%] bg-[#141413] text-white rounded-br-xs whitespace-pre-wrap"
                      : "w-full max-w-[96%] bg-white border border-[#E2E2DC] text-[#141413] rounded-bl-xs"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <ChatMarkdown content={m.content} />
                  ) : (
                    <>
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="mb-1.5 flex flex-wrap gap-1">
                          {m.attachments.map((att, aIdx) => (
                            <span
                              key={aIdx}
                              className="inline-flex items-center gap-1 rounded bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/95"
                            >
                              <Paperclip className="size-2.5" />
                              <span>{att.name}</span>
                              <span className="opacity-70">({formatFileSize(att.sizeBytes)})</span>
                            </span>
                          ))}
                        </div>
                      )}
                      <div>{m.content}</div>
                    </>
                  )}
                </div>
              )}

              {m.role === "user" && editingId !== m.id && !sending && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(m.id);
                    setEditingText(m.content);
                  }}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-[#141413]/45 hover:text-[#141413] opacity-75 sm:opacity-0 sm:group-hover:opacity-100 transition cursor-pointer"
                >
                  <Pencil className="size-2.5" />
                  <span>Edit</span>
                </button>
              )}

              {m.role === "assistant" && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {m.toolActions?.map((act, idx) => (
                    <Badge key={idx} variant="success" className="font-medium">
                      <AnimatedCheckIcon className="size-3" />
                      {act}
                    </Badge>
                  ))}
                  {m.mcpToolsUsed?.map((tool) => (
                    <Badge key={tool} variant="outline" className="font-mono text-[10px] gap-1">
                      <Database className="size-2.5 text-[#1D4ED8]" />
                      <span>{`MCP: ${tool}`}</span>
                    </Badge>
                  ))}
                  {m.createdReportId && (
                    <Link
                      href={`/reports/${m.createdReportId}`}
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center gap-1 rounded-md bg-[#1D4ED8] px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-[#1E40AF] transition"
                    >
                      <span>Open Report</span>
                      <ExternalLink className="size-3" />
                    </Link>
                  )}
                  {m.id !== "global-welcome" && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleCopy(m.id, m.content)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#D8D8D0] bg-white px-2 py-0.5 text-[11px] font-medium text-[#141413]/70 hover:bg-[#F1F1EE] cursor-pointer"
                      >
                        {copiedId === m.id ? (
                          <AnimatedCheckIcon className="size-3 text-emerald-600" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        <span>{copiedId === m.id ? "Copied" : "Copy"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSpeak(m.id, m.content)}
                        title={speakingId === m.id ? "Stop reading aloud" : "Read aloud"}
                        className="inline-flex items-center gap-1 rounded-md border border-[#D8D8D0] bg-white px-2 py-0.5 text-[11px] font-medium text-[#141413]/70 hover:bg-[#F1F1EE] cursor-pointer"
                      >
                        {speakingId === m.id ? (
                          <VolumeX className="size-3 text-[#1D4ED8]" />
                        ) : (
                          <Volume2 className="size-3" />
                        )}
                        <span>{speakingId === m.id ? "Stop" : "Listen"}</span>
                      </button>
                    </>
                  )}
                  {mIdx === lastAssistantIdx && !sending && (
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => void handleRegenerate()}
                      className="inline-flex items-center gap-1 rounded-md border border-[#D8D8D0] bg-white px-2 py-0.5 text-[11px] font-medium text-[#141413]/70 hover:bg-[#F1F1EE] cursor-pointer disabled:opacity-50"
                    >
                      <AnimatedRefreshIcon className="size-3" />
                      <span>Regenerate</span>
                    </button>
                  )}
                  {m.model && <span className="text-[10px] font-mono text-[#141413]/45 px-1">{m.model}</span>}
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="flex items-start">
              <div className="inline-flex items-center gap-2 rounded-xl rounded-bl-xs border border-[#E2E2DC] bg-white px-3.5 py-2 text-xs text-[#141413]/65">
                <Loader2 className="size-3.5 animate-spin text-[#1D4ED8]" />
                <AnimatedShinyText className="text-xs font-medium">{THINKING_PHRASES[thinkingIdx]}</AnimatedShinyText>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <span>{error}</span>
            {!sending && messages[messages.length - 1]?.role === "user" && (
              <button
                type="button"
                onClick={() => void runChatTurn(messages)}
                className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100 shrink-0 cursor-pointer"
              >
                <AnimatedRefreshIcon className="size-3" />
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
          className="relative border-t border-[#E2E2DC] bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0 space-y-2"
        >
          {/* Slash command popover */}
          {filteredCommands.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-2 z-20 rounded-xl border border-[#E2E2DC] bg-white p-1.5 shadow-xl max-h-60 overflow-y-auto">
              <p className="px-2.5 py-1 text-[10px] font-medium text-[#141413]/50">
                Quick Commands
              </p>
              {filteredCommands.map((item) => {
                const Icon = item.Icon;
                return (
                  <button
                    key={item.cmd}
                    type="button"
                    onClick={() => {
                      setInput(item.template);
                      textareaRef.current?.focus();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-[#EFF4FF] transition cursor-pointer"
                  >
                    <span className="flex size-7 items-center justify-center rounded-md bg-[#F8F8F6] border border-[#E2E2DC] text-[#1D4ED8] shrink-0">
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-medium text-[#141413]">{item.cmd}</span>
                        <span className="text-xs font-medium text-[#141413]/75 truncate">{item.label}</span>
                      </div>
                      <p className="text-[11px] text-[#141413]/50 truncate">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Staged Attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((att) => (
                <span
                  key={att.id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#D8D8D0] bg-[#F8F8F6] px-2.5 py-1 text-[11px] font-medium text-[#141413]"
                >
                  <Paperclip className="size-3 text-[#1D4ED8]" />
                  <span className="max-w-36 truncate">{att.name}</span>
                  <span className="text-[10px] text-[#141413]/45 tabular-nums">{formatFileSize(att.sizeBytes)}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                    aria-label={`Remove ${att.name}`}
                    className="rounded p-0.5 text-[#141413]/45 hover:bg-[#E7E7E2] hover:text-[#141413] cursor-pointer"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_CHAT_FILE_EXTENSIONS}
            className="hidden"
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />

          <div className="flex items-end gap-2 rounded-lg border border-[#D8D8D0] bg-[#F8F8F6] px-2.5 py-1.5 focus-within:border-[#1D4ED8] focus-within:bg-white transition duration-150">
            <textarea
              ref={textareaRef}
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
                  : "Ask anything, type / for commands, or drop .docx/.csv/.txt…"
              }
              className="flex-1 bg-transparent py-1 text-sm text-[#141413] placeholder:text-[#141413]/35 outline-none resize-none max-h-36 disabled:opacity-60"
            />
            <div className="flex items-center gap-1 shrink-0 pb-0.5">
              <button
                type="button"
                disabled={sending || blocked || attachments.length >= 3}
                onClick={() => fileInputRef.current?.click()}
                title="Attach .docx, .csv, .json, .txt, or code file"
                aria-label="Attach file"
                className="inline-flex size-8 items-center justify-center rounded-md border border-[#D8D8D0] bg-white text-[#141413]/70 hover:bg-[#F1F1EE] hover:text-[#141413] transition cursor-pointer disabled:opacity-50"
              >
                <Paperclip className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={sending || blocked}
                onClick={() => {
                  setInput((prev) => (prev.startsWith("/") ? "" : "/"));
                  textareaRef.current?.focus();
                }}
                title="Slash commands (/chart, /mermaid, /excel, /pdf, /docx)"
                aria-label="Slash commands"
                className="inline-flex size-8 items-center justify-center rounded-md border border-[#D8D8D0] bg-white text-[#141413]/70 hover:bg-[#F1F1EE] hover:text-[#141413] transition cursor-pointer disabled:opacity-50"
              >
                <Slash className="size-3.5" />
              </button>
              <VoiceRecorder
                compact
                disabled={sending || blocked}
                onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
              />
              {sending ? (
                <Button type="button" size="sm" variant="destructive" onClick={handleStop} className="h-8 px-3">
                  <Square className="size-3 fill-current" />
                  <span>Stop</span>
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  variant="accent"
                  disabled={blocked || (!input.trim() && attachments.length === 0)}
                  className="h-8 px-3"
                >
                  <AnimatedSendIcon className="size-3.5" />
                  <span>Ask</span>
                </Button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-[#141413]/50 px-1">
            Type <kbd className="font-mono">/</kbd> for shortcuts · Drop{" "}
            <span className="font-medium text-[#141413]/75">.docx, .csv, .json, .txt</span> · Ask for{" "}
            <span className="font-medium text-[#141413]/75">charts, Mermaid, DOCX, PDF, Excel</span>
          </p>
        </form>
      </aside>
    </div>
  );
}
