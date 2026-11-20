"use client";

import { useState } from "react";
import { CalendarDays, PenLine, Save, UserRound } from "lucide-react";
import type { Profile } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { InternshipCalendar } from "./InternshipCalendar";

type EditableProfile = Pick<
  Profile,
  | "name_last_first"
  | "name_first_last"
  | "office"
  | "default_verifier"
  | "default_daily_hours"
  | "internship_start_date"
  | "target_ojt_hours"
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
  const [savedBaseline, setSavedBaseline] = useState<EditableProfile>(initial);
  const [saving, setSaving] = useState(false);

  const hasChanges = JSON.stringify(form) !== JSON.stringify(savedBaseline);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasChanges || saving) return;
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
      setSavedBaseline(json.profile);
      toast.success("Profile & internship calendar defaults saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mx-auto max-w-xl p-5 sm:p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDF3EF] text-[#D97757] border border-[#F0D5C9]">
            <UserRound className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-[#1F1E1C]">Intern Profile &amp; Calendar Anchor</h1>
            <p className="mt-0.5 text-sm text-[#6B665E]">
              Saved details and your internship start date automatically fill Week 1, Week 2, etc. (Monday–Friday).
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1">
            Header Name (<span className="font-mono normal-case">LASTNAME, FIRSTNAME MI.</span>)
          </label>
          <Input
            type="text"
            value={form.name_last_first}
            onChange={(e) => setForm({ ...form, name_last_first: e.target.value.toUpperCase() })}
            placeholder="DELA CRUZ, JUAN A."
            className="uppercase"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#57544E]">
              Signature Name (<span className="font-mono normal-case">FIRSTNAME MI. LASTNAME</span>)
            </label>
            {form.name_last_first.includes(",") && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const formatted = deriveSignatureName(form.name_last_first).toUpperCase();
                  if (formatted) setForm({ ...form, name_first_last: formatted });
                }}
                className="h-6 px-2 text-[11px] text-[#C86343]"
              >
                <PenLine className="h-3 w-3" />
                <span>Auto-fill</span>
              </Button>
            )}
          </div>
          <Input
            type="text"
            value={form.name_first_last}
            onChange={(e) => setForm({ ...form, name_first_last: e.target.value.toUpperCase() })}
            placeholder="JUAN A. DELA CRUZ"
            className="uppercase"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1">
              Default Office / Company
            </label>
            <Input
              type="text"
              value={form.office}
              onChange={(e) => setForm({ ...form, office: e.target.value })}
              placeholder="DNX"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1">
              Default Hours / Day
            </label>
            <Input
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={form.default_daily_hours}
              onChange={(e) => setForm({ ...form, default_daily_hours: Number(e.target.value) })}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1">
            Default Verified By / Supervisor
          </label>
          <Input
            type="text"
            value={form.default_verifier}
            onChange={(e) => setForm({ ...form, default_verifier: e.target.value.toUpperCase() })}
            placeholder="Optional — leave blank for wet-ink initials"
            className="uppercase"
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#57544E]">
              Required OJT Hours Target
            </label>
            <div className="flex items-center gap-1">
              {[240, 300, 400, 486, 500].map((hrs) => (
                <button
                  key={hrs}
                  type="button"
                  onClick={() => setForm({ ...form, target_ojt_hours: hrs })}
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium cursor-pointer transition ${
                    form.target_ojt_hours === hrs
                      ? "border-[#D97757] bg-[#FDF3EF] text-[#C86343]"
                      : "border-[#DDD7CB] bg-white text-[#57544E] hover:bg-[#F4F2EA]"
                  }`}
                >
                  {hrs}h
                </button>
              ))}
            </div>
          </div>
          <Input
            type="number"
            min={40}
            max={5000}
            value={form.target_ojt_hours}
            onChange={(e) => setForm({ ...form, target_ojt_hours: Number(e.target.value) || 486 })}
          />
        </div>

        {/* Internship Start Date Calendar */}
        <div className="rounded-2xl border border-[#E6E2D8] bg-[#FAF9F5]/80 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-[#57544E] flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-[#D97757]" />
              <span>Internship Start Date (Week 1)</span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={form.internship_start_date ?? ""}
                onChange={(e) => setForm({ ...form, internship_start_date: e.target.value || null })}
                className="h-8 w-40 bg-white text-xs"
              />
              {form.internship_start_date && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setForm({ ...form, internship_start_date: null })}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#E6E2D8] bg-white p-3">
            <InternshipCalendar
              mode="anchor"
              startDateIso={form.internship_start_date}
              onSelectAnchor={(iso) => setForm({ ...form, internship_start_date: iso })}
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button type="submit" variant="accent" size="lg" disabled={saving || !hasChanges}>
            <Save className="h-4 w-4" />
            <span>{saving ? "Saving..." : hasChanges ? "Save Profile Defaults" : "Saved"}</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}
