"use client";

import { useMemo, useState, useTransition } from "react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  FileText,
  FolderKanban,
  Gauge,
  Loader2,
  Target,
  UserRound,
} from "lucide-react";
import type { QuotaStatus } from "@/lib/admin";
import {
  buildInternshipWeeks,
  getReportWeekMondayIso,
  inferNextWeekRange,
  normalizeDateToLongFormat,
  parseHoursNumber,
  resolveWeekCategory,
} from "@/lib/internship-calendar";
import { DAYS, type ReportData } from "@/lib/report-schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export interface DashboardReportSummary {
  id: string;
  title: string;
  raw_notes: string;
  structured_data: Partial<ReportData>;
  created_at: string;
  updated_at: string;
}

interface DashboardClientProps {
  reports: DashboardReportSummary[];
  profile: {
    name_last_first: string;
    name_first_last: string;
    office: string;
    default_daily_hours: number;
    internship_start_date: string | null;
    target_ojt_hours: number;
  };
  quota: QuotaStatus;
  templateStatus: "missing" | "pending_review" | "confirmed";
  templateName?: string;
}

function isReady(d: Partial<ReportData>): boolean {
  const hasDates = Boolean(d.date_from?.trim() && d.date_to?.trim());
  const hasTasks = DAYS.some((day) => Boolean(d[`${day}_accomplishments`]?.trim()));
  const hasHours = Boolean(d.hours_this_week?.trim());
  return hasDates && hasTasks && hasHours;
}

function OpenLinkButtonLabel() {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
      <span>{pending ? "Opening..." : "Open & Chat"}</span>
    </>
  );
}

