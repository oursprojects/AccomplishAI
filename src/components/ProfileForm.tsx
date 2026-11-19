"use client";

import { useState } from "react";
import type { Profile } from "@/lib/supabase/database.types";

type EditableProfile = Pick<
  Profile,
  "name_last_first" | "name_first_last" | "office" | "default_verifier" | "default_daily_hours"
>;

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
      className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4"
    >
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Intern Profile Defaults</h1>
        <p className="mt-1 text-sm text-slate-600">
          Recurring values auto-fill every report unless your notes override them.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
          Profile defaults saved.
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Header Name (<span className="font-mono text-xs">LASTNAME, FIRSTNAME MI.</span>)
        </label>
        <input
          type="text"
          value={form.name_last_first}
          onChange={(e) => setForm({ ...form, name_last_first: e.target.value })}
          placeholder="DELA CRUZ, JUAN A."
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Signature Name (<span className="font-mono text-xs">FIRSTNAME MI. LASTNAME</span>)
        </label>
        <input
          type="text"
          value={form.name_first_last}
          onChange={(e) => setForm({ ...form, name_first_last: e.target.value })}
          placeholder="JUAN A. DELA CRUZ"
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Default Office</label>
          <input
            type="text"
            value={form.office}
            onChange={(e) => setForm({ ...form, office: e.target.value })}
            placeholder="YML"
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Default Hours / Day</label>
          <input
            type="number"
            step="0.5"
            min="0"
            max="24"
            value={form.default_daily_hours}
            onChange={(e) => setForm({ ...form, default_daily_hours: Number(e.target.value) })}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Default Verified By / Supervisor</label>
        <input
          type="text"
          value={form.default_verifier}
          onChange={(e) => setForm({ ...form, default_verifier: e.target.value })}
          placeholder="Optional — leave blank for wet-ink initials"
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
        />
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="w-full sm:w-auto rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 transition cursor-pointer"
        >
          {saving ? "Saving..." : "Save Defaults"}
        </button>
      </div>
    </form>
  );
}
