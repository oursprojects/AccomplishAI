"use client";

import { useState } from "react";
import {
  Activity,
  Bot,
  ChevronDown,
  ChevronUp,
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
  X,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

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
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newLimit, setNewLimit] = useState("");
  const [newMaxReports, setNewMaxReports] = useState("");
  const [showOptionalDefaults, setShowOptionalDefaults] = useState(false);
  const [newNameLastFirst, setNewNameLastFirst] = useState("");
  const [newNameFirstLast, setNewNameFirstLast] = useState("");
  const [newOffice, setNewOffice] = useState("");
  const [newVerifier, setNewVerifier] = useState("");
  const [newDailyHours, setNewDailyHours] = useState("");
  const [newTargetOjtHours, setNewTargetOjtHours] = useState("");
  const [newStartDate, setNewStartDate] = useState("");

  const aiControlsChanged =
    activeTextModel !== aiSettings.activeTextModel ||
    activeSttModel !== aiSettings.activeSttModel ||
    maxBulletsPerDay !== aiSettings.maxBulletsPerDay ||
    maxChatMessages !== aiSettings.maxChatMessages ||
    globalRpmLimit !== aiSettings.globalRpmLimit;

  const normalizedDefaultMaxReports = defaultMaxReports.trim() === "" ? null : Number(defaultMaxReports);
  const defaultsChanged =
    defaultLimit !== aiSettings.defaultDailyLimit || normalizedDefaultMaxReports !== aiSettings.defaultMaxReports;

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

  function openCreateModal() {
    setModalError(null);
    setCreateModalOpen(true);
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
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
          nameLastFirst: newNameLastFirst.trim() || undefined,
          nameFirstLast: newNameFirstLast.trim() || undefined,
          office: newOffice.trim() || undefined,
          defaultVerifier: newVerifier.trim() || undefined,
          defaultDailyHours: newDailyHours.trim() === "" ? undefined : Number(newDailyHours),
          targetOjtHours: newTargetOjtHours.trim() === "" ? undefined : Number(newTargetOjtHours),
          internshipStartDate: newStartDate || undefined,
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
      toast.success(
        json.needsConfirmWarning
          ? `Account created for ${newEmail.trim()}. Note: disable 'Confirm email' in Supabase Auth -> Providers -> Email so they can sign in right away.`
          : `Intern account created for ${newEmail.trim()}.`,
      );
      setNewEmail("");
      setNewPassword("");
      setShowNewPassword(false);
      setNewLimit("");
      setNewMaxReports("");
      setNewNameLastFirst("");
      setNewNameFirstLast("");
      setNewOffice("");
      setNewVerifier("");
      setNewDailyHours("");
      setNewTargetOjtHours("");
      setNewStartDate("");
      setShowOptionalDefaults(false);
      setCreateModalOpen(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Could not create account.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveDefault(e: React.FormEvent) {
    e.preventDefault();
    if (!defaultsChanged || savingDefault) return;
    setSavingDefault(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_default_limit",
          defaultDailyLimit: defaultLimit,
          defaultMaxReports: normalizedDefaultMaxReports,
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
      toast.success(
        `Saved defaults: ${json.aiSettings.defaultDailyLimit} prompts/day · ${
          json.aiSettings.defaultMaxReports === null
            ? "Unlimited reports"
            : `${json.aiSettings.defaultMaxReports} max saved reports`
        }.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save default limits.");
    } finally {
      setSavingDefault(false);
    }
  }

  async function handleSaveAiControls(e: React.FormEvent) {
    e.preventDefault();
    if (!aiControlsChanged || savingAi) return;
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
      toast.success(`AI settings updated: ${json.aiSettings.activeTextModel} & ${json.aiSettings.activeSttModel}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update AI controls.");
    } finally {
      setSavingAi(false);
    }
  }

  async function handleSaveMember(member: AdminMember, nextBlocked = member.isBlocked) {
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
      toast.success(`Updated limits for ${member.email}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetToday(member: AdminMember) {
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
      toast.success(`Reset today's prompt usage for ${member.email}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed.");
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
          <h1 className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#141413]">
            Interns, AI Controls &amp; API Usage Monitor
          </h1>
          <p className="text-sm text-[#5C5C57]">
            Monitor live Groq API utilization, enforce per-user prompt &amp; report limits, and manage intern logins.
          </p>
        </div>

        <Button type="button" variant="accent" onClick={openCreateModal} className="self-start sm:self-center">
          <UserPlus className="w-4 h-4" />
          <span>Create Intern Account</span>
        </Button>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[#5C5C57]">
            <span>Registered Interns</span>
            <Users className="w-4 h-4 text-[#1D4ED8]" />
          </div>
          <p className="mt-1 text-2xl font-bold text-[#141413]">{totalInterns}</p>
          <p className="text-[11px] text-[#7A7A73] mt-0.5">{totalReports} total saved reports</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[#5C5C57]">
            <span>API Calls Today (Manila)</span>
            <Activity className="w-4 h-4 text-[#1D4ED8]" />
          </div>
          <p className="mt-1 text-2xl font-bold text-[#141413]">
            {usageMonitor.requestsToday} <span className="text-xs font-normal text-[#7A7A73]">/ 1,000 RPD</span>
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#F1F1EE] overflow-hidden">
            <div className="h-full bg-[#1D4ED8] rounded-full transition-all" style={{ width: `${rpdPct}%` }} />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[#5C5C57]">
            <span>Burst Rate (Last 60s)</span>
            <Gauge className="w-4 h-4 text-[#1D4ED8]" />
          </div>
          <p className="mt-1 text-2xl font-bold text-[#141413]">
            {usageMonitor.requestsLastMinute} <span className="text-xs font-normal text-[#7A7A73]">/ 30 RPM</span>
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#F1F1EE] overflow-hidden">
            <div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${rpmPct}%` }} />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[#5C5C57]">
            <span>Active Groq Models</span>
            <Cpu className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="mt-1 text-xs font-mono font-semibold text-emerald-700 truncate">{aiSettings.activeTextModel}</p>
          <p className="text-[11px] font-mono text-[#5C5C57] truncate mt-0.5">STT: {aiSettings.activeSttModel}</p>
          <p className="text-[11px] text-[#7A7A73] mt-1">{usageMonitor.requestsLast7Days} calls last 7 days</p>
        </Card>
      </div>

      {/* API Usage Monitor */}
      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#141413] flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#1D4ED8]" />
              <span>API Usage &amp; Security Monitor</span>
            </h2>
            <p className="text-xs text-[#5C5C57]">
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
              className="rounded-xl border border-[#F1F1EE] bg-[#F8F8F6] px-3 py-2 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-mono font-semibold text-[#141413] truncate">{pm.model}</p>
                <p className="text-[11px] text-[#5C5C57]">{pm.callsLastMinute} / 24 soft RPM</p>
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
          <div className="rounded-xl border border-[#F1F1EE] bg-[#F8F8F6] p-3.5 space-y-2.5">
            <p className="text-xs font-semibold text-[#3D3D39]">Last 7 Days Activity (Manila)</p>
            <div className="flex items-end gap-2 h-24 pt-2">
              {usageMonitor.dailySeries.map((day) => {
                const heightPct = Math.max(8, Math.round((day.count / maxDayCount) * 100));
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <span className="text-[10px] font-mono text-[#5C5C57]">{day.count}</span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-md bg-[#1D4ED8]/85 transition-all"
                        style={{ height: `${heightPct}%` }}
                        title={`${day.label}: ${day.count} requests`}
                      />
                    </div>
                    <span className="text-[10px] text-[#7A7A73] truncate">{day.label.split(" ")[1]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Endpoint breakdown */}
          <div className="rounded-xl border border-[#F1F1EE] bg-[#F8F8F6] p-3.5 space-y-2">
            <p className="text-xs font-semibold text-[#3D3D39]">Usage by Endpoint</p>
            {usageMonitor.byEndpoint.length === 0 ? (
              <p className="text-xs text-[#7A7A73]">No API requests recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {usageMonitor.byEndpoint.map((ep) => (
                  <div key={ep.kind} className="flex items-center justify-between text-xs">
                    <span className="text-[#141413] font-medium truncate">
                      {ENDPOINT_LABELS[ep.kind] ?? ep.kind}
                    </span>
                    <span className="font-mono text-[#5C5C57] shrink-0">
                      <strong className="text-[#141413]">{ep.today}</strong> today · {ep.total} total
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Model breakdown */}
          <div className="rounded-xl border border-[#F1F1EE] bg-[#F8F8F6] p-3.5 space-y-2">
            <p className="text-xs font-semibold text-[#3D3D39]">Usage by Groq Model</p>
            {usageMonitor.byModel.length === 0 ? (
              <p className="text-xs text-[#7A7A73]">No model telemetry recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {usageMonitor.byModel.map((m) => (
                  <div key={m.model} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-[#141413] truncate">{m.model}</span>
                    <span className="font-mono text-[#5C5C57] shrink-0">
                      <strong className="text-[#141413]">{m.today}</strong> today · {m.total}
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
              <h2 className="text-sm font-semibold text-[#141413] flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-[#1D4ED8]" />
                <span>AI Model &amp; Output Controls</span>
              </h2>
              <p className="text-xs text-[#5C5C57]">
                Switch active Groq models cleanly for future releases or traffic spikes, with automatic fallback.
              </p>
            </div>
            <Badge>GPT-OSS 120B + Whisper v3 Turbo</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <div>
              <label htmlFor="admin-text-model" className="block text-xs font-medium text-[#3D3D39] mb-1">
                Primary Chat / Report Model
              </label>
              <select
                id="admin-text-model"
                value={activeTextModel}
                onChange={(e) => setActiveTextModel(e.target.value as AllowedTextModel)}
                className="w-full rounded-xl border border-[#D8D8D0] bg-[#F8F8F6] px-3 py-2 text-xs font-medium text-[#141413] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/35 focus:border-[#1D4ED8] cursor-pointer"
              >
                {ALLOWED_TEXT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[#52524E]">
                {ALLOWED_TEXT_MODELS.find((m) => m.id === activeTextModel)?.notes}
              </p>
            </div>

            <div>
              <label htmlFor="admin-stt-model" className="block text-xs font-medium text-[#3D3D39] mb-1 flex items-center gap-1">
                <Mic className="w-3.5 h-3.5 text-[#1D4ED8]" />
                Voice Transcription (STT) Model
              </label>
              <select
                id="admin-stt-model"
                value={activeSttModel}
                onChange={(e) => setActiveSttModel(e.target.value as AllowedSttModel)}
                className="w-full rounded-xl border border-[#D8D8D0] bg-[#F8F8F6] px-3 py-2 text-xs font-medium text-[#141413] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/35 focus:border-[#1D4ED8] cursor-pointer"
              >
                {ALLOWED_STT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[#52524E]">
                {ALLOWED_STT_MODELS.find((m) => m.id === activeSttModel)?.notes}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3D39] mb-1">Max Bullets per Day Cell</label>
              <Input
                type="number"
                min={1}
                max={5}
                value={maxBulletsPerDay}
                onChange={(e) => setMaxBulletsPerDay(Math.max(1, Math.min(5, Number(e.target.value) || 3)))}
                className="text-xs font-semibold"
              />
              <p className="mt-1 text-[11px] text-[#7A7A73]">
                Keeps daily tasks inside 1 page (recommended: 3).
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3D39] mb-1">Max Chat Context Messages</label>
              <Input
                type="number"
                min={4}
                max={60}
                value={maxChatMessages}
                onChange={(e) => setMaxChatMessages(Math.max(4, Math.min(60, Number(e.target.value) || 16)))}
                className="text-xs font-semibold"
              />
              <p className="mt-1 text-[11px] text-[#7A7A73]">
                Messages kept per report chat before Clear Chat (default: 16).
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3D39] mb-1">Shared Team RPM Limit</label>
              <Input
                type="number"
                min={10}
                max={300}
                value={globalRpmLimit}
                onChange={(e) => setGlobalRpmLimit(Math.max(10, Math.min(300, Number(e.target.value) || 60)))}
                className="text-xs font-semibold"
              />
              <p className="mt-1 text-[11px] text-[#7A7A73]">
                Pooled across 3 models (default: 60 RPM safely below 90 RPM ceiling).
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={savingAi || !aiControlsChanged}>
              <Save className="w-3.5 h-3.5" />
              <span>{savingAi ? "Saving..." : aiControlsChanged ? "Save AI Controls" : "Saved"}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* Global Default Allowances */}
      <Card className="p-4 sm:p-5">
        <form onSubmit={handleSaveDefault} className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-[#141413] flex items-center gap-1.5">
              <FileStack className="w-4 h-4 text-[#1D4ED8]" />
              <span>Global Default Limits (All Interns)</span>
            </h2>
            <p className="text-xs text-[#5C5C57]">
              Daily prompt allowance resets at 12:00 AM (Asia/Manila). Leave Max Saved Reports blank for unlimited.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-[#3D3D39]">
                Daily Prompts:
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  value={defaultLimit}
                  onChange={(e) => setDefaultLimit(Number(e.target.value))}
                  className="w-20 font-semibold"
                />
                <span className="text-[#7A7A73]">/ day</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-[#3D3D39]">
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

            <Button type="submit" size="sm" disabled={savingDefault || !defaultsChanged}>
              <Save className="w-3.5 h-3.5" />
              <span>{savingDefault ? "Saving..." : defaultsChanged ? "Save Defaults" : "Saved"}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* Member list */}
      <Card className="overflow-hidden">
        <div className="border-b border-[#F1F1EE] px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#141413]">Members ({members.length})</h2>
          <span className="text-xs text-[#5C5C57]">
            Leave custom fields blank to inherit defaults ({defaultLimit}/day ·{" "}
            {defaultMaxReports === "" ? "Unlimited reports" : `${defaultMaxReports} reports`})
          </span>
        </div>

        <div className="divide-y divide-[#E2E2DC]">
          {members.map((m) => {
            const anyMutationBusy = creating || savingAi || savingDefault || busyId !== null;
            const savedLimit = m.customDailyLimit === null ? "" : String(m.customDailyLimit);
            const savedReports = m.customMaxReports === null ? "" : String(m.customMaxReports);
            const memberChanged =
              (draftLimits[m.userId] ?? "") !== savedLimit || (draftMaxReports[m.userId] ?? "") !== savedReports;
            return (
              <div
                key={m.userId}
                className="p-4 sm:px-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 hover:bg-[#F8F8F6]/80"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[#141413] truncate">{m.email}</p>
                    {m.isAdmin ? (
                      <Badge variant="accent">Admin · Unlimited</Badge>
                    ) : m.isBlocked ? (
                      <Badge variant="destructive">Paused</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-[#5C5C57]">
                    {m.nameLastFirst || "No profile name"} · {m.office || "DNX"} ·{" "}
                    <strong className="text-[#141413]">{m.usedToday}</strong>
                    {!m.isAdmin && ` / ${m.effectiveDailyLimit}`} prompts today · {m.usedTotal} total prompts ·{" "}
                    <strong className="text-[#141413]">{m.reportsCount}</strong>
                    {!m.isAdmin && ` / ${m.effectiveMaxReports === null ? "∞" : m.effectiveMaxReports}`} saved reports
                  </p>
                </div>

                {!m.isAdmin && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <label className="flex items-center gap-1 text-xs text-[#5C5C57]">
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

                    <label className="flex items-center gap-1 text-xs text-[#5C5C57]">
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

                    <Button type="button" size="sm" disabled={anyMutationBusy || !memberChanged} onClick={() => handleSaveMember(m)}>
                      <Save className="w-3 h-3" />
                      <span>{busyId === m.userId ? "Saving..." : memberChanged ? "Save" : "Saved"}</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={anyMutationBusy || m.usedToday === 0}
                      onClick={() => handleResetToday(m)}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Today</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant={m.isBlocked ? "default" : "destructive"}
                      disabled={anyMutationBusy}
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

      {/* Create Intern Account Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-lg max-h-[92dvh] overflow-y-auto">
          <form onSubmit={handleCreateAccount}>
            <DialogHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EFF4FF] text-[#1D4ED8]">
                    <UserPlus className="h-4 w-4" />
                  </span>
                  <div>
                    <DialogTitle>Create Intern Account</DialogTitle>
                    <DialogDescription>
                      Public sign-up is disabled. Provision a login and optional custom limits.
                    </DialogDescription>
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={creating}
                  onClick={() => setCreateModalOpen(false)}
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogHeader>

            <div className="px-5 py-2 space-y-3">
              {modalError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {modalError}
                </div>
              )}

              <div>
                <label htmlFor="create-intern-email" className="block text-xs font-medium text-[#3D3D39] mb-1">
                  Email Address
                </label>
                <Input
                  id="create-intern-email"
                  type="email"
                  required
                  autoFocus
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="intern@email.com"
                />
              </div>

              <div>
                <label htmlFor="create-intern-password" className="block text-xs font-medium text-[#3D3D39] mb-1">
                  Temporary Password
                </label>
                <div className="relative">
                  <Input
                    id="create-intern-password"
                    type={showNewPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A7A73] hover:text-[#141413] cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-intern-prompts" className="block text-xs font-medium text-[#3D3D39] mb-1">
                    Daily Prompt Limit
                  </label>
                  <Input
                    id="create-intern-prompts"
                    type="number"
                    min={0}
                    max={1000}
                    value={newLimit}
                    onChange={(e) => setNewLimit(e.target.value)}
                    placeholder={`Default (${defaultLimit}/d)`}
                  />
                </div>
                <div>
                  <label htmlFor="create-intern-reports" className="block text-xs font-medium text-[#3D3D39] mb-1">
                    Max Saved Reports
                  </label>
                  <Input
                    id="create-intern-reports"
                    type="number"
                    min={1}
                    max={10000}
                    value={newMaxReports}
                    onChange={(e) => setNewMaxReports(e.target.value)}
                    placeholder={defaultMaxReports === "" ? "Unlimited (∞)" : `Default (${defaultMaxReports})`}
                  />
                </div>
              </div>

              {/* Optional Profile, Office & OJT Hour Defaults */}
              <div className="rounded-xl border border-[#E2E2DC] bg-[#F8F8F6]/80 p-3 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowOptionalDefaults((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 text-xs font-semibold text-[#141413] cursor-pointer"
                >
                  <span>Optional Intern Defaults (Name, Office, Hours, Start Date)</span>
                  {showOptionalDefaults ? (
                    <ChevronUp className="h-4 w-4 text-[#5C5C57]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#5C5C57]" />
                  )}
                </button>

                {showOptionalDefaults && (
                  <div className="space-y-2.5 pt-1 border-t border-[#E2E2DC]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="create-intern-name-lf" className="block text-[11px] font-medium text-[#3D3D39] mb-1">
                          Header Name (Optional)
                        </label>
                        <Input
                          id="create-intern-name-lf"
                          type="text"
                          value={newNameLastFirst}
                          onChange={(e) => setNewNameLastFirst(e.target.value.toUpperCase())}
                          placeholder="DELA CRUZ, JUAN A."
                          className="bg-white uppercase text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor="create-intern-name-fl" className="block text-[11px] font-medium text-[#3D3D39] mb-1">
                          Signature Name (Optional)
                        </label>
                        <Input
                          id="create-intern-name-fl"
                          type="text"
                          value={newNameFirstLast}
                          onChange={(e) => setNewNameFirstLast(e.target.value.toUpperCase())}
                          placeholder="JUAN A. DELA CRUZ"
                          className="bg-white uppercase text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="create-intern-office" className="block text-[11px] font-medium text-[#3D3D39] mb-1">
                          Office / Company (Optional)
                        </label>
                        <Input
                          id="create-intern-office"
                          type="text"
                          value={newOffice}
                          onChange={(e) => setNewOffice(e.target.value)}
                          placeholder="DNX"
                          className="bg-white text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor="create-intern-verifier" className="block text-[11px] font-medium text-[#3D3D39] mb-1">
                          Default Verified By (Optional)
                        </label>
                        <Input
                          id="create-intern-verifier"
                          type="text"
                          value={newVerifier}
                          onChange={(e) => setNewVerifier(e.target.value.toUpperCase())}
                          placeholder="SUPERVISOR NAME"
                          className="bg-white uppercase text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label htmlFor="create-intern-daily-hrs" className="block text-[11px] font-medium text-[#3D3D39] mb-1">
                          Hours / Day (Opt.)
                        </label>
                        <Input
                          id="create-intern-daily-hrs"
                          type="number"
                          step="0.5"
                          min={0}
                          max={24}
                          value={newDailyHours}
                          onChange={(e) => setNewDailyHours(e.target.value)}
                          placeholder="8"
                          className="bg-white text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor="create-intern-ojt-hrs" className="block text-[11px] font-medium text-[#3D3D39] mb-1">
                          Target OJT Hrs (Opt.)
                        </label>
                        <Input
                          id="create-intern-ojt-hrs"
                          type="number"
                          min={40}
                          max={5000}
                          value={newTargetOjtHours}
                          onChange={(e) => setNewTargetOjtHours(e.target.value)}
                          placeholder="486"
                          className="bg-white text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor="create-intern-start" className="block text-[11px] font-medium text-[#3D3D39] mb-1">
                          Week 1 Date (Opt.)
                        </label>
                        <Input
                          id="create-intern-start"
                          type="date"
                          value={newStartDate}
                          onChange={(e) => setNewStartDate(e.target.value)}
                          className="bg-white text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={creating} onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={creating}>
                <UserPlus className="h-3.5 w-3.5" />
                <span>{creating ? "Creating..." : "Create Account"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