export function DashboardClient({
  reports,
  profile,
  quota,
  templateStatus,
  templateName,
}: DashboardClientProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startNavTransition] = useTransition();

  const stats = useMemo(() => {
    let maxTotal = 0;
    let sumWeekly = 0;
    let readyCount = 0;

    for (const r of reports) {
      if (isReady(r.structured_data)) readyCount += 1;
      const t = parseHoursNumber(r.structured_data.total_hours_worked);
      const w = parseHoursNumber(r.structured_data.hours_this_week);
      if (t !== null && t > maxTotal) maxTotal = t;
      if (w !== null) sumWeekly += w;
    }

    const completedHours = Math.max(maxTotal, sumWeekly);
    const target = Math.max(40, profile.target_ojt_hours || 486);
    const ojtPct = Math.min(100, Math.round((completedHours / target) * 100));
    const remainingHours = Math.max(0, target - completedHours);
    const avgPerWeek =
      reports.length > 0 && sumWeekly > 0
        ? sumWeekly / reports.length
        : Math.max(8, (profile.default_daily_hours || 8) * 5);
    const estWeeksLeft = remainingHours > 0 ? Math.ceil(remainingHours / Math.max(8, avgPerWeek)) : 0;

    return {
      completedHours,
      target,
      ojtPct,
      remainingHours,
      estWeeksLeft,
      readyCount,
      draftCount: reports.length - readyCount,
    };
  }, [reports, profile.target_ojt_hours, profile.default_daily_hours]);

  const reportByMondayIso = useMemo(() => {
    const map = new Map<string, DashboardReportSummary>();
    for (const r of reports) {
      const monIso = getReportWeekMondayIso(r.structured_data.date_from, r.structured_data.date_to);
      if (monIso && !map.has(monIso)) map.set(monIso, r);
    }
    return map;
  }, [reports]);

  const nextWeekPreview = useMemo(
    () =>
      inferNextWeekRange({
        startIso: profile.internship_start_date,
        existingReports: reports.map((r) => ({
          date_from: r.structured_data.date_from,
          date_to: r.structured_data.date_to,
        })),
      }),
    [profile.internship_start_date, reports],
  );

  // Chronological bar chart items (sorted earliest week -> latest, up to 10 weeks)
  const weeklyChartItems = useMemo(() => {
    const items = reports.map((r) => {
      const cat = resolveWeekCategory({
        dateFrom: r.structured_data.date_from,
        dateTo: r.structured_data.date_to,
        startDateIso: profile.internship_start_date,
      });
      const hours = parseHoursNumber(r.structured_data.hours_this_week) ?? 0;
      return {
        id: r.id,
        sortKey: cat.mondayIso ?? r.created_at,
        label: cat.weekNumber !== null ? `W${cat.weekNumber}` : cat.shortLabel,
        fullLabel: cat.label,
        hours,
        ready: isReady(r.structured_data),
      };
    });
    return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey)).slice(-10);
  }, [reports, profile.internship_start_date]);

  const maxChartHours = Math.max(40, ...weeklyChartItems.map((i) => i.hours));
  const scheduleWeeks = useMemo(
    () => buildInternshipWeeks(profile.internship_start_date, 8),
    [profile.internship_start_date],
  );

  async function handleCreateWeekReport(opts?: {
    weekStartDate?: string;
    weekEndDate?: string;
    title?: string;
  }) {
    if (!quota.canCreateReport || creating) return;
    setError(null);
    if (opts?.weekStartDate || opts?.weekEndDate) {
      const targetMon = getReportWeekMondayIso(opts.weekStartDate, opts.weekEndDate);
      const existing = targetMon ? reportByMondayIso.get(targetMon) : undefined;
      if (existing) {
        startNavTransition(() => router.push(`/reports/${existing.id}`));
        return;
      }
    }

    setCreating(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts ?? {}),
      });
      const json = (await res.json()) as {
        report?: { id: string };
        error?: string;
        existingReportId?: string;
      };
      if (res.status === 409 && json.existingReportId) {
        startNavTransition(() => router.push(`/reports/${json.existingReportId}`));
        return;
      }
      if (!res.ok || !json.report) throw new Error(json.error ?? "Could not create report.");
      startNavTransition(() => router.push(`/reports/${json.report!.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create report.");
      setCreating(false);
    }
  }

  const displayName = profile.name_first_last?.trim() || "Intern";
  const needsProfileSetup = !profile.name_last_first?.trim() || !profile.name_first_last?.trim();

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      {/* Top welcome & quick action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1F1E1C] truncate">
              Welcome back, {displayName}
            </h1>
            {profile.office && <Badge variant="accent">{profile.office}</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-[#6B665E]">
            {profile.internship_start_date
              ? `Internship started ${normalizeDateToLongFormat(profile.internship_start_date)} · 1 report per Mon–Fri week`
              : "Track your OJT hours, weekly accomplishment reports, and AI allowance at a glance."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#DDD7CB] bg-white px-3.5 text-xs sm:text-sm font-medium text-[#1F1E1C] hover:bg-[#F4F2EA] transition"
          >
            <FolderKanban className="h-4 w-4 text-[#D97757]" />
            <span>My Reports</span>
          </Link>
          <Button
            type="button"
            variant="accent"
            disabled={!quota.canCreateReport || creating}
            onClick={() =>
              void handleCreateWeekReport(
                nextWeekPreview
                  ? {
                      weekStartDate: nextWeekPreview.fromText,
                      weekEndDate: nextWeekPreview.toText,
                      title: `Week ${nextWeekPreview.weekNumber}`,
                    }
                  : undefined,
              )
            }
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
            <span>
              {creating
                ? "Creating..."
                : nextWeekPreview
                  ? `Create Week ${nextWeekPreview.weekNumber}`
                  : "New Report"}
            </span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {/* Setup attention callouts */}
      {(needsProfileSetup || templateStatus !== "confirmed") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {needsProfileSetup && (
            <Card className="p-3.5 bg-amber-50/80 border-amber-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserRound className="h-4 w-4 text-amber-700 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-950">Complete Intern Profile</p>
                  <p className="text-[11px] text-amber-800 truncate">
                    Save your full name &amp; verifier to auto-fill every week.
                  </p>
                </div>
              </div>
              <Link
                href="/profile"
                className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-800 transition"
              >
                <span>Setup</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Card>
          )}

          {templateStatus !== "confirmed" && (
            <Card className="p-3.5 bg-[#FDF3EF] border-[#F0D5C9] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileCheck2 className="h-4 w-4 text-[#C86343] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#1F1E1C]">
                    {templateStatus === "pending_review" ? "Confirm Word Template" : "Scan Word Template"}
                  </p>
                  <p className="text-[11px] text-[#57544E] truncate">
                    {templateName ?? "2026-Weekly-Accomplishment-Report.docx"}
                  </p>
                </div>
              </div>
              <Link
                href="/template"
                className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-[#D97757] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#C86343] transition"
              >
                <span>Review</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Card>
          )}
        </div>
      )}

      {/* 4 KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B665E]">
            <span>OJT Hours Completed</span>
            <Target className="h-4 w-4 text-[#D97757]" />
          </div>
          <p className="text-2xl font-bold text-[#1F1E1C] tabular-nums">
            {stats.completedHours}{" "}
            <span className="text-xs font-normal text-[#6B665E]">/ {stats.target} hrs</span>
          </p>
          <div className="h-1.5 w-full rounded-full bg-[#EFECE3] overflow-hidden">
            <div className="h-full rounded-full bg-[#D97757] transition-all" style={{ width: `${stats.ojtPct}%` }} />
          </div>
          <p className="text-[11px] text-[#6B665E]">
            {stats.remainingHours === 0
              ? "Target OJT hours completed!"
              : `${stats.ojtPct}% · ${stats.remainingHours} hrs left (~${stats.estWeeksLeft} wk${stats.estWeeksLeft === 1 ? "" : "s"})`}
          </p>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B665E]">
            <span>Saved Reports</span>
            <FileText className="h-4 w-4 text-[#D97757]" />
          </div>
          <p className="text-2xl font-bold text-[#1F1E1C] tabular-nums">
            {reports.length}
            {quota.maxReports !== null && (
              <span className="text-xs font-normal text-[#6B665E]"> / {quota.maxReports}</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <Badge variant="success" className="text-[10px]">
              {stats.readyCount} Ready
            </Badge>
            <Badge variant="warning" className="text-[10px]">
              {stats.draftCount} Draft
            </Badge>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B665E]">
            <span>AI Prompts Today</span>
            <Gauge className="h-4 w-4 text-[#D97757]" />
          </div>
          <p className="text-2xl font-bold text-[#1F1E1C] tabular-nums">
            {quota.isAdmin ? "Unlimited" : quota.remaining}
            {!quota.isAdmin && (
              <span className="text-xs font-normal text-[#6B665E]"> / {quota.dailyLimit}</span>
            )}
          </p>
          <p className="text-[11px] text-[#6B665E]">
            {quota.isBlocked
              ? "AI access paused by admin"
              : quota.isAdmin
                ? "Admin unlimited access"
                : `${quota.usedToday} used today · resets 12 AM Manila`}
          </p>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B665E]">
            <span>Next Report Week</span>
            <CalendarDays className="h-4 w-4 text-[#D97757]" />
          </div>
          {nextWeekPreview ? (
            <>
              <p className="text-xl font-bold text-[#1F1E1C]">Week {nextWeekPreview.weekNumber}</p>
              <p className="text-[11px] text-[#6B665E]">
                {nextWeekPreview.fromText} – {nextWeekPreview.toText}
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-[#1F1E1C]">No Start Date Yet</p>
              <Link href="/profile" className="inline-block text-[11px] font-medium text-[#C86343] hover:underline">
                Set Week 1 date in Profile →
              </Link>
            </>
          )}
        </Card>
      </div>

      {/* Middle grid: Hours Bar Chart + Schedule Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-7 p-4 sm:p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#1F1E1C]">Weekly Hours Logged</h2>
              <p className="text-xs text-[#6B665E]">Click any week bar to jump straight into that report.</p>
            </div>
            <Badge variant="outline">
              <Clock className="h-3 w-3" />
              <span>Total: {stats.completedHours} hrs</span>
            </Badge>
          </div>

          {weeklyChartItems.length === 0 ? (
            <div className="h-40 rounded-xl border border-dashed border-[#DDD7CB] bg-[#FAF9F5] flex flex-col items-center justify-center text-center p-4">
              <p className="text-xs font-medium text-[#1F1E1C]">No weekly hours recorded yet</p>
              <p className="mt-1 text-[11px] text-[#6B665E]">
                Create your first Weekly Accomplishment Report to see weekly hours charted here.
              </p>
            </div>
          ) : (
            <div className="flex items-end gap-2 sm:gap-3 h-44 pt-4 px-1 overflow-x-auto">
              {weeklyChartItems.map((item) => {
                const heightPct = Math.max(10, Math.round((item.hours / maxChartHours) * 100));
                return (
                  <Link
                    key={item.id}
                    href={`/reports/${item.id}`}
                    title={`${item.fullLabel}: ${item.hours} hrs`}
                    className="group flex-1 min-w-[44px] h-full flex flex-col items-center gap-1.5"
                  >
                    <span className="text-[11px] font-mono font-semibold text-[#4A463F] tabular-nums">
                      {item.hours}h
                    </span>
                    <div className="w-full flex-1 flex items-end justify-center">
                      <div
                        className={`w-full max-w-[42px] rounded-t-lg transition-all group-hover:opacity-90 ${
                          item.ready ? "bg-[#D97757]" : "bg-[#E7B5A2]"
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-[#57544E] group-hover:text-[#C86343] truncate max-w-full">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-5 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#1F1E1C]">Accomplishment Week Tracker</h2>
              <p className="text-xs text-[#6B665E]">1 report allowed per Monday–Friday week.</p>
            </div>
            <Link href="/" className="text-xs font-medium text-[#C86343] hover:underline">
              Full calendar
            </Link>
          </div>

          {scheduleWeeks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#DDD7CB] bg-[#FAF9F5] p-4 space-y-2">
              <p className="text-xs font-medium text-[#1F1E1C]">Set your Internship Start Date</p>
              <p className="text-[11px] text-[#6B665E]">
                Choose Week 1 Monday in My Reports or Profile so every Week 1–Week 8 date auto-calculates cleanly.
              </p>
              <Link
                href="/profile"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#C86343] hover:underline"
              >
                <span>Open Profile Settings</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {scheduleWeeks.map((wk) => {
                const existing = reportByMondayIso.get(wk.mondayIso);
                return existing ? (
                  <Link
                    key={wk.weekNumber}
                    href={`/reports/${existing.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs hover:bg-emerald-50 transition"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-emerald-950">Week {wk.weekNumber}</span>
                      <span className="ml-2 text-emerald-800 truncate">
                        {wk.fromText} – {wk.toText}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Open</span>
                    </span>
                  </Link>
                ) : (
                  <div
                    key={wk.weekNumber}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#EFECE3] bg-[#FAF9F5] px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-[#1F1E1C]">Week {wk.weekNumber}</span>
                      <span className="ml-2 text-[#6B665E] truncate">
                        {wk.fromText} – {wk.toText}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!quota.canCreateReport || creating}
                      onClick={() =>
                        void handleCreateWeekReport({
                          weekStartDate: wk.fromText,
                          weekEndDate: wk.toText,
                          title: `Week ${wk.weekNumber}`,
                        })
                      }
                      className="text-[11px] font-semibold text-[#C86343] hover:underline cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      + Create
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Recent Reports */}
      <Card className="overflow-hidden">
        <div className="border-b border-[#EFECE3] px-4 sm:px-5 py-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#1F1E1C]">Recent Weekly Reports</h2>
          <Link href="/" className="text-xs font-medium text-[#C86343] hover:underline">
            View all ({reports.length}) →
          </Link>
        </div>

        {reports.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-sm font-medium text-[#1F1E1C]">No reports created yet</p>
            <p className="text-xs text-[#6B665E]">Click Create Week 1 above to start your first weekly report.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#F2EFE8]">
            {reports.slice(0, 4).map((r) => {
              const d = r.structured_data;
              const cat = resolveWeekCategory({
                dateFrom: d.date_from,
                dateTo: d.date_to,
                startDateIso: profile.internship_start_date,
              });
              const ready = isReady(d);
              const titleText = r.title.trim() || cat.rangeText;

              return (
                <div
                  key={r.id}
                  className="p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 hover:bg-[#FAF9F5]/80 transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#1F1E1C] truncate">{titleText}</span>
                      {cat.weekNumber !== null && <Badge variant="accent">Week {cat.weekNumber}</Badge>}
                      <Badge variant={ready ? "success" : "warning"}>{ready ? "Ready" : "Draft"}</Badge>
                      {d.hours_this_week && <Badge variant="outline">{d.hours_this_week} hrs</Badge>}
                    </div>
                    <p className="inline-flex items-center gap-1 text-xs text-[#6B665E]">
                      <Calendar className="h-3 w-3" />
                      <span>{cat.rangeText}</span>
                    </p>
                  </div>

                  <Link
                    href={`/reports/${r.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1F1E1C] px-3 text-xs font-medium text-white hover:bg-[#33312E] transition self-start sm:self-center shrink-0"
                  >
                    <OpenLinkButtonLabel />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
