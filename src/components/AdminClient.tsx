"use client";

import { useState } from "react";
import {
  Bot,
  CheckCircle2,
  Cpu,
  FileStack,
  Mic,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
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
} from "@/lib/admin";

interface AdminClientProps {
  initialAiSettings: AiRuntimeSettings;
  initialMembers: AdminMember[];
}

export function AdminClient({ initialAiSettings, initialMembers }: AdminClientProps) {
  const [aiSettings, setAiSettings] = useState<AiRuntimeSettings>(initialAiSettings);
  const [defaultLimit, setDefaultLimit] = useState(initialAiSettings.defaultDailyLimit);
  const [defaultMaxReports, setDefaultMaxReports] = useState(
    initialAiSettings.defaultMaxReports === null ? "" : String(initialAiSettings.defaultMaxReports),
  );
  const [activeTextModel, setActiveTextModel] = useState<AllowedTextModel>(initialAiSettings.activeTextModel);
  const [activeSttModel, setActiveSttModel] = useState<AllowedSttModel>(initialAiSettings.activeSttModel);
  const [maxBulletsPerDay, setMaxBulletsPerDay] = useState(initialAiSettings.maxBulletsPerDay);

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
  const [newLimit, setNewLimit] = useState("");
  const [newMaxReports, setNewMaxReports] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function syncResponse(json: { aiSettings: AiRuntimeSettings; members: AdminMember[] }) {
    setAiSettings(json.aiSettings);
    setDefaultLimit(json.aiSettings.defaultDailyLimit);
    setDefaultMaxReports(
      json.aiSettings.defaultMaxReports === null ? "" : String(json.aiSettings.defaultMaxReports),
    );
    setActiveTextModel(json.aiSettings.activeTextModel);
    setActiveSttModel(json.aiSettings.activeSttModel);
    setMaxBulletsPerDay(json.aiSettings.maxBulletsPerDay);
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
        needsConfirmWarning?: boolean;
        error?: string;
      };
      if (!res.ok || !json.members || !json.aiSettings) {
        throw new Error(json.error ?? "Failed to create intern account.");
      }
      syncResponse({ aiSettings: json.aiSettings, members: json.members });
      setNotice(
        json.needsConfirmWarning
          ? `Account created for ${newEmail.trim()}. Note: disable 'Confirm email' in Supabase Auth -> Providers -> Email so they can sign in right away.`
          : `Intern account created for ${newEmail.trim()}.`,
      );
      setNewEmail("");
      setNewPassword("");
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
      const json = (await res.json()) as { aiSettings?: AiRuntimeSettings; members?: AdminMember[]; error?: string };
      if (!res.ok || !json.members || !json.aiSettings) {
        throw new Error(json.error ?? "Failed to update default limits.");
      }
      syncResponse({ aiSettings: json.aiSettings, members: json.members });
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
        }),
      });
      const json = (await res.json()) as { aiSettings?: AiRuntimeSettings; members?: AdminMember[]; error?: string };
      if (!res.ok || !json.members || !json.aiSettings) {
        throw new Error(json.error ?? "Failed to save AI controls.");
      }
      syncResponse({ aiSettings: json.aiSettings, members: json.members });
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
      const json = (await res.json()) as { aiSettings?: AiRuntimeSettings; members?: AdminMember[]; error?: string };
      if (!res.ok || !json.members || !json.aiSettings) {
        throw new Error(json.error ?? "Failed to update member.");
      }
      syncResponse({ aiSettings: json.aiSettings, members: json.members });
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
      const json = (await res.json()) as { aiSettings?: AiRuntimeSettings; members?: AdminMember[]; error?: string };
      if (!res.ok || !json.members || !json.aiSettings) {
        throw new Error(json.error ?? "Failed to reset today's count.");
      }
      syncResponse({ aiSettings: json.aiSettings, members: json.members });
      setNotice(`Reset today's prompt usage for ${member.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setBusyId(null);
    }
  }

  const totalPromptsToday = members.reduce((acc, m) => acc + m.usedToday, 0);
  const totalReports = members.reduce((acc, m) => acc + m.reportsCount, 0);
  const totalInterns = members.filter((m) => !m.isAdmin).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FDF3EF] px-2.5 py-0.5 text-xs font-semibold text-[#C86343] border border-[#F0D5C9]">
            <ShieldCheck className="w-3.5 h-3.5" />
            Admin Console
          </span>
          <h1 className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#1F1E1C]">
            Interns, AI Models &amp; Quotas
          </h1>
          <p className="text-sm text-[#6B665E]">
            Manage intern accounts, saved report allowances, daily AI prompt limits, and Groq model selection.
          </p>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-[#E6E2D8] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B665E]">
            <span>Registered Interns</span>
            <Users className="w-4 h-4 text-[#D97757]" />
          </div>
          <p className="mt-1 text-2xl font-bold text-[#1F1E1C]">{totalInterns}</p>
          <p className="text-[11px] text-[#7A746B] mt-0.5">{totalReports} total saved reports</p>
        </div>

        <div className="rounded-2xl border border-[#E6E2D8] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B665E]">
            <span>AI Prompts Today (Manila)</span>
            <Sparkles className="w-4 h-4 text-[#D97757]" />
          </div>
          <p className="mt-1 text-2xl font-bold text-[#1F1E1C]">{totalPromptsToday}</p>
          <p className="text-[11px] text-[#7A746B] mt-0.5">Default: {aiSettings.defaultDailyLimit} prompts/day</p>
        </div>

        <div className="rounded-2xl border border-[#E6E2D8] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B665E]">
            <span>Active Groq Models</span>
            <Cpu className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="mt-1 text-xs font-mono font-semibold text-emerald-700 truncate">{aiSettings.activeTextModel}</p>
          <p className="text-[11px] font-mono text-[#6B665E] truncate mt-0.5">STT: {aiSettings.activeSttModel}</p>
        </div>
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

      {/* AI Model & Output Controls */}
      <form
        onSubmit={handleSaveAiControls}
        className="rounded-2xl border border-[#E6E2D8] bg-white p-4 sm:p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#1F1E1C] flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-[#D97757]" />
              AI Model &amp; Output Controls
            </h2>
            <p className="text-xs text-[#6B665E]">
              Switch models cleanly for future releases or traffic spikes, with automatic fallback if a primary model hits Groq rate limits.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F2EA] px-2.5 py-1 text-[11px] font-medium text-[#4A463F]">
            Recommended: GPT-OSS 120B + Whisper v3 Turbo
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <input
              type="number"
              min={1}
              max={5}
              value={maxBulletsPerDay}
              onChange={(e) => setMaxBulletsPerDay(Math.max(1, Math.min(5, Number(e.target.value) || 3)))}
              className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-xs font-semibold text-[#1F1E1C] outline-none focus:border-[#D97757]"
            />
            <p className="mt-1 text-[11px] text-[#7A746B]">
              Keeps daily task tables compact inside the 1–2 page .docx layout (recommended: 3).
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingAi}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1F1E1C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#33312E] disabled:opacity-60 transition cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {savingAi ? "Saving..." : "Save AI Controls"}
          </button>
        </div>
      </form>

      {/* Create Intern Account (Admin Only) */}
      <form
        onSubmit={handleCreateAccount}
        className="rounded-2xl border border-[#E6E2D8] bg-white p-4 sm:p-5 shadow-xs space-y-3"
      >
        <div>
          <h2 className="text-sm font-semibold text-[#1F1E1C] flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-[#D97757]" />
            Create Intern Account
          </h2>
          <p className="text-xs text-[#6B665E]">
            Public sign-up is disabled. Only the admin account can provision new intern logins.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="intern@email.com"
            className="sm:col-span-4 rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757]"
          />
          <input
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Temporary password (min 6 chars)"
            className="sm:col-span-3 rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757]"
          />
          <input
            type="number"
            min={0}
            max={1000}
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            placeholder={`Prompts (${defaultLimit}/d)`}
            className="sm:col-span-2 rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-xs text-[#1F1E1C] outline-none focus:border-[#D97757]"
          />
          <input
            type="number"
            min={1}
            max={10000}
            value={newMaxReports}
            onChange={(e) => setNewMaxReports(e.target.value)}
            placeholder="Max reports (∞)"
            className="sm:col-span-2 rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-xs text-[#1F1E1C] outline-none focus:border-[#D97757]"
          />
          <button
            type="submit"
            disabled={creating}
            className="sm:col-span-1 rounded-xl bg-[#D97757] px-3 py-2 text-xs font-semibold text-white hover:bg-[#C86343] disabled:opacity-60 transition cursor-pointer"
          >
            {creating ? "..." : "Create"}
          </button>
        </div>
      </form>

      {/* Global Default Allowances */}
      <form
        onSubmit={handleSaveDefault}
        className="rounded-2xl border border-[#E6E2D8] bg-white p-4 sm:p-5 shadow-xs space-y-3"
      >
        <div>
          <h2 className="text-sm font-semibold text-[#1F1E1C] flex items-center gap-1.5">
            <FileStack className="w-4 h-4 text-[#D97757]" />
            Global Default Limits (All Interns)
          </h2>
          <p className="text-xs text-[#6B665E]">
            Daily prompt resets at 12:00 AM (Asia/Manila). Leave Max Saved Reports blank for unlimited reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-medium text-[#4A463F]">
              Daily Prompts:
              <input
                type="number"
                min={0}
                max={1000}
                value={defaultLimit}
                onChange={(e) => setDefaultLimit(Number(e.target.value))}
                className="w-20 rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-2.5 py-1.5 text-sm font-semibold text-[#1F1E1C] outline-none focus:border-[#D97757]"
              />
              <span className="text-[#7A746B]">/ day</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-[#4A463F]">
              Max Saved Reports:
              <input
                type="number"
                min={1}
                max={10000}
                placeholder="Unlimited"
                value={defaultMaxReports}
                onChange={(e) => setDefaultMaxReports(e.target.value)}
                className="w-28 rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-2.5 py-1.5 text-sm font-semibold text-[#1F1E1C] outline-none focus:border-[#D97757]"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={savingDefault}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1F1E1C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#33312E] disabled:opacity-60 transition cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {savingDefault ? "Saving..." : "Save Defaults"}
          </button>
        </div>
      </form>

      {/* Member list */}
      <section className="rounded-2xl border border-[#E6E2D8] bg-white shadow-xs overflow-hidden">
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
                      <span className="rounded-full bg-[#FDF3EF] px-2 py-0.5 text-[11px] font-semibold text-[#C86343] border border-[#F0D5C9]">
                        Admin · Unlimited
                      </span>
                    ) : m.isBlocked ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                        Paused
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        Active
                      </span>
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
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        placeholder={String(defaultLimit)}
                        value={draftLimits[m.userId] ?? ""}
                        onChange={(e) => setDraftLimits((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                        className="w-16 rounded-lg border border-[#DDD7CB] bg-white px-2 py-1 text-xs font-medium text-[#1F1E1C] outline-none focus:border-[#D97757]"
                      />
                    </label>

                    <label className="flex items-center gap-1 text-xs text-[#6B665E]">
                      Reports:
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        placeholder={defaultMaxReports === "" ? "∞" : defaultMaxReports}
                        value={draftMaxReports[m.userId] ?? ""}
                        onChange={(e) => setDraftMaxReports((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                        className="w-16 rounded-lg border border-[#DDD7CB] bg-white px-2 py-1 text-xs font-medium text-[#1F1E1C] outline-none focus:border-[#D97757]"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSaveMember(m)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#1F1E1C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#33312E] disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="w-3 h-3" />
                      Save
                    </button>

                    <button
                      type="button"
                      disabled={busy || m.usedToday === 0}
                      onClick={() => handleResetToday(m)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#DDD7CB] bg-white px-2.5 py-1.5 text-xs font-medium text-[#4A463F] hover:bg-[#F4F2EA] disabled:opacity-40 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset Today
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSaveMember(m, !m.isBlocked)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                        m.isBlocked
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "border border-red-200 text-red-700 hover:bg-red-50"
                      }`}
                    >
                      {m.isBlocked ? (
                        <>
                          <PlayCircle className="w-3 h-3" />
                          Allow
                        </>
                      ) : (
                        <>
                          <PauseCircle className="w-3 h-3" />
                          Pause
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
