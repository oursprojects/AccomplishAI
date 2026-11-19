"use client";

import { useState } from "react";
import type { AdminMember } from "@/app/api/admin/users/route";

interface AdminClientProps {
  initialDefaultLimit: number;
  initialMembers: AdminMember[];
}

export function AdminClient({ initialDefaultLimit, initialMembers }: AdminClientProps) {
  const [defaultLimit, setDefaultLimit] = useState(initialDefaultLimit);
  const [members, setMembers] = useState<AdminMember[]>(initialMembers);
  const [draftLimits, setDraftLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialMembers.map((m) => [m.userId, m.customDailyLimit === null ? "" : String(m.customDailyLimit)])),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function syncResponse(json: { defaultDailyLimit: number; members: AdminMember[] }) {
    setDefaultLimit(json.defaultDailyLimit);
    setMembers(json.members);
    setDraftLimits(
      Object.fromEntries(json.members.map((m) => [m.userId, m.customDailyLimit === null ? "" : String(m.customDailyLimit)])),
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
        }),
      });
      const json = (await res.json()) as {
        defaultDailyLimit?: number;
        members?: AdminMember[];
        needsConfirmWarning?: boolean;
        error?: string;
      };
      if (!res.ok || !json.members || json.defaultDailyLimit === undefined) {
        throw new Error(json.error ?? "Failed to create intern account.");
      }
      syncResponse({ defaultDailyLimit: json.defaultDailyLimit, members: json.members });
      setNotice(
        json.needsConfirmWarning
          ? `Account created for ${newEmail.trim()}. Note: disable 'Confirm email' in Supabase Auth -> Providers -> Email so they can sign in without email confirmation.`
          : `Intern account created for ${newEmail.trim()}.`,
      );
      setNewEmail("");
      setNewPassword("");
      setNewLimit("");
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
        body: JSON.stringify({ action: "update_default_limit", defaultDailyLimit: defaultLimit }),
      });
      const json = (await res.json()) as { defaultDailyLimit?: number; members?: AdminMember[]; error?: string };
      if (!res.ok || json.members === undefined || json.defaultDailyLimit === undefined) {
        throw new Error(json.error ?? "Failed to update default limit.");
      }
      syncResponse({ defaultDailyLimit: json.defaultDailyLimit, members: json.members });
      setNotice(`Default daily prompt limit updated to ${json.defaultDailyLimit} prompts/day.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save default limit.");
    } finally {
      setSavingDefault(false);
    }
  }

  async function handleSaveMember(member: AdminMember, nextBlocked = member.isBlocked) {
    setError(null);
    setNotice(null);
    setBusyId(member.userId);
    try {
      const raw = (draftLimits[member.userId] ?? "").trim();
      const customDailyLimit = raw === "" ? null : Number(raw);
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_member",
          userId: member.userId,
          customDailyLimit,
          isBlocked: nextBlocked,
        }),
      });
      const json = (await res.json()) as { defaultDailyLimit?: number; members?: AdminMember[]; error?: string };
      if (!res.ok || !json.members || json.defaultDailyLimit === undefined) {
        throw new Error(json.error ?? "Failed to update member.");
      }
      syncResponse({ defaultDailyLimit: json.defaultDailyLimit, members: json.members });
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
      const json = (await res.json()) as { defaultDailyLimit?: number; members?: AdminMember[]; error?: string };
      if (!res.ok || !json.members || json.defaultDailyLimit === undefined) {
        throw new Error(json.error ?? "Failed to reset today's count.");
      }
      syncResponse({ defaultDailyLimit: json.defaultDailyLimit, members: json.members });
      setNotice(`Reset today's prompt usage for ${member.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setBusyId(null);
    }
  }

  const totalPromptsToday = members.reduce((acc, m) => acc + m.usedToday, 0);
  const totalInterns = members.filter((m) => !m.isAdmin).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
            Admin Console
          </span>
          <h1 className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Intern Member Prompt Management
          </h1>
          <p className="text-sm text-slate-600">
            Control daily AI prompt allowances per intern to stay safely within Groq&apos;s free-tier limits.
          </p>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Registered Interns</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{totalInterns}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500">AI Prompts Used Today (Manila)</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{totalPromptsToday}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Active Groq Text Model</p>
          <p className="mt-1 text-sm font-mono font-semibold text-emerald-700 truncate">openai/gpt-oss-120b</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Fallback: openai/gpt-oss-20b · 1K RPD / 8K TPM</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {/* Create Intern Account (Admin Only) */}
      <form
        onSubmit={handleCreateAccount}
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3"
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Create Intern Account</h2>
          <p className="text-xs text-slate-500">
            Public sign-up is disabled. Only you (<span className="font-medium">mikorynosantiago@gmail.com</span>) can
            create accounts for your intern members.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="intern@email.com"
            className="sm:col-span-4 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
          />
          <input
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Temporary password (min 6 chars)"
            className="sm:col-span-4 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
          />
          <input
            type="number"
            min={0}
            max={1000}
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            placeholder={`Limit (${defaultLimit}/day)`}
            className="sm:col-span-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
          />
          <button
            type="submit"
            disabled={creating}
            className="sm:col-span-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 transition cursor-pointer"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </form>

      {/* Global default limit */}
      <form
        onSubmit={handleSaveDefault}
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-900">Default Daily Prompt Allowance (All Interns)</h2>
          <p className="text-xs text-slate-500">
            Applies to every intern unless a custom limit is set below. Resets daily at 12:00 AM (Asia/Manila).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            min={0}
            max={1000}
            value={defaultLimit}
            onChange={(e) => setDefaultLimit(Number(e.target.value))}
            className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-900"
          />
          <span className="text-xs text-slate-500 mr-1">prompts/day</span>
          <button
            type="submit"
            disabled={savingDefault}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 transition cursor-pointer"
          >
            {savingDefault ? "Saving..." : "Save Default"}
          </button>
        </div>
      </form>

      {/* Member list */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 px-4 sm:px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Members ({members.length})</h2>
          <span className="text-xs text-slate-500">Leave custom limit blank to use default ({defaultLimit}/day)</span>
        </div>

        <div className="divide-y divide-slate-100">
          {members.map((m) => {
            const busy = busyId === m.userId;
            return (
              <div
                key={m.userId}
                className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 hover:bg-slate-50/70"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{m.email}</p>
                    {m.isAdmin ? (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
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
                  <p className="text-xs text-slate-500">
                    {m.nameLastFirst || "No profile name"} · {m.office || "YML"} ·{" "}
                    <strong className="text-slate-700">{m.usedToday}</strong>
                    {!m.isAdmin && ` / ${m.effectiveDailyLimit}`} used today · {m.usedTotal} total prompts ·{" "}
                    {m.reportsCount} saved reports
                  </p>
                </div>

                {!m.isAdmin && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-slate-500">Limit:</label>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        placeholder={String(defaultLimit)}
                        value={draftLimits[m.userId] ?? ""}
                        onChange={(e) => setDraftLimits((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                        className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 outline-none focus:border-slate-900"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSaveMember(m)}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                    >
                      Save
                    </button>

                    <button
                      type="button"
                      disabled={busy || m.usedToday === 0}
                      onClick={() => handleResetToday(m)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                    >
                      Reset Today
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSaveMember(m, !m.isBlocked)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                        m.isBlocked
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "border border-red-200 text-red-700 hover:bg-red-50"
                      }`}
                    >
                      {m.isBlocked ? "Allow" : "Pause"}
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
