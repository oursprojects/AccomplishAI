"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import {
  Archive,
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  CopyPlus,
  ExternalLink,
  FilePlus2,
  FileText,
  Loader2,
  Pencil,
  Search,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { DOCX_MIME, fillTemplate } from "@/lib/docx/fill";
import type { DetectedField } from "@/lib/docx/types";
import {
  inferNextWeekRange,
  normalizeDateToLongFormat,
  parseDisplayDate,
  parseHoursNumber,
  resolveWeekNumber,
} from "@/lib/internship-calendar";
import { DAYS, type ReportData } from "@/lib/report-schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InternshipCalendar } from "./InternshipCalendar";

export interface ReportSummary {
  id: string;
  title: string;
  raw_notes: string;
  structured_data: Partial<ReportData>;
  created_at: string;
  updated_at: string;
}

type SortMode = "newest" | "oldest" | "week_asc";
type StatusFilter = "all" | "ready" | "draft";

function isReportReady(d: Partial<ReportData>): boolean {
  const hasDates = Boolean(d.date_from?.trim() && d.date_to?.trim());
  const hasTasks = DAYS.some((day) => Boolean(d[`${day}_accomplishments`]?.trim()));
  const hasHours = Boolean(d.hours_this_week?.trim());
  return hasDates && hasTasks && hasHours;
}

