"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CalendarOff, CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  buildInternshipWeeks,
  formatLongDate,
  formatShortDate,
  getMondayOfWeek,
  makeLocalDate,
  normalizeHolidayMondays,
  parseDisplayDate,
  parseIsoDate,
  resolveWeekNumber,
  toIsoDate,
  type CalendarWeek,
} from "@/lib/internship-calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface InternshipCalendarProps {
  /** Week 1 anchor date in ISO YYYY-MM-DD (e.g. "2026-11-09") */
  startDateIso?: string | null;
  /** "anchor": pick start date; "week": pick a report week or custom dates */
  mode: "anchor" | "week";
  /** Currently selected report date_from display text (used when mode="week") */
  selectedFromText?: string;
  /** Currently selected report date_to display text (used for custom date editing) */
  selectedToText?: string;
  /** Optional list of already created report date_from values to mark on calendar */
  coveredFromTexts?: string[];
  /** List of Monday ISO dates ("YYYY-MM-DD") marked as holiday/break weeks */
  holidayMondays?: string[];
  /** Toggle a holiday/break week by its Monday ISO */
  onToggleHolidayWeek?: (mondayIso: string) => void;
  /** Enable custom non-Mon–Fri date selection inside "week" mode */
  allowCustomRange?: boolean;
  onSelectAnchor?: (isoDate: string) => void;
  onSelectWeek?: (week: {
    fromText: string;
    toText: string;
    mondayIso: string;
    fridayIso: string;
    weekNumber: number | null;
    isCustom?: boolean;
  }) => void;
}

