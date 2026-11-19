"use client";

import { Check, Save } from "lucide-react";
import { DAYS, type ReportData, type ReportKey } from "@/lib/report-schema";

const DAY_LABELS: Record<(typeof DAYS)[number], { short: string; full: string }> = {
  mon: { short: "M", full: "Monday" },
  tue: { short: "T", full: "Tuesday" },
  wed: { short: "W", full: "Wednesday" },
  thu: { short: "T", full: "Thursday" },
  fri: { short: "F", full: "Friday" },
};

interface ReportEditorProps {
  title: string;
  onTitleChange: (title: string) => void;
  data: ReportData;
  onChange: (next: ReportData) => void;
  onSave: () => void;
  saving: boolean;
  savedId: string | null;
  hasChanges: boolean;
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
}: ReportEditorProps) {
  function setField(key: ReportKey, value: string) {
    onChange({ ...data, [key]: value });
  }

  return (
    <div className="space-y-5">
      {/* Header metadata */}
      <div className="rounded-2xl border border-[#E6E2D8] bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1F1E1C]">Report Title, Header &amp; Period</h3>
          <span className="text-[11px] text-[#7A746B]">Live preview updates automatically</span>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A463F] mb-1">
            Report Name (shown in History)
          </label>
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
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Student Intern (LASTNAME, FIRSTNAME MI.)
            </label>
            <input
              type="text"
              value={data.intern_name_last_first}
              onChange={(e) => setField("intern_name_last_first", e.target.value)}
              placeholder="DELA CRUZ, JUAN A."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Office</label>
            <input
              type="text"
              value={data.office}
              onChange={(e) => setField("office", e.target.value)}
              placeholder="YML"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
            <input
              type="text"
              value={data.date_from}
              onChange={(e) => setField("date_from", e.target.value)}
              placeholder="November 16, 2026"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
            <input
              type="text"
              value={data.date_to}
              onChange={(e) => setField("date_to", e.target.value)}
              placeholder="November 20, 2026"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Daily M-F accomplishments */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Daily Accomplishments (M – F)</h3>
          <p className="text-xs text-slate-500 mt-0.5">Put one accomplishment per line — each line renders as a Word bullet.</p>
        </div>

        <div className="space-y-3">
          {DAYS.map((day) => {
            const accKey = `${day}_accomplishments` as ReportKey;
            const verKey = `${day}_verified_by` as ReportKey;
            return (
              <div key={day} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-xs font-semibold text-white">
                      {DAY_LABELS[day].short}
                    </span>
                    <span className="text-xs font-semibold text-slate-800">{DAY_LABELS[day].full}</span>
                  </div>
                  <input
                    type="text"
                    value={data[verKey]}
                    onChange={(e) => setField(verKey, e.target.value)}
                    placeholder="Verified by (optional)"
                    className="w-40 sm:w-48 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 outline-none focus:border-slate-900"
                  />
                </div>
                <textarea
                  rows={2}
                  value={data[accKey]}
                  onChange={(e) => setField(accKey, e.target.value)}
                  placeholder={`What you accomplished on ${DAY_LABELS[day].full}...`}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 resize-y"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Hours & reflections */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Hours, Reflections & Signature</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Hours Worked This Week</label>
            <input
              type="text"
              value={data.hours_this_week}
              onChange={(e) => setField("hours_this_week", e.target.value)}
              placeholder="40"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Total Hours Worked</label>
            <input
              type="text"
              value={data.total_hours_worked}
              onChange={(e) => setField("total_hours_worked", e.target.value)}
              placeholder="120"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">New training/s took place this week</label>
          <textarea
            rows={2}
            value={data.new_trainings}
            onChange={(e) => setField("new_trainings", e.target.value)}
            placeholder="One item per line"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Problems encountered this week</label>
          <textarea
            rows={2}
            value={data.problems_encountered}
            onChange={(e) => setField("problems_encountered", e.target.value)}
            placeholder="One item per line"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Solutions done to solve the problem/s</label>
          <textarea
            rows={2}
            value={data.solutions_done}
            onChange={(e) => setField("solutions_done", e.target.value)}
            placeholder="One item per line"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Prepared by (FIRSTNAME MI. LASTNAME)
          </label>
          <input
            type="text"
            value={data.intern_name_first_last}
            onChange={(e) => setField("intern_name_first_last", e.target.value)}
            placeholder="JUAN A. DELA CRUZ"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
          />
          <p className="mt-1 text-[11px] text-slate-500">
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
