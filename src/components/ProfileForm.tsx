"use client";

import { useState } from "react";
import { CheckCircle2, Save, Sparkles, UserRound } from "lucide-react";
import type { Profile } from "@/lib/supabase/database.types";

type EditableProfile = Pick<
  Profile,
  "name_last_first" | "name_first_last" | "office" | "default_verifier" | "default_daily_hours"
>;

function deriveSignatureName(lastFirst: string): string {
  const parts = lastFirst
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return "";
  return `${parts.slice(1).join(" ")} ${parts[0]}`.replace(/\s+/g, " ").trim();
}

export function ProfileForm({ initial }: { initial: EditableProfile }) {
  const [form, setForm] = useState<EditableProfile>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { profile?: EditableProfile; error?: string };
      if (!res.ok || !json.profile) throw new Error(json.error ?? "Failed to save profile.");
      setForm(json.profile);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-xl rounded-2xl border border-[#E6E2D8] bg-white p-5 sm:p-6 shadow-xs space-y-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDF3EF] text-[#D97757] border border-[#F0D5C9]">
          <UserRound className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-[#1F1E1C]">Intern Profile Defaults</h1>
          <p className="mt-0.5 text-sm text-[#6B665E]">
            Saved details automatically pre-fill every new report so you never retype them.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Profile defaults saved.</span>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1">
          Header Name (<span className="font-mono normal-case">LASTNAME, FIRSTNAME MI.</span>)
        </label>
        <input
          type="text"
          value={form.name_last_first}
          onChange={(e) => setForm({ ...form, name_last_first: e.target.value })}
          placeholder="DELA CRUZ, JUAN A."
          className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3.5 py-2.5 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white transition"
        />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#57544E]">
            Signature Name (<span className="font-mono normal-case">FIRSTNAME MI. LASTNAME</span>)
          </label>
          {form.name_last_first.includes(",") && (
            <button
              type="button"
              onClick={() => {
                const formatted = deriveSignatureName(form.name_last_first);
                if (formatted) setForm({ ...form, name_first_last: formatted });
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-[#F4F2EA] px-2 py-0.5 text-[11px] font-medium text-[#C86343] hover:bg-[#EAE7DD] cursor-pointer"
            >
              <Sparkles className="h-3 w-3" />
              <span>Auto-fill from Header Name</span>
            </button>
          )}
        </div>
        <input
          type="text"
          value={form.name_first_last}
          onChange={(e) => setForm({ ...form, name_first_last: e.target.value })}
          placeholder="JUAN A. DELA CRUZ"
          className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3.5 py-2.5 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white transition"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1">
            Default Office / Company
          </label>
          <input
            type="text"
            value={form.office}
            onChange={(e) => setForm({ ...form, office: e.target.value })}
            placeholder="DNX"
            className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3.5 py-2.5 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white transition"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1">
            Default Hours / Day
          </label>
          <input
            type="number"
            step="0.5"
            min="0"
            max="24"
            value={form.default_daily_hours}
            onChange={(e) => setForm({ ...form, default_daily_hours: Number(e.target.value) })}
            className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3.5 py-2.5 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white transition"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1">
          Default Verified By / Supervisor
        </label>
        <input
          type="text"
          value={form.default_verifier}
          onChange={(e) => setForm({ ...form, default_verifier: e.target.value })}
          placeholder="Optional — leave blank for wet-ink initials"
          className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3.5 py-2.5 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white transition"
        />
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#D97757] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#C86343] disabled:opacity-60 transition cursor-pointer shadow-2xs"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? "Saving..." : "Save Profile Defaults"}</span>
        </button>
      </div>
    </form>
  );
}
