"use client";

import { useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  FileStack,
  Gauge,
  Mic,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  ALLOWED_STT_MODELS,
  ALLOWED_TEXT_MODELS,
  type AdminMember,
  type AiRuntimeSettings,
  type AllowedSttModel,
  type AllowedTextModel,
  type ApiUsageMonitor,
} from "@/lib/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface PoolSnapshot {
  inFlight: number;
  queued: number;
  models: Array<{
    model: string;
    callsLastMinute: number;
    cooldownRemainingSeconds: number;
  }>;
}

interface AdminClientProps {
  initialAiSettings: AiRuntimeSettings;
  initialMembers: AdminMember[];
  initialUsageMonitor: ApiUsageMonitor;
  initialPoolStatus: PoolSnapshot;
}

const ENDPOINT_LABELS: Record<string, string> = {
  chat_report: "Report Chat (LLM + Tools)",
  generate_report: "Quick Fill / Generate",
  transcribe: "Voice Transcription (STT)",
};

export function AdminClient({
  initialAiSettings,
  initialMembers,
  initialUsageMonitor,
  initialPoolStatus,
}: AdminClientProps) {
  const [aiSettings, setAiSettings] = useState<AiRuntimeSettings>(initialAiSettings);
  const [usageMonitor, setUsageMonitor] = useState<ApiUsageMonitor>(initialUsageMonitor);
  const [poolStatus, setPoolStatus] = useState<PoolSnapshot>(initialPoolStatus);
  const [defaultLimit, setDefaultLimit] = useState(initialAiSettings.defaultDailyLimit);
  const [defaultMaxReports, setDefaultMaxReports] = useState(
    initialAiSettings.defaultMaxReports === null ? "" : String(initialAiSettings.defaultMaxReports),
  );
  const [activeTextModel, setActiveTextModel] = useState<AllowedTextModel>(initialAiSettings.activeTextModel);
  const [activeSttModel, setActiveSttModel] = useState<AllowedSttModel>(initialAiSettings.activeSttModel);
  const [maxBulletsPerDay, setMaxBulletsPerDay] = useState(initialAiSettings.maxBulletsPerDay);
  const [maxChatMessages, setMaxChatMessages] = useState(initialAiSettings.maxChatMessages);
  const [globalRpmLimit, setGlobalRpmLimit] = useState(initialAiSettings.globalRpmLimit);

  const [members, setMembers] = useState<AdminMember[]>(initialMembers);
  const [draftLimits, setDraftLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialMembers.map((m) => [m.userId, m.customDailyLimit === null ? "" : String(m.customDailyLimit)])),
  );
  const [draftMaxReports, setDraftMaxReports] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialMembers.map((m) => [m.userId, m.customMaxReports === null ? "" : String(m.customMaxReports)])),
  );

  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newLimit, setNewLimit] = useState("");
  const [newMaxReports, setNewMaxReports] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function syncResponse(json: {
    aiSettings: AiRuntimeSettings;
    members: AdminMember[];
    usageMonitor?: ApiUsageMonitor;
    poolStatus?: PoolSnapshot;
  }) {
    setAiSettings(json.aiSettings);
    if (json.usageMonitor) setUsageMonitor(json.usageMonitor);
    if (json.poolStatus) setPoolStatus(json.poolStatus);
    setDefaultLimit(json.aiSettings.defaultDailyLimit);
    setDefaultMaxReports(
      json.aiSettings.defaultMaxReports === null ? "" : String(json.aiSettings.defaultMaxReports),
    );
    setActiveTextModel(json.aiSettings.activeTextModel);
    setActiveSttModel(json.aiSettings.activeSttModel);
    setMaxBulletsPerDay(json.aiSettings.maxBulletsPerDay);
    setMaxChatMessages(json.aiSettings.maxChatMessages);
    setGlobalRpmLimit(json.aiSettings.globalRpmLimit);
    setMembers(json.members);
    setDraftLimits(
      Object.fromEntries(json.members.map((m) => [m.userId, m.customDailyLimit === null ? "" : String(m.customDailyLimit)])),
    );
    setDraftMaxReports(
      Object.fromEntries(json.members.map((m) => [m.userId, m.customMaxReports === null ? "" : String(m.customMaxReports)])),
    );
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          password: newPassword,
          customDailyLimit: newLimit.trim() === "" ? null : Number(newLimit),
          customMaxReports: newMaxReports.trim() === "" ? null : Number(newMaxReports),
        }),
      });
      const json = (await res.json()) as {
        aiSettings?: AiRuntimeSettings;
        members?: AdminMember[];
        usageMonitor?: ApiUsageMonitor;
        needsConfirmWarning?: boolean;
        error?: string;
      };
      if (!res.ok || !json.members || !json.aiSettings) {
        throw new Error(json.error ?? "Failed to create intern account.");
      }
      syncResponse({
        aiSettings: json.aiSettings,
        members: json.members,
        usageMonitor: json.usageMonitor,
      });
      setNotice(
        json.needsConfirmWarning
          ? `Account created for ${newEmail.trim()}. Note: disable 'Confirm email' in Supabase Auth -> Providers -> Email so they can sign in right away.`
          : `Intern account created for ${newEmail.trim()}.`,
      );
      setNewEmail("");
      setNewPassword("");
      setShowNewPassword(false);
      setNewLimit("");
      setNewMaxReports("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveDefault(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSavingDefault(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_default_limit",
          defaultDailyLimit: defaultLimit,
          defaultMaxReports: defaultMaxReports.trim() === "" ? null : Number(defaultMaxReports),
        }),
      });
      const json = (await res.json()) as {
        aiSettings?: AiRuntimeSettings;
        members?: AdminMember[];
        usageMonitor?: ApiUsageMonitor;
        error?: string;
      };
      if (!res.ok || !json.members || !json.aiSettings) {
        throw new Error(json.error ?? "Failed to update default limits.");
      }
      syncResponse({
        aiSettings: json.aiSettings,
        members: json.members,
        usageMonitor: json.usageMonitor,
      });
      setNotice(
        `Saved defaults: ${json.aiSettings.defaultDailyLimit} prompts/day · ${
          json.aiSettings.defaultMaxReports === null
            ? "Unlimited reports"
            : `${json.aiSettings.defaultMaxReports} max saved reports`
        }.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save default limits.");
    } finally {
      setSavingDefault(false);
    }
  }

  async function handleSaveAiControls(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSavingAi(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_ai_settings",
          activeTextModel,
          activeSttModel,
          maxBulletsPerDay,
          maxChatMessages,
          globalRpmLimit,
        }),
      });
      const json = (await res.json()) as {
        aiSettings?: AiRuntimeSettings;
        members?: AdminMember[];
        usageMonitor?: ApiUsageMonitor;
        poolStatus?: PoolSnapshot;
        error?: string;
      };
      if (!res.ok || !json.members || !json.aiSettings) {
        throw new Error(json.error ?? "Failed to save AI controls.");
      }
      syncResponse({
        aiSettings: json.aiSettings,
        members: json.members,
        usageMonitor: json.usageMonitor,
        poolStatus: json.poolStatus,
      });
      setNotice(`AI settings updated: ${json.aiSettings.activeTextModel} & ${json.aiSettings.activeSttModel}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update AI controls.");
    } finally {
      setSavingAi(false);
    }
  }

  async function handleSaveMember(member: AdminMember, nextBlocked = member.isBlocked) {
    setError(null);
    setNotice(null);
    setBusyId(member.userId);
    try {
      const rawPrompt = (draftLimits[member.userId] ?? "").trim();
      const customDailyLimit = rawPrompt === "" ? null : Number(rawPrompt);
      const rawReports = (draftMaxReports[member.userId] ?? "").trim();
      const customMaxReports = rawReports === "" ? null : Number(rawReports);

      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_member",
          userId: member.userId,
          customDailyLimit,
          customMaxReports,
          isBlocked: nextBlocked,
        }),
      });
      const json = (await res.json()) as {
        aiSettings?: AiRuntimeSettings;
        members?: AdminMember[];
        usageMonitor?: ApiUsageMonitor;
        error?: string;
      };
      if (!res.ok || !json.members || !json.aiSettings) {
        throw new Error(json.error ?? "Failed to update member.");
      }
      syncResponse({
        aiSettings: json.aiSettings,
        members: json.members,
        usageMonitor: json.usageMonitor,
      });
      setNotice(`Updated limits for ${member.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetToday(member: AdminMember) {
    setError(null);
    setNotice(null);
    setBusyId(member.userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_today", userId: member.userId }),
      });
      const json = (await res.json()) as {
        aiSettings?: AiRuntimeSettings;
        members?: AdminMember[];
        usageMonitor?: ApiUsageMonitor;
        error?: string;
      };
      if (!res.ok || !json.members || !json.aiSettings) {
        throw new Error(json.error ?? "Failed to reset today's count.");
      }
      syncResponse({
        aiSettings: json.aiSettings,
        members: json.members,
        usageMonitor: json.usageMonitor,
      });
      setNotice(`Reset today's prompt usage for ${member.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setBusyId(null);
    }
  }

  const totalReports = members.reduce((acc, m) => acc + m.reportsCount, 0);
  const totalInterns = members.filter((m) => !m.isAdmin).length;
  const maxDayCount = Math.max(1, ...usageMonitor.dailySeries.map((d) => d.count));
  const rpdPct = Math.min(100, Math.round((usageMonitor.requestsToday / 1000) * 100));
  const rpmPct = Math.min(100, Math.round((usageMonitor.requestsLastMinute / 30) * 100));

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Badge variant="accent">
            <ShieldCheck className="w-3.5 h-3.5" />
            Admin Console
          </Badge>
          <h1 className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#1F1E1C]">
            Interns, AI Controls &amp; API Usage Monitor
          </h1>
          <p className="text-sm text-[#6B665E]">
            Monitor live Groq API utilization, enforce per-user prompt &amp; report limits, and manage intern logins.
          </p>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B665E]">
            <span>Registered Interns</span>
            <Users className="w-4 h-4 text-[#D97757]" />
          </div>
          <p className="mt-1 text-2xl font-bold text-[#1F1E1C]">{totalInterns}</p>
          <p className="text-[11px] text-[#7A746B] mt-0.5">{totalReports} total saved reports</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B665E]">
            <span>API Calls Today (Manila)</span>
            <Activity className="w-4 h-4 text-[#D97757]" />
          </div>
          <p className="mt-1 text-2xl font-bold text-[#1F1E1C]">
            {usageMonitor.requestsToday} <span className="text-xs font-normal text-[#7A746B]">/ 1,000 RPD</span>
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#EFECE3] overflow-hidden">
            <div className="h-full bg-[#D97757] rounded-full transition-all" style={{ width: `${rpdPct}%` }} />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B665E]">
            <span>Burst Rate (Last 60s)</span>
            <Gauge className="w-4 h-4 text-[#D97757]" />
          </div>
          <p className="mt-1 text-2xl font-bold text-[#1F1E1C]">
            {usageMonitor.requestsLastMinute} <span className="text-xs font-normal text-[#7A746B]">/ 30 RPM</span>
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#EFECE3] overflow-hidden">
            <div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${rpmPct}%` }} />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B665E]">
            <span>Active Groq Models</span>
            <Cpu className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="mt-1 text-xs font-mono font-semibold text-emerald-700 truncate">{aiSettings.activeTextModel}</p>
          <p className="text-[11px] font-mono text-[#6B665E] truncate mt-0.5">STT: {aiSettings.activeSttModel}</p>
          <p className="text-[11px] text-[#7A746B] mt-1">{usageMonitor.requestsLast7Days} calls last 7 days</p>
        </Card>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* API Usage Monitor */}
      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#1F1E1C] flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#D97757]" />
              <span>API Usage &amp; Security Monitor</span>
            </h2>
            <p className="text-xs text-[#6B665E]">
              Protected by per-user 8 RPM burst guard, {aiSettings.globalRpmLimit} shared RPM cap, and multi-model load balancing (~90 RPM pooled).
            </p>
          </div>
          <Badge variant="success">
            Pool: {poolStatus.inFlight} active · {poolStatus.queued} queued
          </Badge>
        </div>

        {/* Live multi-model RPM pool status */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {poolStatus.models.map((pm) => (
            <div
              key={pm.model}
              className="rounded-xl border border-[#EFECE3] bg-[#FAF9F5] px-3 py-2 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-mono font-semibold text-[#1F1E1C] truncate">{pm.model}</p>
                <p className="text-[11px] text-[#6B665E]">{pm.callsLastMinute} / 24 soft RPM</p>
              </div>
              {pm.cooldownRemainingSeconds > 0 ? (
                <Badge variant="warning">Cooldown {pm.cooldownRemainingSeconds}s</Badge>
              ) : (
                <Badge variant="success">Ready</Badge>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 7-day chart */}
          <div className="rounded-xl border border-[#EFECE3] bg-[#FAF9F5] p-3.5 space-y-2.5">
            <p className="text-xs font-semibold text-[#4A463F]">Last 7 Days Activity (Manila)</p>
            <div className="flex items-end gap-2 h-24 pt-2">
              {usageMonitor.dailySeries.map((day) => {
                const heightPct = Math.max(8, Math.round((day.count / maxDayCount) * 100));
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <span className="text-[10px] font-mono text-[#6B665E]">{day.count}</span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-md bg-[#D97757]/85 transition-all"
                        style={{ height: `${heightPct}%` }}
                        title={`${day.label}: ${day.count} requests`}
                      />
                    </div>
                    <span className="text-[10px] text-[#7A746B] truncate">{day.label.split(" ")[1]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Endpoint breakdown */}
          <div className="rounded-xl border border-[#EFECE3] bg-[#FAF9F5] p-3.5 space-y-2">
            <p className="text-xs font-semibold text-[#4A463F]">Usage by Endpoint</p>
            {usageMonitor.byEndpoint.length === 0 ? (
              <p className="text-xs text-[#7A746B]">No API requests recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {usageMonitor.byEndpoint.map((ep) => (
                  <div key={ep.kind} className="flex items-center justify-between text-xs">
                    <span className="text-[#1F1E1C] font-medium truncate">
                      {ENDPOINT_LABELS[ep.kind] ?? ep.kind}
                    </span>
                    <span className="font-mono text-[#6B665E] shrink-0">
                      <strong className="text-[#1F1E1C]">{ep.today}</strong> today · {ep.total} total
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Model breakdown */}
          <div className="rounded-xl border border-[#EFECE3] bg-[#FAF9F5] p-3.5 space-y-2">
            <p className="text-xs font-semibold text-[#4A463F]">Usage by Groq Model</p>
            {usageMonitor.byModel.length === 0 ? (
              <p className="text-xs text-[#7A746B]">No model telemetry recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {usageMonitor.byModel.map((m) => (
                  <div key={m.model} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-[#1F1E1C] truncate">{m.model}</span>
                    <span className="font-mono text-[#6B665E] shrink-0">
                      <strong className="text-[#1F1E1C]">{m.today}</strong> today · {m.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* AI Model & Output Controls */}
      <Card className="p-4 sm:p-5">
        <form onSubmit={handleSaveAiControls} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#1F1E1C] flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-[#D97757]" />
                <span>AI Model &amp; Output Controls</span>
              </h2>
              <p className="text-xs text-[#6B665E]">
                Switch active Groq models cleanly for future releases or traffic spikes, with automatic fallback.
              </p>
            </div>
            <Badge>GPT-OSS 120B + Whisper v3 Turbo</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#4A463F] mb-1">Primary Chat / Report Model</label>
              <select
                value={activeTextModel}
                onChange={(e) => setActiveTextModel(e.target.value as AllowedTextModel)}
                className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-xs font-medium text-[#1F1E1C] outline-none focus:border-[#D97757]"
              >
                {ALLOWED_TEXT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[#7A746B]">
                {ALLOWED_TEXT_MODELS.find((m) => m.id === activeTextModel)?.notes}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4A463F] mb-1 flex items-center gap-1">
                <Mic className="w-3.5 h-3.5 text-[#D97757]" />
                Voice Transcription (STT) Model
              </label>
              <select
                value={activeSttModel}
                onChange={(e) => setActiveSttModel(e.target.value as AllowedSttModel)}
                className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-xs font-medium text-[#1F1E1C] outline-none focus:border-[#D97757]"
              >
                {ALLOWED_STT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[#7A746B]">
                {ALLOWED_STT_MODELS.find((m) => m.id === activeSttModel)?.notes}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4A463F] mb-1">Max Bullets per Day Cell</label>
              <Input
                type="number"
                min={1}
                max={5}
                value={maxBulletsPerDay}
                onChange={(e) => setMaxBulletsPerDay(Math.max(1, Math.min(5, Number(e.target.value) || 3)))}
                className="text-xs font-semibold"
              />
              <p className="mt-1 text-[11px] text-[#7A746B]">
                Keeps daily tasks inside 1 page (recommended: 3).
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4A463F] mb-1">Max Chat Context Messages</label>
              <Input
                type="number"
                min={4}
                max={60}
                value={maxChatMessages}
                onChange={(e) => setMaxChatMessages(Math.max(4, Math.min(60, Number(e.target.value) || 16)))}
                className="text-xs font-semibold"
              />
              <p className="mt-1 text-[11px] text-[#7A746B]">
                Messages kept per report chat before Clear Chat (default: 16).
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4A463F] mb-1">Shared Team RPM Limit</label>
              <Input
                type="number"
                min={10}
                max={300}
                value={globalRpmLimit}
                onChange={(e) => setGlobalRpmLimit(Math.max(10, Math.min(300, Number(e.target.value) || 60)))}
                className="text-xs font-semibold"
              />
              <p className="mt-1 text-[11px] text-[#7A746B]">
                Pooled across 3 models (default: 60 RPM safely below 90 RPM ceiling).
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={savingAi}>
              <Save className="w-3.5 h-3.5" />
              <span>{savingAi ? "Saving..." : "Save AI Controls"}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* Create Intern Account (Admin Only) */}
      <Card className="p-4 sm:p-5">
        <form onSubmit={handleCreateAccount} className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-[#1F1E1C] flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-[#D97757]" />
              <span>Create Intern Account</span>
            </h2>
            <p className="text-xs text-[#6B665E]">
              Public sign-up is disabled. Only the admin account can provision new intern logins.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
            <Input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="intern@email.com"
              className="md:col-span-4 h-9"
            />
            <div className="relative md:col-span-3">
              <Input
                type={showNewPassword ? "text" : "password"}
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Temp password (min 6)"
                className="pr-9 h-9"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                aria-label={showNewPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A847A] hover:text-[#1F1E1C] cursor-pointer"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Input
              type="number"
              min={0}
              max={1000}
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              placeholder={`Prompts (${defaultLimit}/d)`}
              className="md:col-span-2 h-9 text-xs"
            />
            <Input
              type="number"
              min={1}
              max={10000}
              value={newMaxReports}
              onChange={(e) => setNewMaxReports(e.target.value)}
              placeholder="Reports (∞)"
              className="md:col-span-1 h-9 text-xs"
            />
            <Button type="submit" variant="accent" disabled={creating} className="md:col-span-2 h-9">
              {creating ? "Creating..." : "Create Account"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Global Default Allowances */}
      <Card className="p-4 sm:p-5">
        <form onSubmit={handleSaveDefault} className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-[#1F1E1C] flex items-center gap-1.5">
              <FileStack className="w-4 h-4 text-[#D97757]" />
              <span>Global Default Limits (All Interns)</span>
            </h2>
            <p className="text-xs text-[#6B665E]">
              Daily prompt allowance resets at 12:00 AM (Asia/Manila). Leave Max Saved Reports blank for unlimited.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-[#4A463F]">
                Daily Prompts:
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  value={defaultLimit}
                  onChange={(e) => setDefaultLimit(Number(e.target.value))}
                  className="w-20 font-semibold"
                />
                <span className="text-[#7A746B]">/ day</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-[#4A463F]">
                Max Saved Reports:
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  placeholder="Unlimited"
                  value={defaultMaxReports}
                  onChange={(e) => setDefaultMaxReports(e.target.value)}
                  className="w-28 font-semibold"
                />
              </label>
            </div>

            <Button type="submit" size="sm" disabled={savingDefault}>
              <Save className="w-3.5 h-3.5" />
              <span>{savingDefault ? "Saving..." : "Save Defaults"}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* Member list */}
      <Card className="overflow-hidden">
        <div className="border-b border-[#EFECE3] px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#1F1E1C]">Members ({members.length})</h2>
          <span className="text-xs text-[#6B665E]">
            Leave custom fields blank to inherit defaults ({defaultLimit}/day ·{" "}
            {defaultMaxReports === "" ? "Unlimited reports" : `${defaultMaxReports} reports`})
          </span>
        </div>

        <div className="divide-y divide-[#F2EFE8]">
          {members.map((m) => {
            const busy = busyId === m.userId;
            return (
              <div
                key={m.userId}
                className="p-4 sm:px-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 hover:bg-[#FAF9F5]/80"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[#1F1E1C] truncate">{m.email}</p>
                    {m.isAdmin ? (
                      <Badge variant="accent">Admin · Unlimited</Badge>
                    ) : m.isBlocked ? (
                      <Badge variant="destructive">Paused</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-[#6B665E]">
                    {m.nameLastFirst || "No profile name"} · {m.office || "DNX"} ·{" "}
                    <strong className="text-[#1F1E1C]">{m.usedToday}</strong>
                    {!m.isAdmin && ` / ${m.effectiveDailyLimit}`} prompts today · {m.usedTotal} total prompts ·{" "}
                    <strong className="text-[#1F1E1C]">{m.reportsCount}</strong>
                    {!m.isAdmin && ` / ${m.effectiveMaxReports === null ? "∞" : m.effectiveMaxReports}`} saved reports
                  </p>
                </div>

                {!m.isAdmin && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <label className="flex items-center gap-1 text-xs text-[#6B665E]">
                      Prompts:
                      <Input
                        type="number"
                        min={0}
                        max={1000}
                        placeholder={String(defaultLimit)}
                        value={draftLimits[m.userId] ?? ""}
                        onChange={(e) => setDraftLimits((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                        className="h-8 w-16 bg-white px-2 text-xs font-medium"
                      />
                    </label>

                    <label className="flex items-center gap-1 text-xs text-[#6B665E]">
                      Reports:
                      <Input
                        type="number"
                        min={1}
                        max={10000}
                        placeholder={defaultMaxReports === "" ? "∞" : defaultMaxReports}
                        value={draftMaxReports[m.userId] ?? ""}
                        onChange={(e) => setDraftMaxReports((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                        className="h-8 w-16 bg-white px-2 text-xs font-medium"
                      />
                    </label>

                    <Button type="button" size="sm" disabled={busy} onClick={() => handleSaveMember(m)}>
                      <Save className="w-3 h-3" />
                      <span>Save</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || m.usedToday === 0}
                      onClick={() => handleResetToday(m)}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Today</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant={m.isBlocked ? "default" : "destructive"}
                      disabled={busy}
                      onClick={() => handleSaveMember(m, !m.isBlocked)}
                      className={m.isBlocked ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                    >
                      {m.isBlocked ? (
                        <>
                          <PlayCircle className="w-3 h-3" />
                          <span>Allow</span>
                        </>
                      ) : (
                        <>
                          <PauseCircle className="w-3 h-3" />
                          <span>Pause</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
