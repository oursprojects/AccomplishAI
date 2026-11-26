"use client";

import { useEffect, useState } from "react";
import { CalendarDays, PenLine, Save, UserRound } from "lucide-react";
import { parseJsonResponse } from "@/lib/client-json";
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
> & {
  holiday_mondays: string[];
};

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

  useEffect(() => {
    if (!hasChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasChanges]);

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
      const json = await parseJsonResponse<{ profile?: EditableProfile; error?: string }>(res);
      if (!res.ok || !json?.profile) {
        throw new Error(json?.error ?? `Failed to save profile (HTTP ${res.status}).`);
      }
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
    <form onSubmit={handleSubmit} className="mx-auto max-w-6xl space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF4FF] text-[#1D4ED8] border border-[#C7D7FE]">
            <UserRound className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-light tracking-tight text-[#141413]">
              Intern Profile &amp; Calendar Anchor
            </h1>
            <p className="mt-0.5 text-sm text-[#5C5C57]">
              Saved details and your internship start date automatically fill Week 1, Week 2, etc. (Monday–Friday).
            </p>
          </div>
        </div>

        <Button type="submit" variant="accent" size="lg" disabled={saving || !hasChanges} className="self-start sm:self-center shrink-0">
          <Save className="h-4 w-4" />
          <span>{saving ? "Saving..." : hasChanges ? "Save Profile Defaults" : "Saved"}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <Card className="lg:col-span-5 p-5 sm:p-6 space-y-4">
          <div className="border-b border-[#F1F1EE] pb-3">
            <h2 className="text-sm font-semibold text-[#141413]">Intern Identity &amp; Signatories</h2>
            <p className="text-xs text-[#5C5C57]">Used to auto-fill headers and verified-by columns on new reports.</p>
          </div>

          <div>
            <label htmlFor="profile-name-last-first" className="block text-xs font-semibold uppercase tracking-wide text-[#52524E] mb-1">
              Header Name (<span className="font-mono normal-case">LASTNAME, FIRSTNAME MI.</span>)
            </label>
            <Input
              id="profile-name-last-first"
              type="text"
              value={form.name_last_first}
              onChange={(e) => setForm({ ...form, name_last_first: e.target.value.toUpperCase() })}
              placeholder="DELA CRUZ, JUAN A."
              className="uppercase"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label htmlFor="profile-name-first-last" className="block text-xs font-semibold uppercase tracking-wide text-[#52524E]">
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
                  className="h-6 px-2 text-[11px] text-[#1E40AF]"
                >
                  <PenLine className="h-3 w-3" />
                  <span>Auto-fill</span>
                </Button>
              )}
            </div>
            <Input
              id="profile-name-first-last"
              type="text"
              value={form.name_first_last}
              onChange={(e) => setForm({ ...form, name_first_last: e.target.value.toUpperCase() })}
              placeholder="JUAN A. DELA CRUZ"
              className="uppercase"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-office" className="block text-xs font-semibold uppercase tracking-wide text-[#52524E] mb-1">
                Default Office / Company
              </label>
              <Input
                id="profile-office"
                type="text"
                value={form.office}
                onChange={(e) => setForm({ ...form, office: e.target.value })}
                placeholder="DNX"
              />
            </div>

            <div>
              <label htmlFor="profile-daily-hours" className="block text-xs font-semibold uppercase tracking-wide text-[#52524E] mb-1">
                Default Hours / Day
              </label>
              <Input
                id="profile-daily-hours"
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
            <label htmlFor="profile-default-verifier" className="block text-xs font-semibold uppercase tracking-wide text-[#52524E] mb-1">
              Default Verified By / Supervisor
            </label>
            <Input
              id="profile-default-verifier"
              type="text"
              value={form.default_verifier}
              onChange={(e) => setForm({ ...form, default_verifier: e.target.value.toUpperCase() })}
              placeholder="Optional — leave blank for wet-ink initials"
              className="uppercase"
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label htmlFor="profile-target-ojt-hours" className="block text-xs font-semibold uppercase tracking-wide text-[#52524E]">
                Required OJT Hours Target
              </label>
              <div className="flex flex-wrap items-center gap-1">
                {[240, 300, 400, 486, 500].map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    disabled={saving}
                    onClick={() => setForm({ ...form, target_ojt_hours: hrs })}
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/40 transition disabled:pointer-events-none disabled:opacity-50 ${
                      form.target_ojt_hours === hrs
                        ? "border-[#1D4ED8] bg-[#EFF4FF] text-[#1E40AF]"
                        : "border-[#D8D8D0] bg-white text-[#52524E] hover:bg-[#F1F1EE]"
                    }`}
                  >
                    {hrs}h
                  </button>
                ))}
              </div>
            </div>
            <Input
              id="profile-target-ojt-hours"
              type="number"
              min={40}
              max={5000}
              value={form.target_ojt_hours}
              onChange={(e) => setForm({ ...form, target_ojt_hours: Number(e.target.value) || 486 })}
            />
          </div>
        </Card>

        {/* Internship Start Date Calendar */}
        <Card className="lg:col-span-7 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F1EE] pb-3">
            <div>
              <label htmlFor="profile-start-date" className="text-sm font-semibold text-[#141413] flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-[#1D4ED8]" />
                <span>Internship Start Date (Week 1) &amp; Holidays</span>
              </label>
              <p className="text-xs text-[#5C5C57]">
                Set Week 1 Monday and click any week bar on the calendar to toggle holiday breaks.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="profile-start-date"
                type="date"
                value={form.internship_start_date ?? ""}
                onChange={(e) => setForm({ ...form, internship_start_date: e.target.value || null })}
                className="h-9 sm:h-8 w-40 bg-[#F8F8F6] focus:bg-white text-sm sm:text-xs"
              />
              {form.internship_start_date && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => setForm({ ...form, internship_start_date: null })}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E2DC] bg-[#F8F8F6]/70 p-3 sm:p-4">
            <InternshipCalendar
              mode="anchor"
              startDateIso={form.internship_start_date}
              holidayMondays={form.holiday_mondays}
              onToggleHolidayWeek={(mondayIso) => {
                setForm((prev) => {
                  const exists = prev.holiday_mondays.includes(mondayIso);
                  return {
                    ...prev,
                    holiday_mondays: exists
                      ? prev.holiday_mondays.filter((m) => m !== mondayIso)
                      : [...prev.holiday_mondays, mondayIso].sort(),
                  };
                });
              }}
              onSelectAnchor={(iso) => setForm({ ...form, internship_start_date: iso })}
            />
          </div>

          <div className="pt-1 flex justify-end lg:hidden">
            <Button type="submit" variant="accent" size="lg" disabled={saving || !hasChanges} className="w-full sm:w-auto">
              <Save className="h-4 w-4" />
              <span>{saving ? "Saving..." : hasChanges ? "Save Profile Defaults" : "Saved"}</span>
            </Button>
          </div>
        </Card>
      </div>
    </form>
  );
}