export function HistoryClient({
  initialReports,
  maxReports,
  canCreateReport,
  initialStartDate = null,
  targetOjtHours = 486,
  exportTemplate = null,
  profileSnapshot,
}: {
  initialReports: ReportSummary[];
  maxReports: number | null;
  canCreateReport: boolean;
  initialStartDate?: string | null;
  targetOjtHours?: number;
  exportTemplate?: { templateId: string; fields: Pick<DetectedField, "key" | "kind">[] } | null;
  profileSnapshot?: {
    name_last_first: string;
    name_first_last: string;
    office: string;
    default_verifier: string;
    default_daily_hours: number;
    target_ojt_hours: number;
  };
}) {
  const router = useRouter();
  const [reports, setReports] = useState<ReportSummary[]>(initialReports);
  const [startDate, setStartDate] = useState<string | null>(initialStartDate);
  const [calendarOpen, setCalendarOpen] = useState(!initialStartDate);
  const [savingAnchor, setSavingAnchor] = useState(false);

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [exportingAll, setExportingAll] = useState(false);

  const [creating, setCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coveredFromTexts = reports
    .map((r) => r.structured_data.date_from)
    .filter((v): v is string => Boolean(v && v.trim()));

  const nextWeekPreview = inferNextWeekRange({
    startIso: startDate,
    existingReports: reports.map((r) => ({
      date_from: r.structured_data.date_from,
      date_to: r.structured_data.date_to,
    })),
  });

  // Compute OJT cumulative hours progress cleanly across reports
  const ojtStats = useMemo(() => {
    let maxTotal = 0;
    let sumWeekly = 0;
    for (const r of reports) {
      const t = parseHoursNumber(r.structured_data.total_hours_worked);
      const w = parseHoursNumber(r.structured_data.hours_this_week);
      if (t !== null && t > maxTotal) maxTotal = t;
      if (w !== null) sumWeekly += w;
    }
    const completed = Math.max(maxTotal, sumWeekly);
    const pct = Math.min(100, Math.round((completed / Math.max(1, targetOjtHours)) * 100));
    const remaining = Math.max(0, targetOjtHours - completed);
    const avgPerWeek = reports.length > 0 && sumWeekly > 0 ? sumWeekly / reports.length : profileSnapshot?.default_daily_hours ? profileSnapshot.default_daily_hours * 5 : 40;
    const estWeeksLeft = remaining > 0 ? Math.ceil(remaining / Math.max(8, avgPerWeek)) : 0;
    return { completed, pct, remaining, estWeeksLeft };
  }, [reports, targetOjtHours, profileSnapshot]);

  const visibleReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const list = reports.filter((r) => {
      if (statusFilter === "ready" && !isReportReady(r.structured_data)) return false;
      if (statusFilter === "draft" && isReportReady(r.structured_data)) return false;
      if (!normalizedQuery) return true;
      const d = r.structured_data;
      const haystack = [
        r.title,
        d.date_from,
        d.date_to,
        d.office,
        d.intern_name_last_first,
        r.raw_notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    if (sortMode === "oldest") {
      return [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    if (sortMode === "week_asc") {
      return [...list].sort((a, b) => {
        const da = parseDisplayDate(a.structured_data.date_from)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const db = parseDisplayDate(b.structured_data.date_from)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return da - db;
      });
    }
    return list;
  }, [reports, query, sortMode, statusFilter]);

  async function saveAnchorDate(isoDate: string) {
    setSavingAnchor(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name_last_first: profileSnapshot?.name_last_first ?? "",
          name_first_last: profileSnapshot?.name_first_last ?? "",
          office: profileSnapshot?.office || "DNX",
          default_verifier: profileSnapshot?.default_verifier ?? "",
          default_daily_hours: profileSnapshot?.default_daily_hours ?? 8,
          target_ojt_hours: profileSnapshot?.target_ojt_hours ?? targetOjtHours,
          internship_start_date: isoDate || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Could not save internship start date.");
      }
      setStartDate(isoDate || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save start date.");
    } finally {
      setSavingAnchor(false);
    }
  }

  async function handleExportAllZip() {
    if (!exportTemplate || reports.length === 0 || exportingAll) return;
    setExportingAll(true);
    setError(null);
    try {
      const res = await fetch(`/api/template-file?templateId=${encodeURIComponent(exportTemplate.templateId)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Could not load active Word template.");
      const templateBytes = await res.arrayBuffer();

      const zip = new PizZip();
      const usedNames = new Map<string, number>();

      for (const r of reports) {
        const d = r.structured_data;
        const rawLabel = (r.title.trim() || [d.date_from, d.date_to].filter(Boolean).join("_to_") || r.id.slice(0, 8))
          .replace(/[^a-zA-Z0-9 _-]+/g, "")
          .replace(/\s+/g, "-");
        const count = (usedNames.get(rawLabel) ?? 0) + 1;
        usedNames.set(rawLabel, count);
        const fileName = `${count > 1 ? `${rawLabel}-${count}` : rawLabel}.docx`;
        const filled = fillTemplate(templateBytes, d, exportTemplate.fields);
        zip.file(fileName, filled);
      }

      const blob = zip.generate({ type: "blob", mimeType: "application/zip" });
      if (!(blob instanceof Blob)) {
        saveAs(new Blob([blob as ArrayBuffer], { type: "application/zip" }), "AccomplishAI-Weekly-Reports.zip");
      } else {
        saveAs(blob, "AccomplishAI-Weekly-Reports.zip");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to export .zip (${DOCX_MIME}).`);
    } finally {
      setExportingAll(false);
    }
  }

  async function handleCreateReport(opts?: {
    duplicateFromId?: string;
    weekStartDate?: string;
    weekEndDate?: string;
    title?: string;
  }) {
    if (!canCreateReport || creating || duplicatingId) return;
    setError(null);
    if (opts?.duplicateFromId) setDuplicatingId(opts.duplicateFromId);
    else setCreating(true);

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts ?? {}),
      });
      const json = (await res.json()) as { report?: { id: string }; error?: string };
      if (!res.ok || !json.report) {
        throw new Error(json.error ?? "Could not create report.");
      }
      router.push(`/reports/${json.report.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create report.");
      setCreating(false);
      setDuplicatingId(null);
    }
  }

  function startRename(report: ReportSummary) {
    const d = report.structured_data;
    const fallback = [d.date_from, d.date_to].filter(Boolean).join(" – ") || "Untitled Weekly Report";
    setRenamingId(report.id);
    setRenameValue(report.title.trim() || fallback);
    setError(null);
  }

  async function saveRename(id: string) {
    const nextTitle = renameValue.trim();
    if (!nextTitle) return;
    setSavingRename(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      const json = (await res.json()) as { report?: { title?: string }; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not rename report.");
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, title: json.report?.title ?? nextTitle } : r)));
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed.");
    } finally {
      setSavingRename(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this saved report and its conversation?")) return;
    setError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Could not delete report.");
      }
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-[#1F1E1C]">My Weekly Reports</h1>
            <Badge>
              {reports.length} {maxReports === null ? "saved" : `/ ${maxReports} max`}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-[#6B665E]">
            Open any report to chat with Accomplish AI, edit fields, undo changes, and export to Word.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {exportTemplate && reports.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exportingAll}
              onClick={() => void handleExportAllZip()}
              title="Download all saved Weekly Accomplishment Reports bundled in a single .zip"
            >
              {exportingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5 text-[#D97757]" />}
              <span>{exportingAll ? "Bundling..." : "Export All (.zip)"}</span>
            </Button>
          )}

          <Button
            type="button"
            variant="accent"
            disabled={!canCreateReport || creating}
            onClick={() => void handleCreateReport()}
            title={
              nextWeekPreview
                ? `Create Week ${nextWeekPreview.weekNumber} (${nextWeekPreview.fromText} – ${nextWeekPreview.toText})`
                : "Create a brand-new Weekly Report"
            }
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
            <span>
              {creating
                ? "Creating..."
                : nextWeekPreview
                  ? `New Week ${nextWeekPreview.weekNumber} Report`
                  : "New Report"}
            </span>
          </Button>
        </div>
      </div>

      {/* OJT Hours Progress Card */}
      <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1F1E1C]">
              <Target className="h-4 w-4 text-[#D97757]" />
              <span>OJT Hours Progress</span>
            </span>
            <span className="text-xs font-mono font-semibold text-[#1F1E1C]">
              {ojtStats.completed} / {targetOjtHours} hrs ({ojtStats.pct}%)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#EFECE3] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#D97757] transition-all"
              style={{ width: `${ojtStats.pct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6B665E]">
            <span>
              {ojtStats.remaining === 0
                ? "Target OJT hours reached!"
                : `${ojtStats.remaining} hrs remaining (~${ojtStats.estWeeksLeft} week${ojtStats.estWeeksLeft === 1 ? "" : "s"} left)`}
            </span>
            <Link href="/profile" className="font-medium text-[#C86343] hover:underline">
              Adjust target
            </Link>
          </div>
        </div>
      </Card>

      {/* Internship Calendar Schedule Card */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F7F6F0] px-4 py-3 border-b border-[#E6E2D8]">
          <div className="flex items-center gap-2.5 min-w-0">
            <CalendarDays className="h-4 w-4 text-[#D97757] shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-[#1F1E1C]">
                Internship Calendar (Mon–Fri Schedule)
              </p>
              <p className="text-[11px] text-[#6B665E] truncate">
                {startDate
                  ? nextWeekPreview
                    ? `Week 1 started ${normalizeDateToLongFormat(startDate)} · Next up: Week ${nextWeekPreview.weekNumber} (${nextWeekPreview.fromText} – ${nextWeekPreview.toText})`
                    : `Week 1 started ${normalizeDateToLongFormat(startDate)}`
                  : "Pick the date your internship began so Week 1, Week 2, etc. and hours calculate automatically."}
              </p>
            </div>
          </div>

          <Button type="button" size="sm" variant="outline" onClick={() => setCalendarOpen((v) => !v)}>
            {calendarOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span>{calendarOpen ? "Hide Calendar" : "Show Calendar"}</span>
          </Button>
        </div>

        {calendarOpen && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            <div className="md:col-span-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#57544E] mb-1">
                  Week 1 Start Date
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={startDate ?? ""}
                    disabled={savingAnchor}
                    onChange={(e) => void saveAnchorDate(e.target.value)}
                    className="bg-white"
                  />
                </div>
                <p className="mt-1.5 text-xs text-[#6B665E]">
                  For example, if you began Monday <strong>November 9</strong>, Week 1 is{" "}
                  <strong>Nov 9 – Nov 13</strong>, and Week 2 is automatically <strong>Nov 16 – Nov 20</strong>.
                </p>
              </div>

              {nextWeekPreview && (
                <div className="rounded-xl border border-[#F0D5C9] bg-[#FDF3EF] p-3 space-y-2">
                  <p className="text-xs font-semibold text-[#9F4427]">
                    Next Report: Week {nextWeekPreview.weekNumber}
                  </p>
                  <p className="text-xs text-[#4A463F]">
                    {nextWeekPreview.fromText} – {nextWeekPreview.toText}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="accent"
                    disabled={!canCreateReport || creating}
                    onClick={() =>
                      void handleCreateReport({
                        weekStartDate: nextWeekPreview.fromText,
                        weekEndDate: nextWeekPreview.toText,
                        title: `Week ${nextWeekPreview.weekNumber}`,
                      })
                    }
                    className="w-full"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    <span>Create Week {nextWeekPreview.weekNumber} Report</span>
                  </Button>
                </div>
              )}
            </div>

            <div className="md:col-span-7 rounded-xl border border-[#E6E2D8] bg-white p-3">
              <InternshipCalendar
                mode={startDate ? "week" : "anchor"}
                startDateIso={startDate}
                coveredFromTexts={coveredFromTexts}
                onSelectAnchor={(iso) => void saveAnchorDate(iso)}
                onSelectWeek={(wk) =>
                  void handleCreateReport({
                    weekStartDate: wk.fromText,
                    weekEndDate: wk.toText,
                    title: wk.weekNumber ? `Week ${wk.weekNumber}` : undefined,
                  })
                }
              />
            </div>
          </div>
        )}
      </Card>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {reports.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A847A]" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reports by title, dates, or office..."
              className="bg-white pl-10 h-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "ready", "draft"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize cursor-pointer transition ${
                  statusFilter === st
                    ? "border-[#1F1E1C] bg-[#1F1E1C] text-white"
                    : "border-[#DDD7CB] bg-white text-[#57544E] hover:bg-[#F4F2EA]"
                }`}
              >
                {st}
              </button>
            ))}

            <select
              aria-label="Sort reports"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="h-8 rounded-lg border border-[#DDD7CB] bg-white px-2.5 text-xs font-medium text-[#1F1E1C] outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="week_asc">By Week Date</option>
            </select>
          </div>
        </div>
      )}

      {reports.length === 0 ? (
        <Card className="border-dashed border-[#DDD7CB] p-10 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FDF3EF] text-[#D97757]">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1F1E1C]">No reports created yet</p>
            <p className="mt-1 text-xs text-[#6B665E]">
              Create your first Weekly Accomplishment Report to start chatting with the AI assistant inside that report.
            </p>
          </div>
          <div>
            <Button
              type="button"
              variant="accent"
              disabled={!canCreateReport || creating}
              onClick={() => void handleCreateReport()}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
              <span>{creating ? "Creating..." : "Create First Report"}</span>
            </Button>
          </div>
        </Card>
      ) : visibleReports.length === 0 ? (
        <Card className="border-dashed border-[#DDD7CB] p-8 text-center">
          <p className="text-sm font-medium text-[#1F1E1C]">No matching reports found</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleReports.map((report) => {
            const d = report.structured_data;
            const dateFallback = [d.date_from, d.date_to].filter(Boolean).join(" – ") || "Untitled Weekly Report";
            const displayTitle = report.title.trim() || dateFallback;
            const wkNum = resolveWeekNumber(startDate, d.date_from ?? "");
            const ready = isReportReady(d);
            const created = new Date(report.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            const isRenaming = renamingId === report.id;

            return (
              <Card
                key={report.id}
                className="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 hover:border-[#D9CFC0] transition-colors"
              >
                <div className="min-w-0 space-y-1 flex-1">
                  {isRenaming ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveRename(report.id);
                      }}
                      className="flex flex-wrap items-center gap-1.5"
                    >
                      <Input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        maxLength={120}
                        autoFocus
                        placeholder="Enter report title..."
                        className="h-8 max-w-sm border-[#D97757]"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={savingRename || !renameValue.trim()}
                        title="Save title"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Save</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setRenamingId(null)}
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Cancel</span>
                      </Button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-[#D97757] shrink-0" />
                      <Link
                        href={`/reports/${report.id}`}
                        className="text-sm font-semibold text-[#1F1E1C] hover:text-[#C86343] transition-colors"
                      >
                        {displayTitle}
                      </Link>
                      {wkNum !== null && <Badge variant="accent">Week {wkNum}</Badge>}
                      <Badge variant={ready ? "success" : "warning"}>{ready ? "Ready" : "Draft"}</Badge>
                      <button
                        type="button"
                        onClick={() => startRename(report)}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#6B665E] hover:bg-[#F4F2EA] hover:text-[#1F1E1C] transition cursor-pointer"
                        title="Rename report"
                      >
                        <Pencil className="h-3 w-3" />
                        <span>Rename</span>
                      </button>
                      {d.office && <Badge>{d.office}</Badge>}
                      {d.hours_this_week && (
                        <Badge variant="outline">
                          <Clock className="h-3 w-3" />
                          {d.hours_this_week} hrs{d.total_hours_worked ? ` (Total: ${d.total_hours_worked})` : ""}
                        </Badge>
                      )}
                    </div>
                  )}

                  <p className="inline-flex items-center gap-1 text-xs text-[#6B665E]">
                    <Calendar className="h-3 w-3" />
                    Created {created}
                    {d.intern_name_last_first ? ` · ${d.intern_name_last_first}` : ""}
                    {[d.date_from, d.date_to].filter(Boolean).length > 0
                      ? ` · ${[d.date_from, d.date_to].filter(Boolean).join(" – ")}`
                      : ""}
                  </p>
                  {report.raw_notes && (
                    <p className="text-xs text-[#57544E] line-clamp-2 pt-0.5">{report.raw_notes}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Link
                    href={`/reports/${report.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1F1E1C] px-3 text-xs font-medium text-white hover:bg-[#33312E] transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open &amp; Chat</span>
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!canCreateReport || duplicatingId === report.id}
                    onClick={() => void handleCreateReport({ duplicateFromId: report.id })}
                    title="Create next week's report keeping your name and office defaults"
                  >
                    {duplicatingId === report.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CopyPlus className="h-3.5 w-3.5 text-[#D97757]" />
                    )}
                    <span>Next Week</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void handleDelete(report.id)}
                    disabled={deletingId === report.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{deletingId === report.id ? "..." : "Delete"}</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
