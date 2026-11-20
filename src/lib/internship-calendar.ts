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

/** Parses formats like "November 9, 2026", "Nov 9, 2026", or "2026-11-09". */
export function parseDisplayDate(input?: string | null): Date | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const iso = parseIsoDate(trimmed);
  if (iso) return iso;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return makeLocalDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
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

/**
 * Infers the next report's Week number, Monday `fromText`, and Friday `toText`
 * from existing saved reports and/or the user's internship start date.
 */
export function inferNextWeekRange(opts: {
  startIso?: string | null;
  existingReports: Array<{ date_from?: string; date_to?: string }>;
}): { weekNumber: number; fromText: string; toText: string; mondayIso: string; fridayIso: string } | null {
  const { startIso, existingReports } = opts;

  let latestMonday: Date | null = null;
  for (const r of existingReports) {
    const fromD = parseDisplayDate(r.date_from);
    const toD = parseDisplayDate(r.date_to);
    const ref = fromD ?? (toD ? addDays(toD, -4) : null);
    if (!ref) continue;
    const mon = getMondayOfWeek(ref);
    if (!latestMonday || mon.getTime() > latestMonday.getTime()) {
      latestMonday = mon;
    }
  }

  if (latestMonday) {
    const nextMon = addDays(latestMonday, 7);
    const nextFri = addDays(nextMon, 4);
    const startAnchor = parseIsoDate(startIso);
    const weekNumber = startAnchor
      ? Math.max(
          1,
          Math.floor(
            (nextMon.getTime() - getMondayOfWeek(startAnchor).getTime()) / (7 * 24 * 60 * 60 * 1000),
          ) + 1,
        )
      : existingReports.length + 1;
    return {
      weekNumber,
      fromText: formatLongDate(nextMon),
      toText: formatLongDate(nextFri),
      mondayIso: toIsoDate(nextMon),
      fridayIso: toIsoDate(nextFri),
    };
  }

  if (startIso) {
    const wk = getWeekRange(startIso, existingReports.length + 1);
    if (wk) {
      return {
        weekNumber: wk.weekNumber,
        fromText: wk.fromText,
        toText: wk.toText,
        mondayIso: wk.mondayIso,
        fridayIso: wk.fridayIso,
      };
    }
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
