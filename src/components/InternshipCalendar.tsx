"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  buildInternshipWeeks,
  formatLongDate,
  formatShortDate,
  getMondayOfWeek,
  makeLocalDate,
  parseDisplayDate,
  parseIsoDate,
  toIsoDate,
  type CalendarWeek,
} from "@/lib/internship-calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface InternshipCalendarProps {
  /** Week 1 anchor date in ISO YYYY-MM-DD (e.g. "2026-11-09") */
  startDateIso?: string | null;
  /** "anchor": pick start date; "week": pick a Mon–Fri report week */
  mode: "anchor" | "week";
  /** Currently selected report date_from display text (used when mode="week") */
  selectedFromText?: string;
  /** Optional list of already created report date_from values to mark on calendar */
  coveredFromTexts?: string[];
  onSelectAnchor?: (isoDate: string) => void;
  onSelectWeek?: (week: {
    fromText: string;
    toText: string;
    mondayIso: string;
    fridayIso: string;
    weekNumber: number | null;
  }) => void;
}

export function InternshipCalendar({
  startDateIso,
  mode,
  selectedFromText,
  coveredFromTexts = [],
  onSelectAnchor,
  onSelectWeek,
}: InternshipCalendarProps) {
  const initialFocus =
    parseDisplayDate(selectedFromText) ??
    parseIsoDate(startDateIso) ??
    new Date();

  const [viewYear, setViewYear] = useState(initialFocus.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialFocus.getMonth());

  const todayIso = toIsoDate(new Date());
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

  const internshipWeeks = useMemo(() => buildInternshipWeeks(startDateIso, 16), [startDateIso]);
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
    // Trim trailing 6th week if completely inside next month
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
    if (mode === "anchor") {
      onSelectAnchor?.(iso);
      return;
    }
    const mon = getMondayOfWeek(d);
    const fri = addDays(mon, 4);
    const monIso = toIsoDate(mon);
    const known = weekByMondayIso.get(monIso);
    onSelectWeek?.({
      fromText: formatLongDate(mon),
      toText: formatLongDate(fri),
      mondayIso: monIso,
      fridayIso: toIsoDate(fri),
      weekNumber: known?.weekNumber ?? null,
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#D97757]" />
          <span className="text-sm font-semibold text-[#1F1E1C]">{monthTitle}</span>
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

      {/* Weekday columns */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[#6B665E]">
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

          const isSelectedDay = mode === "anchor" && startDateIso === iso;
          const isSelectedWorkweek =
            mode === "week" ? selectedMondayIso === monIso && isWorkday : anchorMondayIso === monIso && isWorkday;
          const isCoveredWorkweek = coveredMondaySet.has(monIso) && isWorkday && !isSelectedWorkweek;
          const isToday = iso === todayIso;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => handlePickDay(d)}
              title={
                weekMeta
                  ? `${weekMeta.label}`
                  : `Mon ${formatShortDate(getMondayOfWeek(d))} – Fri ${formatShortDate(addDays(getMondayOfWeek(d), 4))}`
              }
              className={`relative flex flex-col items-center justify-center rounded-lg py-1.5 text-xs transition cursor-pointer ${
                isSelectedDay
                  ? "bg-[#D97757] text-white font-bold shadow-2xs"
                  : isSelectedWorkweek
                    ? "bg-[#D97757]/18 text-[#9F4427] font-semibold border border-[#D97757]/40"
                    : isCoveredWorkweek
                      ? "bg-emerald-50 text-emerald-900 border border-emerald-200/80 font-medium"
                      : isWeekend
                        ? "text-[#A7A196] hover:bg-[#F4F2EA]/70"
                        : inCurrentMonth
                          ? "text-[#1F1E1C] hover:bg-[#F4F2EA]"
                          : "text-[#A7A196] hover:bg-[#F4F2EA]/70"
              }`}
            >
              <span>{d.getDate()}</span>
              {d.getDay() === 1 && weekMeta && (
                <span className="text-[9px] leading-none font-bold text-[#C86343]">W{weekMeta.weekNumber}</span>
              )}
              {isToday && !isSelectedDay && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[#D97757]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Helpful legend + quick week pills */}
      {mode === "anchor" ? (
        <div className="rounded-xl bg-[#FAF9F5] border border-[#E6E2D8] px-3 py-2 text-xs text-[#57544E]">
          {anchorPreview ? (
            <span>
              <strong>Week 1 (Mon–Fri):</strong> {anchorPreview.fromText} – {anchorPreview.toText}
            </span>
          ) : (
            <span>Click the date your internship began — each report auto-aligns Monday to Friday.</span>
          )}
        </div>
      ) : (
        internshipWeeks.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] font-semibold text-[#57544E]">Internship Schedule Quick Pick (Mon–Fri):</p>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {internshipWeeks.slice(0, 8).map((wk) => {
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
                        ? "bg-[#D97757] text-white border-[#D97757]"
                        : covered
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/70"
                          : "bg-white text-[#4A463F] border-[#DDD7CB] hover:bg-[#F4F2EA]"
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
              <Badge variant="success" className="text-[10px]">Green = report created</Badge>
              <Badge variant="accent" className="text-[10px]">Terracotta = selected Mon–Fri</Badge>
            </div>
          </div>
        )
      )}
    </div>
  );
}