export function InternshipCalendar({
  startDateIso,
  mode,
  selectedFromText,
  selectedToText,
  coveredFromTexts = [],
  holidayMondays = [],
  onToggleHolidayWeek,
  allowCustomRange = true,
  onSelectAnchor,
  onSelectWeek,
}: InternshipCalendarProps) {
  const initialFocus = useMemo(
    () => parseDisplayDate(selectedFromText) ?? parseIsoDate(startDateIso) ?? new Date(),
    [selectedFromText, startDateIso],
  );

  const [viewYear, setViewYear] = useState(initialFocus.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialFocus.getMonth());
  const [editingHolidays, setEditingHolidays] = useState(false);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);

  const defaultFromIso = useMemo(() => {
    const parsed = parseDisplayDate(selectedFromText);
    return parsed ? toIsoDate(parsed) : toIsoDate(getMondayOfWeek(initialFocus));
  }, [selectedFromText, initialFocus]);

  const defaultToIso = useMemo(() => {
    const parsed = parseDisplayDate(selectedToText);
    if (parsed) return toIsoDate(parsed);
    const fromD = parseIsoDate(defaultFromIso);
    return fromD ? toIsoDate(addDays(fromD, 4)) : "";
  }, [selectedToText, defaultFromIso]);

  const [customFromIso, setCustomFromIso] = useState(defaultFromIso);
  const [customToIso, setCustomToIso] = useState(defaultToIso);

  const todayIso = toIsoDate(new Date());
  const normalizedHolidays = useMemo(() => normalizeHolidayMondays(holidayMondays), [holidayMondays]);
  const holidaySet = useMemo(() => new Set(normalizedHolidays), [normalizedHolidays]);

  const selectedMondayIso = useMemo(() => {
    const parsed = parseDisplayDate(selectedFromText);
    return parsed ? toIsoDate(getMondayOfWeek(parsed)) : null;
  }, [selectedFromText]);

  const anchorMondayIso = useMemo(() => {
    const parsed = parseIsoDate(startDateIso);
    return parsed ? toIsoDate(getMondayOfWeek(parsed)) : null;
  }, [startDateIso]);

  const coveredMondaySet = useMemo(() => {
    const set = new Set<string>();
    for (const t of coveredFromTexts) {
      const d = parseDisplayDate(t);
      if (d) set.add(toIsoDate(getMondayOfWeek(d)));
    }
    return set;
  }, [coveredFromTexts]);

  const internshipWeeks = useMemo(
    () => buildInternshipWeeks(startDateIso, 20, normalizedHolidays),
    [startDateIso, normalizedHolidays],
  );
  const weekByMondayIso = useMemo(
    () => new Map<string, CalendarWeek>(internshipWeeks.map((w) => [w.mondayIso, w])),
    [internshipWeeks],
  );

  // Build Monday-first 6-row (or 5-row) calendar grid for current month
  const gridDays = useMemo(() => {
    const firstOfMonth = makeLocalDate(viewYear, viewMonth, 1);
    const startMonday = getMondayOfWeek(firstOfMonth);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(addDays(startMonday, i));
    }
    const lastWeekInNextMonth = days.slice(35).every((d) => d.getMonth() !== viewMonth);
    return lastWeekInNextMonth ? days.slice(0, 35) : days;
  }, [viewYear, viewMonth]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function handlePickDay(d: Date) {
    const iso = toIsoDate(d);
    const mon = getMondayOfWeek(d);
    const monIso = toIsoDate(mon);

    if (editingHolidays && onToggleHolidayWeek) {
      onToggleHolidayWeek(monIso);
      return;
    }

    if (mode === "anchor") {
      onSelectAnchor?.(iso);
      return;
    }

    if (customRangeOpen) {
      setCustomFromIso(iso);
      if (!customToIso || customToIso < iso) {
        const fri = addDays(mon, 4);
        setCustomToIso(toIsoDate(fri) >= iso ? toIsoDate(fri) : iso);
      }
      return;
    }

    const fri = addDays(mon, 4);
    const known = weekByMondayIso.get(monIso);
    onSelectWeek?.({
      fromText: formatLongDate(mon),
      toText: formatLongDate(fri),
      mondayIso: monIso,
      fridayIso: toIsoDate(fri),
      weekNumber: known?.weekNumber ?? null,
    });
  }

  function handleApplyCustomRange() {
    const fromD = parseIsoDate(customFromIso);
    const toD = parseIsoDate(customToIso);
    if (!fromD || !toD) return;
    const orderedFrom = fromD.getTime() <= toD.getTime() ? fromD : toD;
    const orderedTo = fromD.getTime() <= toD.getTime() ? toD : fromD;
    const mon = getMondayOfWeek(orderedFrom);
    const fri = addDays(mon, 4);
    const monIso = toIsoDate(mon);
    const wkNum = resolveWeekNumber(startDateIso, formatLongDate(orderedFrom), normalizedHolidays);
    onSelectWeek?.({
      fromText: formatLongDate(orderedFrom),
      toText: formatLongDate(orderedTo),
      mondayIso: monIso,
      fridayIso: toIsoDate(fri),
      weekNumber: wkNum,
      isCustom: true,
    });
  }

  const monthTitle = makeLocalDate(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const anchorPreview = startDateIso ? weekByMondayIso.get(anchorMondayIso ?? "") ?? null : null;

  return (
    <div className="space-y-3">
      {/* Calendar Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#1D4ED8]" />
          <span className="text-sm font-semibold text-[#141413]">{monthTitle}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="outline" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" onClick={nextMonth} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mode / Holiday Controls */}
      {(onToggleHolidayWeek || (mode === "week" && allowCustomRange)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {mode === "week" && allowCustomRange && (
            <button
              type="button"
              onClick={() => {
                setEditingHolidays(false);
                setCustomRangeOpen((v) => !v);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                customRangeOpen && !editingHolidays
                  ? "border-[#141413] bg-[#141413] text-white"
                  : "border-[#D8D8D0] bg-white text-[#3D3D39] hover:bg-[#F1F1EE]"
              }`}
            >
              <CalendarRange className="h-3 w-3" />
              <span>Custom Dates</span>
            </button>
          )}

          {onToggleHolidayWeek && (
            <button
              type="button"
              onClick={() => {
                setCustomRangeOpen(false);
                setEditingHolidays((v) => !v);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                editingHolidays
                  ? "border-amber-500 bg-amber-100 text-amber-900"
                  : "border-[#D8D8D0] bg-white text-[#3D3D39] hover:bg-[#F1F1EE]"
              }`}
            >
              <CalendarOff className="h-3 w-3" />
              <span>{editingHolidays ? "Done Marking Holidays" : "Mark Holiday / Break Weeks"}</span>
            </button>
          )}
        </div>
      )}

      {editingHolidays && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Click any week below to toggle it as a <strong>Holiday / Break</strong> (e.g. December Christmas break).
          Active Week numbers automatically shift into January!
        </div>
      )}

      {customRangeOpen && !editingHolidays && mode === "week" && (
        <div className="rounded-xl border border-[#E2E2DC] bg-[#F8F8F6] p-2.5 space-y-2">
          <p className="text-[11px] font-medium text-[#52524E]">
            Edit exact From &amp; To dates for partial or holiday-adjusted weeks:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[#5C5C57] mb-0.5">From Date</label>
              <Input
                type="date"
                value={customFromIso}
                onChange={(e) => setCustomFromIso(e.target.value)}
                className="h-8 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-[#5C5C57] mb-0.5">To Date</label>
              <Input
                type="date"
                value={customToIso}
                onChange={(e) => setCustomToIso(e.target.value)}
                className="h-8 bg-white text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="accent"
              disabled={!customFromIso || !customToIso}
              onClick={handleApplyCustomRange}
            >
              Use Custom Dates
            </Button>
          </div>
        </div>
      )}

      {/* Weekday columns */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[#5C5C57]">
        {WEEKDAY_HEADERS.map((h, i) => (
          <div key={h} className={i >= 5 ? "text-[#A0998E]" : ""}>
            {h}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {gridDays.map((d) => {
          const iso = toIsoDate(d);
          const monIso = toIsoDate(getMondayOfWeek(d));
          const inCurrentMonth = d.getMonth() === viewMonth;
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const isWorkday = !isWeekend;
          const weekMeta = weekByMondayIso.get(monIso);
          const isHolidayWeek = holidaySet.has(monIso);

          const isSelectedDay = mode === "anchor" && !editingHolidays && startDateIso === iso;
          const isSelectedWorkweek =
            !editingHolidays &&
            (mode === "week" ? selectedMondayIso === monIso && isWorkday : anchorMondayIso === monIso && isWorkday);
          const isCoveredWorkweek = coveredMondaySet.has(monIso) && isWorkday && !isSelectedWorkweek;
          const isToday = iso === todayIso;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => handlePickDay(d)}
              title={
                isHolidayWeek
                  ? `Holiday / Break week (${formatShortDate(getMondayOfWeek(d))} – ${formatShortDate(addDays(getMondayOfWeek(d), 4))}) — click to adjust`
                  : weekMeta
                    ? `${weekMeta.label}`
                    : `Mon ${formatShortDate(getMondayOfWeek(d))} – Fri ${formatShortDate(addDays(getMondayOfWeek(d), 4))}`
              }
              className={`relative flex flex-col items-center justify-center rounded-lg py-1.5 text-xs transition cursor-pointer ${
                isSelectedDay
                  ? "bg-[#1D4ED8] text-white font-bold shadow-2xs"
                  : isHolidayWeek && isWorkday
                    ? "bg-amber-50 text-amber-800 border border-dashed border-amber-300 font-medium"
                    : isSelectedWorkweek
                      ? "bg-[#1D4ED8]/18 text-[#1E3A8A] font-semibold border border-[#1D4ED8]/40"
                      : isCoveredWorkweek
                        ? "bg-emerald-50 text-emerald-900 border border-emerald-200/80 font-medium"
                        : isWeekend
                          ? "text-[#A7A196] hover:bg-[#F1F1EE]/70"
                          : inCurrentMonth
                            ? "text-[#141413] hover:bg-[#F1F1EE]"
                            : "text-[#A7A196] hover:bg-[#F1F1EE]/70"
              }`}
            >
              <span>{d.getDate()}</span>
              {d.getDay() === 1 && isHolidayWeek ? (
                <span className="text-[9px] leading-none font-bold text-amber-700">Hol</span>
              ) : d.getDay() === 1 && weekMeta ? (
                <span className="text-[9px] leading-none font-bold text-[#1E40AF]">W{weekMeta.weekNumber}</span>
              ) : null}
              {isToday && !isSelectedDay && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[#1D4ED8]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Holiday summary chips */}
      {normalizedHolidays.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[11px] font-semibold text-amber-900">Holiday / Break Weeks:</span>
          {normalizedHolidays.map((monIso) => {
            const monD = parseIsoDate(monIso);
            const label = monD ? `${formatShortDate(monD)}–${formatShortDate(addDays(monD, 4))}` : monIso;
            return (
              <span
                key={monIso}
                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900"
              >
                <span>{label}</span>
                {onToggleHolidayWeek && (
                  <button
                    type="button"
                    onClick={() => onToggleHolidayWeek(monIso)}
                    className="ml-0.5 font-bold hover:text-red-700 cursor-pointer"
                    aria-label={`Remove holiday week ${label}`}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Helpful legend + quick week pills */}
      {mode === "anchor" ? (
        <div className="rounded-xl bg-[#F8F8F6] border border-[#E2E2DC] px-3 py-2 text-xs text-[#52524E]">
          {anchorPreview ? (
            <span>
              <strong>Week 1 (Mon–Fri):</strong> {anchorPreview.fromText} – {anchorPreview.toText}
            </span>
          ) : (
            <span>Click the date your internship began — schedule skips marked holiday weeks cleanly.</span>
          )}
        </div>
      ) : (
        internshipWeeks.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] font-semibold text-[#52524E]">Active Schedule Quick Pick (Holidays Skipped):</p>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {internshipWeeks.slice(0, 10).map((wk) => {
                const active = selectedMondayIso === wk.mondayIso;
                const covered = coveredMondaySet.has(wk.mondayIso);
                return (
                  <button
                    key={wk.weekNumber}
                    type="button"
                    onClick={() => {
                      const d = parseIsoDate(wk.mondayIso);
                      if (d) {
                        setViewYear(d.getFullYear());
                        setViewMonth(d.getMonth());
                      }
                      onSelectWeek?.({
                        fromText: wk.fromText,
                        toText: wk.toText,
                        mondayIso: wk.mondayIso,
                        fridayIso: wk.fridayIso,
                        weekNumber: wk.weekNumber,
                      });
                    }}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition cursor-pointer ${
                      active
                        ? "bg-[#1D4ED8] text-white border-[#1D4ED8]"
                        : covered
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/70"
                          : "bg-white text-[#3D3D39] border-[#D8D8D0] hover:bg-[#F1F1EE]"
                    }`}
                  >
                    <span>W{wk.weekNumber}:</span>
                    <span>
                      {formatShortDate(parseIsoDate(wk.mondayIso)!)}–{formatShortDate(parseIsoDate(wk.fridayIso)!)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Badge variant="success" className="text-[10px]">Green = created</Badge>
              <Badge variant="accent" className="text-[10px]">Terracotta = selected</Badge>
              <Badge variant="warning" className="text-[10px]">Dashed Amber = Holiday/Break</Badge>
            </div>
          </div>
        )
      )}
    </div>
  );
}
