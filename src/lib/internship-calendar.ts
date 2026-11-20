/**
 * Pure date & workweek (Monday–Friday) calendar utilities for internship reporting.
 * Uses explicit local calendar arithmetic (year, month, day) to avoid timezone off-by-one shifts.
 */

export interface CalendarWeek {
  weekNumber: number;
  label: string;
  mondayIso: string;
  fridayIso: string;
  fromText: string;
  toText: string;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function makeLocalDate(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(iso?: string | null): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return null;
  const [y, m, d] = iso.trim().split("-").map(Number);
  const dt = makeLocalDate(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function formatLongDate(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatShortDate(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

/** Parses formats like "November 9, 2026", "Nov 9, 2026", "11-09-2026", "11/09/2026", or "2026-11-09". */
export function parseDisplayDate(input?: string | null): Date | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const iso = parseIsoDate(trimmed);
  if (iso) return iso;

  // Handle MM-DD-YYYY or MM/DD/YYYY explicitly to avoid timezone issues
  const mdy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (mdy) {
    const [, mm, dd, yyyy] = mdy.map(Number);
    const dt = makeLocalDate(yyyy, mm - 1, dd);
    if (dt.getFullYear() === yyyy && dt.getMonth() === mm - 1 && dt.getDate() === dd) return dt;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return makeLocalDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** Normalizes any parseable date string to exact "November 9, 2026" format; falls back to trimmed input. */
export function normalizeDateToLongFormat(input?: string | null): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  const parsed = parseDisplayDate(trimmed);
  return parsed ? formatLongDate(parsed) : trimmed;
}

/** Returns the Monday of the week containing `d` (Mon=0..Sun=6 offset). */
export function getMondayOfWeek(d: Date): Date {
  const copy = makeLocalDate(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diffToMon);
  return copy;
}

export function addDays(d: Date, days: number): Date {
  const copy = makeLocalDate(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Computes the Mon–Fri range for a 1-indexed internship week anchored on `startIso`. */
export function getWeekRange(startIso: string, weekNumber = 1): CalendarWeek | null {
  const anchor = parseIsoDate(startIso);
  if (!anchor || weekNumber < 1) return null;
  const week1Monday = getMondayOfWeek(anchor);
  const monday = addDays(week1Monday, (weekNumber - 1) * 7);
  const friday = addDays(monday, 4);
  return {
    weekNumber,
    label: `Week ${weekNumber} (${formatShortDate(monday)} – ${formatShortDate(friday)}, ${friday.getFullYear()})`,
    mondayIso: toIsoDate(monday),
    fridayIso: toIsoDate(friday),
    fromText: formatLongDate(monday),
    toText: formatLongDate(friday),
  };
}

/** Builds a schedule of Mon–Fri internship weeks anchored on `startIso`. */
export function buildInternshipWeeks(startIso?: string | null, totalWeeks = 16): CalendarWeek[] {
  if (!startIso) return [];
  const out: CalendarWeek[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const wk = getWeekRange(startIso, w);
    if (wk) out.push(wk);
  }
  return out;
}

/** Given an anchor date and any report date_from, computes its 1-based Week number (or null). */
export function resolveWeekNumber(startIso: string | null | undefined, dateFromText: string): number | null {
  const start = parseIsoDate(startIso);
  const target = parseDisplayDate(dateFromText);
  if (!start || !target) return null;
  const monStart = getMondayOfWeek(start);
  const monTarget = getMondayOfWeek(target);
  const diffDays = Math.round((monTarget.getTime() - monStart.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return null;
  return Math.floor(diffDays / 7) + 1;
}

export interface ReportWeekCategory {
  key: string;
  mondayIso: string | null;
  weekNumber: number | null;
  label: string;
  shortLabel: string;
  rangeText: string;
}

/** Resolves the canonical Monday ISO ("YYYY-MM-DD") for a report's date_from / date_to pair. */
export function getReportWeekMondayIso(dateFrom?: string | null, dateTo?: string | null): string | null {
  const fromD = parseDisplayDate(dateFrom);
  const toD = parseDisplayDate(dateTo);
  const ref = fromD ?? (toD ? addDays(toD, -4) : null);
  return ref ? toIsoDate(getMondayOfWeek(ref)) : null;
}

/** Builds clean display strings for a Monday ISO week key. */
export function formatWeekRangeFromMondayIso(mondayIso: string): {
  mondayIso: string;
  fridayIso: string;
  fromText: string;
  toText: string;
  shortRange: string;
  longRange: string;
} | null {
  const monday = parseIsoDate(mondayIso);
  if (!monday) return null;
  const friday = addDays(monday, 4);
  return {
    mondayIso,
    fridayIso: toIsoDate(friday),
    fromText: formatLongDate(monday),
    toText: formatLongDate(friday),
    shortRange: `${formatShortDate(monday)} – ${formatShortDate(friday)}, ${friday.getFullYear()}`,
    longRange: `${formatLongDate(monday)} – ${formatLongDate(friday)}`,
  };
}

/** Resolves a displayable Week Category descriptor for a report. */
export function resolveWeekCategory(opts: {
  dateFrom?: string | null;
  dateTo?: string | null;
  startDateIso?: string | null;
}): ReportWeekCategory {
  const mondayIso = getReportWeekMondayIso(opts.dateFrom, opts.dateTo);
  if (!mondayIso) {
    return {
      key: "unscheduled",
      mondayIso: null,
      weekNumber: null,
      label: "Unscheduled / No Dates Set",
      shortLabel: "Unscheduled",
      rangeText: "Assign Monday–Friday dates inside the report",
    };
  }

  const range = formatWeekRangeFromMondayIso(mondayIso)!;
  const weekNumber = resolveWeekNumber(opts.startDateIso, range.fromText);
  return {
    key: mondayIso,
    mondayIso,
    weekNumber,
    label: weekNumber !== null ? `Week ${weekNumber} · ${range.shortRange}` : range.shortRange,
    shortLabel: weekNumber !== null ? `Week ${weekNumber}` : range.shortRange,
    rangeText: range.longRange,
  };
}

/**
 * Infers the next open report's Week number, Monday `fromText`, and Friday `toText`
 * from existing saved reports and/or the user's internship start date.
 * Ensures at most 1 report per accomplishment week by skipping already-covered weeks.
 */
export function inferNextWeekRange(opts: {
  startIso?: string | null;
  existingReports: Array<{ date_from?: string; date_to?: string }>;
}): { weekNumber: number; fromText: string; toText: string; mondayIso: string; fridayIso: string } | null {
  const { startIso, existingReports } = opts;

  const coveredMondays = new Set<string>();
  let latestMonday: Date | null = null;
  for (const r of existingReports) {
    const monIso = getReportWeekMondayIso(r.date_from, r.date_to);
    if (!monIso) continue;
    coveredMondays.add(monIso);
    const mon = parseIsoDate(monIso);
    if (mon && (!latestMonday || mon.getTime() > latestMonday.getTime())) {
      latestMonday = mon;
    }
  }

  if (startIso) {
    for (let w = 1; w <= 104; w++) {
      const wk = getWeekRange(startIso, w);
      if (wk && !coveredMondays.has(wk.mondayIso)) {
        return {
          weekNumber: wk.weekNumber,
          fromText: wk.fromText,
          toText: wk.toText,
          mondayIso: wk.mondayIso,
          fridayIso: wk.fridayIso,
        };
      }
    }
  }

  if (latestMonday) {
    const nextMon = addDays(latestMonday, 7);
    const nextFri = addDays(nextMon, 4);
    return {
      weekNumber: existingReports.length + 1,
      fromText: formatLongDate(nextMon),
      toText: formatLongDate(nextFri),
      mondayIso: toIsoDate(nextMon),
      fridayIso: toIsoDate(nextFri),
    };
  }

  return null;
}

/** Safely parses a numeric hour string (e.g. "40" or "40 hrs") into a number, or null. */
export function parseHoursNumber(raw?: string | null): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}
