"use client";

import { useState } from "react";
import {
  Calculator,
  CalendarDays,
  Check,
  CheckCheck,
  PenLine,
  RotateCcw,
  Save,
  Undo2,
  UserCheck,
  X,
} from "lucide-react";
import { normalizeDateToLongFormat, parseHoursNumber } from "@/lib/internship-calendar";
import { DAYS, type ReportData, type ReportKey } from "@/lib/report-schema";
import { AccomplishCheckIcon } from "@/components/icons/AccomplishIcons";
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
import { Textarea } from "@/components/ui/textarea";
import { InternshipCalendar } from "./InternshipCalendar";

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
  const day = now.getDay();
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
  onUndo: () => void;
  onCancelChanges: () => void;
  canUndo: boolean;
  saving: boolean;
  hasChanges: boolean;
  defaultVerifier?: string;
  defaultDailyHours?: number;
  previousTotalHours?: string;
  internshipStartDate?: string | null;
  holidayMondays?: string[];
}

export function ReportEditor({
  title,
  onTitleChange,
  data,
  onChange,
  onSave,
  onUndo,
  onCancelChanges,
  canUndo,
  saving,
  hasChanges,
  defaultVerifier = "",
  defaultDailyHours = 8,
  previousTotalHours = "",
  internshipStartDate = null,
  holidayMondays = [],
}: ReportEditorProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  function setField(key: ReportKey, value: string) {
    if (key === "intern_name_last_first" || key === "intern_name_first_last" || key.endsWith("_verified_by")) {
      onChange({ ...data, [key]: value.toUpperCase() });
      return;
    }
    if (key === "hours_this_week") {
      const weekNum = parseHoursNumber(value);
      const prevNum = parseHoursNumber(previousTotalHours) ?? 0;
      if (weekNum !== null) {
        onChange({
          ...data,
          hours_this_week: value,
          total_hours_worked: String(prevNum + weekNum),
        });
        return;
      }
    }
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
    const prevNum = parseHoursNumber(previousTotalHours) ?? 0;
    const totalHours = prevNum + weekHours;
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
      {/* Quick readiness & Undo / Cancel strip */}
      <Card className="bg-[#F7F6F0] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-[#4A463F]">
          <CheckCheck className="h-4 w-4 text-[#D97757]" />
          <span>
            <strong>{completedSections}/6</strong> main sections · <strong>{workedDaysCount}</strong> day
            {workedDaysCount === 1 ? "" : "s"} logged
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {canUndo && (
            <Button type="button" size="sm" variant="outline" onClick={onUndo}>
              <Undo2 className="h-3 w-3 text-[#D97757]" />
              <span>Undo</span>
            </Button>
          )}
          {hasChanges && (
            <Button type="button" size="sm" variant="outline" onClick={onCancelChanges}>
              <RotateCcw className="h-3 w-3" />
              <span>Cancel Edits</span>
            </Button>
          )}
        </div>
      </Card>

      {/* Header metadata */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#1F1E1C] flex items-center gap-1.5">
            <PenLine className="h-3.5 w-3.5 text-[#D97757]" />
            <span>Report Title, Header &amp; Period</span>
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" variant="accent" onClick={() => setCalendarOpen(true)}>
              <CalendarDays className="h-3 w-3" />
              <span>Week Calendar</span>
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => applyWeek(0)}>
              <span>This Week</span>
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => applyWeek(-1)}>
              <span>Last Week</span>
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A463F] mb-1">Report Name</label>
          <Input
            type="text"
            maxLength={120}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g. Week 1 — DNX Landing Page (or leave blank to use dates)"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#4A463F] mb-1">
              Student Intern (LASTNAME, FIRSTNAME MI.)
            </label>
            <Input
              type="text"
              value={data.intern_name_last_first}
              onChange={(e) => setField("intern_name_last_first", e.target.value)}
              placeholder="DELA CRUZ, JUAN A."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A463F] mb-1">Office</label>
            <Input
              type="text"
              value={data.office}
              onChange={(e) => setField("office", e.target.value)}
              placeholder="DNX"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A463F] mb-1">Period From</label>
            <Input
              type="text"
              value={data.date_from}
              onChange={(e) => setField("date_from", e.target.value)}
              onBlur={() => {
                const norm = normalizeDateToLongFormat(data.date_from);
                if (norm !== data.date_from) setField("date_from", norm);
              }}
              placeholder="November 9, 2026"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A463F] mb-1">Period To</label>
            <Input
              type="text"
              value={data.date_to}
              onChange={(e) => setField("date_to", e.target.value)}
              onBlur={() => {
                const norm = normalizeDateToLongFormat(data.date_to);
                if (norm !== data.date_to) setField("date_to", norm);
              }}
              placeholder="November 13, 2026"
            />
          </div>
        </div>
      </Card>

      {/* Daily M-F accomplishments */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#1F1E1C]">Daily Accomplishments (M – F)</h3>
            <p className="text-xs text-[#6B665E] mt-0.5">
              One accomplished task per line — each line renders as a Word bullet.
            </p>
          </div>
          {canFillVerifier && workedDaysCount > 0 && (
            <Button type="button" size="sm" variant="secondary" onClick={applyVerifierToWorkedDays}>
              <UserCheck className="h-3 w-3 text-[#D97757]" />
              <span>Fill Verifiers</span>
            </Button>
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
                  <Input
                    type="text"
                    value={data[verKey]}
                    onChange={(e) => setField(verKey, e.target.value)}
                    placeholder="Verified by (optional)"
                    className="h-8 w-40 sm:w-48 bg-white text-xs"
                  />
                </div>
                <Textarea
                  rows={2}
                  value={data[accKey]}
                  onChange={(e) => setField(accKey, e.target.value)}
                  placeholder={`Tasks accomplished on ${DAY_LABELS[day].full}...`}
                  className="bg-white resize-y"
                />
              </div>
            );
          })}
        </div>
      </Card>

      {/* Hours & reflections */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#1F1E1C]">Hours, Reflections &amp; Signature</h3>
            {previousTotalHours && (
              <p className="text-[11px] text-[#6B665E]">
                Previous cumulative total: <strong>{previousTotalHours} hrs</strong> (automatically added to this week)
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {workedDaysCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={autoCalcHours}
                title={`Calculate ${workedDaysCount} worked day(s) × ${defaultDailyHours} hrs/day + previous total`}
              >
                <Calculator className="h-3 w-3 text-[#D97757]" />
                <span>Auto-calc Hours</span>
              </Button>
            )}
            <Button type="button" size="sm" variant="secondary" onClick={fillNoneReflections}>
              <AccomplishCheckIcon className="h-3 w-3 text-[#D97757]" />
              <span>Fill &ldquo;None&rdquo;</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#4A463F] mb-1">Hours Worked This Week</label>
            <Input
              type="text"
              value={data.hours_this_week}
              onChange={(e) => setField("hours_this_week", e.target.value)}
              placeholder="40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A463F] mb-1">
              Total Hours Worked (Prev + This Week)
            </label>
            <Input
              type="text"
              value={data.total_hours_worked}
              onChange={(e) => setField("total_hours_worked", e.target.value)}
              placeholder={previousTotalHours ? `${previousTotalHours} + week` : "40"}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A463F] mb-1">New training/s took place this week</label>
          <Textarea
            rows={2}
            value={data.new_trainings}
            onChange={(e) => setField("new_trainings", e.target.value)}
            placeholder="One item per line (or None)"
            className="resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A463F] mb-1">Problems encountered this week</label>
          <Textarea
            rows={2}
            value={data.problems_encountered}
            onChange={(e) => setField("problems_encountered", e.target.value)}
            placeholder="One item per line (or None)"
            className="resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A463F] mb-1">Solutions done to solve the problem/s</label>
          <Textarea
            rows={2}
            value={data.solutions_done}
            onChange={(e) => setField("solutions_done", e.target.value)}
            placeholder="One item per line (or None)"
            className="resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A463F] mb-1">
            Prepared by (FIRSTNAME MI. LASTNAME)
          </label>
          <Input
            type="text"
            value={data.intern_name_first_last}
            onChange={(e) => setField("intern_name_first_last", e.target.value)}
            placeholder="JUAN A. DELA CRUZ"
          />
          <p className="mt-1 text-[11px] text-[#7A746B]">
            Noted by (NIÑO R. GUILLERMO) and the wet-ink Date line remain untouched on the official form.
          </p>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
          {hasChanges && (
            <Button type="button" variant="outline" onClick={onCancelChanges} disabled={saving}>
              <RotateCcw className="h-4 w-4" />
              <span>Cancel</span>
            </Button>
          )}
          <Button type="button" onClick={onSave} disabled={saving || !hasChanges}>
            {hasChanges ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            <span>{saving ? "Saving..." : !hasChanges ? "All Changes Saved" : "Save Changes"}</span>
          </Button>
        </div>
      </Card>

      {/* Week / Custom Range Calendar Picker Modal */}
      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <DialogTitle>Edit Report Dates &amp; Schedule</DialogTitle>
                <DialogDescription>
                  Pick a Monday–Friday week or switch to Custom Dates for partial or holiday weeks.
                </DialogDescription>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => setCalendarOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="px-5 py-2">
            <InternshipCalendar
              mode="week"
              startDateIso={internshipStartDate}
              selectedFromText={data.date_from}
              selectedToText={data.date_to}
              holidayMondays={holidayMondays}
              onSelectWeek={(wk) => {
                onChange({ ...data, date_from: wk.fromText, date_to: wk.toText });
                if (wk.weekNumber && (!title.trim() || /^Week \d+$/i.test(title.trim()))) {
                  onTitleChange(`Week ${wk.weekNumber}`);
                }
                setCalendarOpen(false);
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCalendarOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
