"use client";

import { Calculator, CalendarDays, Check, CheckCheck, Save, Sparkles, UserCheck } from "lucide-react";
import { DAYS, type ReportData, type ReportKey } from "@/lib/report-schema";

const DAY_LABELS: Record<(typeof DAYS)[number], { short: string; full: string }> = {
  mon: { short: "M", full: "Monday" },
  tue: { short: "T", full: "Tuesday" },
  wed: { short: "W", full: "Wednesday" },
  thu: { short: "T", full: "Thursday" },
  fri: { short: "F", full: "Friday" },
};

function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getWorkweekDates(offsetWeeks = 0): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun..6=Sat
  const diffToMonday = (day === 0 ? -6 : 1 - day) + offsetWeeks * 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMonday);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  return { from: formatLongDate(mon), to: formatLongDate(fri) };
}

interface ReportEditorProps {
  title: string;
  onTitleChange: (title: string) => void;
  data: ReportData;
  onChange: (next: ReportData) => void;
  onSave: () => void;
  saving: boolean;
  savedId: string | null;
  hasChanges: boolean;
  defaultVerifier?: string;
  defaultDailyHours?: number;
  previousTotalHours?: string;
}

export function ReportEditor({
  title,
  onTitleChange,
  data,
  onChange,
  onSave,
  saving,
  savedId,
  hasChanges,
  defaultVerifier = "",
  defaultDailyHours = 8,
  previousTotalHours = "",
}: ReportEditorProps) {
  function setField(key: ReportKey, value: string) {
    onChange({ ...data, [key]: value });
  }

  function applyWeek(offsetWeeks: number) {
    const { from, to } = getWorkweekDates(offsetWeeks);
    onChange({ ...data, date_from: from, date_to: to });
  }

  function applyVerifierToWorkedDays() {
    const existingVerifier =
      DAYS.map((d) => data[`${d}_verified_by`].trim()).find(Boolean) || defaultVerifier.trim();
    if (!existingVerifier) return;
    const next = { ...data };
    for (const d of DAYS) {
      if (next[`${d}_accomplishments`].trim() && !next[`${d}_verified_by`].trim()) {
        next[`${d}_verified_by`] = existingVerifier;
      }
    }
    onChange(next);
  }

  function autoCalcHours() {
    const workedDays = DAYS.filter((d) => data[`${d}_accomplishments`].trim().length > 0).length;
    const hoursPerDay = Number(defaultDailyHours) > 0 ? Number(defaultDailyHours) : 8;
    const weekHours = workedDays * hoursPerDay;
    const prevNum = parseFloat(previousTotalHours);
    const totalHours = Number.isFinite(prevNum) ? prevNum + weekHours : weekHours;
    onChange({
      ...data,
      hours_this_week: weekHours > 0 ? String(weekHours) : data.hours_this_week,
      total_hours_worked: weekHours > 0 ? String(totalHours) : data.total_hours_worked,
    });
  }

  function fillNoneReflections() {
    onChange({
      ...data,
      new_trainings: data.new_trainings.trim() ? data.new_trainings : "None",
      problems_encountered: data.problems_encountered.trim() ? data.problems_encountered : "None",
      solutions_done: data.solutions_done.trim() ? data.solutions_done : "None",
    });
  }

  const workedDaysCount = DAYS.filter((d) => data[`${d}_accomplishments`].trim().length > 0).length;
  const completedSections = [
    Boolean(data.intern_name_last_first.trim() && data.intern_name_first_last.trim()),
    Boolean(data.office.trim()),
    Boolean(data.date_from.trim() && data.date_to.trim()),
    workedDaysCount > 0,
    Boolean(data.hours_this_week.trim()),
    Boolean(data.total_hours_worked.trim()),
  ].filter(Boolean).length;

  const canFillVerifier = Boolean(
    defaultVerifier.trim() || DAYS.some((d) => data[`${d}_verified_by`].trim().length > 0),
  );

  return (
    <div className="space-y-4">
      {/* Quick readiness strip */}
      <div className="rounded-2xl border border-[#E6E2D8] bg-[#F7F6F0] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-[#4A463F]">
          <CheckCheck className="h-4 w-4 text-[#D97757]" />
          <span>
            <strong>{completedSections}/6</strong> main sections filled · <strong>{workedDaysCount}</strong> day
            {workedDaysCount === 1 ? "" : "s"} logged
          </span>
        </div>
        <span className="text-[11px] text-[#7A746B]">Blank fields stay clean for handwritten/wet-ink signing</span>
      </div>

      {/* Header metadata */}
      <div className="rounded-2xl border border-[#E6E2D8] bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#1F1E1C]">Report Title, Header &amp; Period</h3>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => applyWeek(0)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#DDD7CB] bg-[#FAF9F5] px-2 py-1 text-[11px] font-medium text-[#4A463F] hover:bg-[#F4F2EA] cursor-pointer"
              title="Fill Monday–Friday dates for this week"
            >
              <CalendarDays className="h-3 w-3 text-[#D97757]" />
              <span>This Week</span>
            </button>
            <button
              type="button"
              onClick={() => applyWeek(-1)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#DDD7CB] bg-[#FAF9F5] px-2 py-1 text-[11px] font-medium text-[#4A463F] hover:bg-[#F4F2EA] cursor-pointer"
              title="Fill Monday–Friday dates for last week"
            >
              <span>Last Week</span>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A463F] mb-1">Report Name (shown in History)</label>
          <input
            type="text"
            maxLength={120}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g. Week 1 — DNX Landing Page (or leave blank to use dates)"
            className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#4A463F] mb-1">
              Student Intern (LASTNAME, FIRSTNAME MI.)
            </label>
            <input
              type="text"
              value={data.intern_name_last_first}
              onChange={(e) => setField("intern_name_last_first", e.target.value)}
              placeholder="DELA CRUZ, JUAN A."
              className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A463F] mb-1">Office</label>
            <input
              type="text"
              value={data.office}
              onChange={(e) => setField("office", e.target.value)}
              placeholder="DNX"
              className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A463F] mb-1">From</label>
            <input
              type="text"
              value={data.date_from}
              onChange={(e) => setField("date_from", e.target.value)}
              placeholder="November 16, 2026"
              className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A463F] mb-1">To</label>
            <input
              type="text"
              value={data.date_to}
              onChange={(e) => setField("date_to", e.target.value)}
              placeholder="November 20, 2026"
              className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white"
            />
          </div>
        </div>
      </div>

      {/* Daily M-F accomplishments */}
      <div className="rounded-2xl border border-[#E6E2D8] bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#1F1E1C]">Daily Accomplishments (M – F)</h3>
            <p className="text-xs text-[#6B665E] mt-0.5">
              Put one accomplishment per line — each line renders as a Word bullet.
            </p>
          </div>
          {canFillVerifier && workedDaysCount > 0 && (
            <button
              type="button"
              onClick={applyVerifierToWorkedDays}
              className="inline-flex items-center gap-1 rounded-lg border border-[#DDD7CB] bg-[#FAF9F5] px-2.5 py-1 text-[11px] font-medium text-[#4A463F] hover:bg-[#F4F2EA] cursor-pointer"
              title="Copy verifier name into all empty worked days"
            >
              <UserCheck className="h-3 w-3 text-[#D97757]" />
              <span>Fill Verifiers</span>
            </button>
          )}
        </div>

        <div className="space-y-3">
          {DAYS.map((day) => {
            const accKey = `${day}_accomplishments` as ReportKey;
            const verKey = `${day}_verified_by` as ReportKey;
            return (
              <div key={day} className="rounded-xl border border-[#EAE6DC] bg-[#FAF9F5]/80 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#1F1E1C] text-xs font-semibold text-white">
                      {DAY_LABELS[day].short}
                    </span>
                    <span className="text-xs font-semibold text-[#1F1E1C]">{DAY_LABELS[day].full}</span>
                  </div>
                  <input
                    type="text"
                    value={data[verKey]}
                    onChange={(e) => setField(verKey, e.target.value)}
                    placeholder="Verified by (optional)"
                    className="w-40 sm:w-48 rounded-lg border border-[#DDD7CB] bg-white px-2.5 py-1 text-xs text-[#1F1E1C] outline-none focus:border-[#D97757]"
                  />
                </div>
                <textarea
                  rows={2}
                  value={data[accKey]}
                  onChange={(e) => setField(accKey, e.target.value)}
                  placeholder={`What you accomplished on ${DAY_LABELS[day].full}...`}
                  className="w-full rounded-xl border border-[#DDD7CB] bg-white px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] resize-y"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Hours & reflections */}
      <div className="rounded-2xl border border-[#E6E2D8] bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#1F1E1C]">Hours, Reflections &amp; Signature</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {workedDaysCount > 0 && (
              <button
                type="button"
                onClick={autoCalcHours}
                className="inline-flex items-center gap-1 rounded-lg border border-[#DDD7CB] bg-[#FAF9F5] px-2.5 py-1 text-[11px] font-medium text-[#4A463F] hover:bg-[#F4F2EA] cursor-pointer"
                title={`Calculate ${workedDaysCount} worked day(s) × ${defaultDailyHours} hrs/day`}
              >
                <Calculator className="h-3 w-3 text-[#D97757]" />
                <span>Auto-calc Hours</span>
              </button>
            )}
            <button
              type="button"
              onClick={fillNoneReflections}
              className="inline-flex items-center gap-1 rounded-lg border border-[#DDD7CB] bg-[#FAF9F5] px-2.5 py-1 text-[11px] font-medium text-[#4A463F] hover:bg-[#F4F2EA] cursor-pointer"
              title="Fill 'None' into empty trainings, problems, or solutions"
            >
              <Sparkles className="h-3 w-3 text-[#D97757]" />
              <span>Fill &ldquo;None&rdquo;</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#4A463F] mb-1">Hours Worked This Week</label>
            <input
              type="text"
              value={data.hours_this_week}
              onChange={(e) => setField("hours_this_week", e.target.value)}
              placeholder="40"
              className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A463F] mb-1">Total Hours Worked</label>
            <input
              type="text"
              value={data.total_hours_worked}
              onChange={(e) => setField("total_hours_worked", e.target.value)}
              placeholder={previousTotalHours ? `Prev: ${previousTotalHours}` : "120"}
              className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A463F] mb-1">New training/s took place this week</label>
          <textarea
            rows={2}
            value={data.new_trainings}
            onChange={(e) => setField("new_trainings", e.target.value)}
            placeholder="One item per line (or None)"
            className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A463F] mb-1">Problems encountered this week</label>
          <textarea
            rows={2}
            value={data.problems_encountered}
            onChange={(e) => setField("problems_encountered", e.target.value)}
            placeholder="One item per line (or None)"
            className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A463F] mb-1">Solutions done to solve the problem/s</label>
          <textarea
            rows={2}
            value={data.solutions_done}
            onChange={(e) => setField("solutions_done", e.target.value)}
            placeholder="One item per line (or None)"
            className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A463F] mb-1">
            Prepared by (FIRSTNAME MI. LASTNAME)
          </label>
          <input
            type="text"
            value={data.intern_name_first_last}
            onChange={(e) => setField("intern_name_first_last", e.target.value)}
            placeholder="JUAN A. DELA CRUZ"
            className="w-full rounded-xl border border-[#DDD7CB] bg-[#FAF9F5] px-3 py-2 text-sm text-[#1F1E1C] outline-none focus:border-[#D97757] focus:bg-white"
          />
          <p className="mt-1 text-[11px] text-[#7A746B]">
            Noted by (NIÑO R. GUILLERMO) and the wet-ink Date line remain untouched on the official form.
          </p>
        </div>

        <div className="pt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !hasChanges}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#1F1E1C] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#33312E] disabled:opacity-45 disabled:cursor-not-allowed transition cursor-pointer"
          >
            {hasChanges ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            <span>
              {saving
                ? "Saving..."
                : !hasChanges
                  ? "No Changes to Save"
                  : savedId
                    ? "Update Saved Report"
                    : "Save Report to History"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
