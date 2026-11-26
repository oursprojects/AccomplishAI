import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUserQuotaStatus } from "@/lib/admin";
import {
  addDays,
  formatLongDate,
  getMondayOfWeek,
  getReportWeekMondayIso,
  inferNextWeekRange,
  normalizeDateToLongFormat,
  normalizeHolidayMondays,
  parseHoursNumber,
  parseIsoDate,
  resolveWeekCategory,
  toIsoDate,
} from "@/lib/internship-calendar";
import { sanitizeAccomplishmentLines } from "@/lib/report-task-format";
import {
  DAYS,
  emptyReport,
  isReportKey,
  REPORT_FIELD_META,
  REPORT_KEYS,
  reportDataSchema,
  type ReportData,
  type ReportKey,
} from "@/lib/report-schema";
import type { Database, Json } from "@/lib/supabase/database.types";

const INLINE_MARKDOWN = /[*_`]/g;

export interface AccomplishMcpSessionState {
  supabase: SupabaseClient<Database>;
  user: User;
  /** Optional in-memory live draft bound to /api/chat-report for zero-extra-roundtrip updates. */
  reportId?: string | null;
  workingData?: ReportData;
  maxBulletsPerDay?: number;
  startIso?: string | null;
  holidayMondays?: string[];
  defaultVerifier?: string;
  prevTotalNum?: number;
  occupiedWeekMondays?: Map<string, string>;
  updatedKeys?: Set<ReportKey>;
  toolActions?: string[];
  onToolCall?: (toolName: string) => void | Promise<void>;
  onMutate?: () => void;
  onGlobalMutate?: (info: {
    createdReportId?: string;
    mutated?: boolean;
    updatedReportId?: string;
    updatedData?: ReportData;
  }) => void;
}

export function cleanReportFieldValue(key: ReportKey, raw: unknown, maxDayBullets = 3): string {
  if (raw === null || raw === undefined) return "";
  const str = (Array.isArray(raw) ? raw.map(String).join("\n") : String(raw))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(INLINE_MARKDOWN, "");
  if (REPORT_FIELD_META[key].kind === "list") {
    const isReflection = key === "new_trainings" || key === "problems_encountered" || key === "solutions_done";
    const maxLines = isReflection ? 2 : maxDayBullets;
    return sanitizeAccomplishmentLines(str, maxLines, !isReflection);
  }
  const trimmed = str.trim().slice(0, 120);
  if (key === "date_from" || key === "date_to") {
    return normalizeDateToLongFormat(trimmed);
  }
  if (key === "intern_name_last_first" || key === "intern_name_first_last" || key.endsWith("_verified_by")) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

export function computeReportStatus(data: ReportData) {
  const missingEssential: Array<{ key: string; label: string }> = [];
  const missingDetails: Array<{ key: string; label: string }> = [];

  if (!data.intern_name_last_first.trim()) {
    missingEssential.push({ key: "intern_name_last_first", label: "Intern Name (LASTNAME, FIRSTNAME MI.)" });
  }
  if (!data.intern_name_first_last.trim()) {
    missingEssential.push({ key: "intern_name_first_last", label: "Signature Name (FIRSTNAME MI. LASTNAME)" });
  }
  if (!data.office.trim()) {
    missingEssential.push({ key: "office", label: "Office / Department" });
  }
  if (!data.date_from.trim()) {
    missingEssential.push({ key: "date_from", label: "Week Start Date (From)" });
  }
  if (!data.date_to.trim()) {
    missingEssential.push({ key: "date_to", label: "Week End Date (To)" });
  }

  const anyDayFilled = DAYS.some((d) => data[`${d}_accomplishments`].trim().length > 0);
  if (!anyDayFilled) {
    missingEssential.push({ key: "mon_accomplishments", label: "Daily Accomplishments (Mon–Fri)" });
  }

  if (!data.hours_this_week.trim()) {
    missingEssential.push({ key: "hours_this_week", label: "Hours Worked This Week" });
  }
  if (!data.total_hours_worked.trim()) {
    missingDetails.push({ key: "total_hours_worked", label: "Total Hours Worked (previous + this week)" });
  }

  return {
    isComplete: missingEssential.length === 0,
    missingEssential,
    missingDetails,
  };
}

function jsonContent(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeUuidArg(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : undefined;
}

const lenientOptionalFieldValue = z.union([
  z.string(),
  z.number(),
  z.array(z.union([z.string(), z.number()])),
  z.null(),
]);

const lenientOptionalReportId = z.union([z.string(), z.null()]).optional();

const setReportFieldShape = Object.fromEntries(
  REPORT_KEYS.map((k) => [
    k,
    lenientOptionalFieldValue
      .optional()
      .describe(
        REPORT_FIELD_META[k].kind === "list"
          ? `${REPORT_FIELD_META[k].description}. Strictly accomplished tasks only (no arrival/departure times), past-tense formal lines separated by \\n, max 12 words per line, NO bullet characters.`
          : REPORT_FIELD_META[k].description,
      ),
  ]),
) as Record<ReportKey, z.ZodOptional<typeof lenientOptionalFieldValue>>;

/**
 * Builds an AccomplishAI MCP Server backed by the signed-in user's RLS-scoped Supabase client.
 * Exposes read & write tools across reports, OJT hours, profile defaults, templates, and holiday schedules.
 */
export function createAccomplishMcpServer(ctx: AccomplishMcpSessionState): McpServer {
  const server = new McpServer({
    name: "accomplish-ai-supabase-mcp",
    version: "1.1.0",
  });

  async function audit(toolName: string) {
    if (ctx.onToolCall) {
      await ctx.onToolCall(toolName);
    }
  }

  // Tool 1: List saved reports from Supabase (previous & current weeks)
  server.registerTool(
    "list_reports",
    {
      title: "List Saved Reports",
      description:
        "Query Supabase `reports` for this intern to inspect all weeks' titles, dates, hours_this_week, total_hours_worked, and readiness status.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().describe("Maximum recent reports to fetch (default 20)."),
      },
    },
    async ({ limit }) => {
      await audit("list_reports");
      const { data, error } = await ctx.supabase
        .from("reports")
        .select("id, title, structured_data, created_at, updated_at")
        .eq("user_id", ctx.user.id)
        .order("created_at", { ascending: false })
        .limit(limit ?? 20);

      if (error) return jsonContent({ error: error.message });

      const reports = (data ?? []).map((r) => {
        const parsed = reportDataSchema.parse(r.structured_data ?? {});
        const status = computeReportStatus(parsed);
        const loggedDays = DAYS.filter((d) => parsed[`${d}_accomplishments`].trim().length > 0);
        return {
          id: r.id,
          title: r.title,
          date_from: parsed.date_from,
          date_to: parsed.date_to,
          hours_this_week: parsed.hours_this_week,
          total_hours_worked: parsed.total_hours_worked,
          logged_days: loggedDays,
          is_complete: status.isComplete,
          missing_essential: status.missingEssential.map((m) => m.label),
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      });

      return jsonContent({ count: reports.length, reports });
    },
  );

  // Tool 2: Read live OJT progress & previous hours summary directly from Supabase
  server.registerTool(
    "get_ojt_hours_summary",
    {
      title: "Get OJT Hours Summary",
      description:
        "Read Supabase `profiles` and `reports` to compute completed OJT hours, target hours, remaining hours, previous total hours, and holiday weeks.",
      inputSchema: {},
    },
    async () => {
      await audit("get_ojt_hours_summary");
      const [{ data: profile }, { data: rows }] = await Promise.all([
        ctx.supabase
          .from("profiles")
          .select(
            "name_last_first, name_first_last, office, default_verifier, default_daily_hours, internship_start_date, target_ojt_hours",
          )
          .eq("id", ctx.user.id)
          .maybeSingle(),
        ctx.supabase
          .from("reports")
          .select("id, title, structured_data, created_at")
          .eq("user_id", ctx.user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const targetHours = profile?.target_ojt_hours ?? 486;
      let maxTotal = 0;
      let sumWeekly = 0;
      const otherReports = (rows ?? []).filter((r) => !ctx.reportId || r.id !== ctx.reportId);
      const latestPrev = otherReports[0] ? reportDataSchema.parse(otherReports[0].structured_data ?? {}) : null;

      for (const r of rows ?? []) {
        const parsed = reportDataSchema.parse(r.structured_data ?? {});
        const total = parseHoursNumber(parsed.total_hours_worked);
        const weekly = parseHoursNumber(parsed.hours_this_week);
        if (total !== null && total > maxTotal) maxTotal = total;
        if (weekly !== null) sumWeekly += weekly;
      }

      const completedHours = Math.max(maxTotal, sumWeekly);
      const holidayMondays = ctx.holidayMondays ?? normalizeHolidayMondays(ctx.user.user_metadata?.holiday_mondays);

      return jsonContent({
        completedHours,
        targetOjtHours: targetHours,
        remainingHours: Math.max(0, targetHours - completedHours),
        percentComplete: Math.min(100, Math.round((completedHours / Math.max(1, targetHours)) * 100)),
        previousTotalHours: latestPrev?.total_hours_worked || "0",
        defaultDailyHours: profile?.default_daily_hours ?? 8,
        internshipStartDate: profile?.internship_start_date ?? null,
        holidayMondays,
        totalReportsCount: (rows ?? []).length,
      });
    },
  );

  // Tool 3: Full workspace overview (profile + template + next open week + holidays + reports summary)
  server.registerTool(
    "get_workspace_overview",
    {
      title: "Get Workspace Overview",
      description:
        "Inspect the entire AccomplishAI workspace in Supabase: profile defaults, active Word template status, holiday weeks, next suggested week, and reports summary.",
      inputSchema: {},
    },
    async () => {
      await audit("get_workspace_overview");
      const [{ data: profile }, { data: tpl }, { data: rows }] = await Promise.all([
        ctx.supabase
          .from("profiles")
          .select(
            "name_last_first, name_first_last, office, default_verifier, default_daily_hours, internship_start_date, target_ojt_hours",
          )
          .eq("id", ctx.user.id)
          .maybeSingle(),
        ctx.supabase
          .from("templates")
          .select("id, name, status, schema, updated_at")
          .eq("user_id", ctx.user.id)
          .eq("is_active", true)
          .maybeSingle(),
        ctx.supabase
          .from("reports")
          .select("id, title, structured_data, created_at")
          .eq("user_id", ctx.user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const holidayMondays = ctx.holidayMondays ?? normalizeHolidayMondays(ctx.user.user_metadata?.holiday_mondays);
      const parsedReports = (rows ?? []).map((r) => {
        const sd = reportDataSchema.parse(r.structured_data ?? {});
        return {
          id: r.id,
          title: r.title,
          date_from: sd.date_from,
          date_to: sd.date_to,
          hours_this_week: sd.hours_this_week,
          total_hours_worked: sd.total_hours_worked,
          is_complete: computeReportStatus(sd).isComplete,
        };
      });

      const nextWeek = inferNextWeekRange({
        startIso: profile?.internship_start_date ?? null,
        holidayMondays,
        existingReports: parsedReports,
      });

      return jsonContent({
        email: ctx.user.email ?? "",
        profile: profile ?? null,
        holidayMondays,
        nextSuggestedWeek: nextWeek,
        activeTemplate: tpl
          ? {
              id: tpl.id,
              name: tpl.name,
              status: tpl.status,
              mappedFieldsCount: Array.isArray(tpl.schema) ? tpl.schema.length : 0,
              updatedAt: tpl.updated_at,
            }
          : null,
        reportsCount: parsedReports.length,
        reports: parsedReports,
      });
    },
  );

  // Tool 4: Read current or specific report fields & completion status
  server.registerTool(
    "get_report_fields",
    {
      title: "Get Report Fields",
      description:
        "Read all field values and missing sections for the currently open report OR any saved report by report_id.",
      inputSchema: {
        report_id: lenientOptionalReportId.describe(
          "Report UUID to inspect (omit when calling inside an active single-report chat session).",
        ),
      },
    },
    async ({ report_id }) => {
      await audit("get_report_fields");
      const normalizedReportId = normalizeUuidArg(report_id);
      if (ctx.workingData && (!normalizedReportId || normalizedReportId === ctx.reportId)) {
        return jsonContent({
          ...computeReportStatus(ctx.workingData),
          current_data: ctx.workingData,
        });
      }

      const targetId = normalizedReportId ?? ctx.reportId;
      if (!targetId) {
        return jsonContent({ error: "Provide report_id to read a specific report (call list_reports first to get IDs)." });
      }

      const { data: row, error } = await ctx.supabase
        .from("reports")
        .select("id, title, structured_data")
        .eq("id", targetId)
        .eq("user_id", ctx.user.id)
        .maybeSingle();

      if (error || !row) return jsonContent({ error: error?.message ?? "Report not found." });
      const parsed = reportDataSchema.parse(row.structured_data ?? {});
      return jsonContent({
        report_id: row.id,
        title: row.title,
        ...computeReportStatus(parsed),
        current_data: parsed,
      });
    },
  );

  // Tool 5: Set or update report fields (with Supabase duplicate-week & cumulative hours logic)
  server.registerTool(
    "set_report_fields",
    {
      title: "Update Report Fields",
      description:
        "Update one or more fields on a Weekly Accomplishment Report. Pass ONLY fields being set with non-empty values. Use exact 'Month Day, Year' format for date_from/date_to and ALL CAPS for names.",
      inputSchema: {
        ...setReportFieldShape,
        report_id: lenientOptionalReportId.describe(
          "Target report UUID (omit inside a single-report editor chat).",
        ),
      },
    },
    async (args) => {
      await audit("set_report_fields");
      const normalizedReportId = normalizeUuidArg(args.report_id);
      const targetId = normalizedReportId ?? ctx.reportId ?? null;
      let targetData =
        ctx.workingData && (!normalizedReportId || normalizedReportId === ctx.reportId) ? ctx.workingData : undefined;
      let persistDirectly = false;

      if (!targetData) {
        if (!targetId) {
          return jsonContent({ error: "Provide report_id (or create a report first) before updating fields." });
        }
        const { data: existing, error } = await ctx.supabase
          .from("reports")
          .select("structured_data")
          .eq("id", targetId)
          .eq("user_id", ctx.user.id)
          .maybeSingle();
        if (error || !existing) return jsonContent({ error: error?.message ?? "Report not found." });
        targetData = reportDataSchema.parse(existing.structured_data ?? {});
        persistDirectly = true;
      }

      const maxBullets = ctx.maxBulletsPerDay ?? 3;
      const changed: string[] = [];
      let blockedDateConflict: string | null = null;

      let occupiedMondays = ctx.occupiedWeekMondays;
      let prevTotalNum = ctx.prevTotalNum ?? 0;
      let defaultVerifier = ctx.defaultVerifier ?? "";
      let startIso = ctx.startIso ?? null;

      if (persistDirectly) {
        const [{ data: profile }, { data: recent }] = await Promise.all([
          ctx.supabase
            .from("profiles")
            .select("default_verifier, internship_start_date")
            .eq("id", ctx.user.id)
            .maybeSingle(),
          ctx.supabase
            .from("reports")
            .select("id, title, structured_data, created_at")
            .eq("user_id", ctx.user.id)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);
        defaultVerifier = profile?.default_verifier ?? "";
        startIso = profile?.internship_start_date ?? null;
        occupiedMondays = new Map<string, string>();
        const others = (recent ?? []).filter((r) => r.id !== targetId);
        if (others[0]) {
          const latestParsed = reportDataSchema.parse(others[0].structured_data ?? {});
          prevTotalNum = parseHoursNumber(latestParsed.total_hours_worked) ?? 0;
        }
        for (const r of others) {
          const parsed = reportDataSchema.parse(r.structured_data ?? {});
          const mon = getReportWeekMondayIso(parsed.date_from, parsed.date_to);
          if (mon) occupiedMondays.set(mon, r.title || parsed.date_from);
        }
      }

      const proposedFrom =
        args.date_from !== undefined ? cleanReportFieldValue("date_from", args.date_from, maxBullets) : targetData.date_from;
      const proposedTo =
        args.date_to !== undefined ? cleanReportFieldValue("date_to", args.date_to, maxBullets) : targetData.date_to;
      const proposedMonIso =
        args.date_from !== undefined || args.date_to !== undefined
          ? getReportWeekMondayIso(proposedFrom, proposedTo)
          : null;

      const allowDateUpdate = !proposedMonIso || !occupiedMondays?.has(proposedMonIso);
      if (!allowDateUpdate && proposedMonIso) {
        const cat = resolveWeekCategory({
          dateFrom: proposedFrom,
          dateTo: proposedTo,
          startDateIso: startIso,
          holidayMondays: ctx.holidayMondays,
        });
        blockedDateConflict = `Only 1 report per week is allowed, and another report already covers ${cat.label}.`;
      }

      for (const key of REPORT_KEYS) {
        if ((key === "date_from" || key === "date_to") && !allowDateUpdate) continue;
        const rawVal = args[key];
        if (rawVal !== undefined && rawVal !== null) {
          const cleaned = cleanReportFieldValue(key, rawVal, maxBullets);
          if (cleaned !== "" && cleaned !== targetData[key]) {
            targetData[key] = cleaned;
            ctx.updatedKeys?.add(key);
            changed.push(key);
            ctx.onMutate?.();
          }
        }
      }

      if (changed.includes("hours_this_week") && !changed.includes("total_hours_worked")) {
        const weekHoursNum = parseHoursNumber(targetData.hours_this_week);
        if (weekHoursNum !== null) {
          const autoTotal = String(prevTotalNum + weekHoursNum);
          if (autoTotal !== targetData.total_hours_worked) {
            targetData.total_hours_worked = autoTotal;
            ctx.updatedKeys?.add("total_hours_worked");
            changed.push("total_hours_worked");
          }
        }
      }

      if (defaultVerifier) {
        const upperVerifier = defaultVerifier.toUpperCase();
        for (const d of DAYS) {
          if (targetData[`${d}_accomplishments`].trim() && !targetData[`${d}_verified_by`].trim()) {
            targetData[`${d}_verified_by`] = upperVerifier;
            ctx.updatedKeys?.add(`${d}_verified_by`);
          }
        }
      }

      if (changed.length > 0) {
        ctx.toolActions?.push(`Updated ${changed.length} field${changed.length === 1 ? "" : "s"}`);
      }

      if (persistDirectly && targetId && changed.length > 0) {
        await ctx.supabase
          .from("reports")
          .update({ structured_data: targetData as unknown as Json })
          .eq("id", targetId)
          .eq("user_id", ctx.user.id);
        ctx.onGlobalMutate?.({ mutated: true, updatedReportId: targetId, updatedData: targetData });
      }

      return jsonContent({
        report_id: targetId,
        updated: changed,
        ...(blockedDateConflict ? { blocked_date_conflict: blockedDateConflict } : {}),
        status: computeReportStatus(targetData),
      });
    },
  );

  // Tool 6: Clear report fields
  server.registerTool(
    "clear_report_fields",
    {
      title: "Clear Report Fields",
      description:
        "Clear one or more report fields to empty string, or clear all fields when clear_all is true. Checks current values first.",
      inputSchema: {
        fields: z.union([z.array(z.string()), z.null()]).optional().describe("List of field keys to clear."),
        clear_all: z
          .union([z.boolean(), z.null()])
          .optional()
          .describe("Set true ONLY if the user explicitly asks to clear the whole report."),
        report_id: lenientOptionalReportId,
      },
    },
    async ({ fields, clear_all, report_id }) => {
      await audit("clear_report_fields");
      const normalizedReportId = normalizeUuidArg(report_id);
      const targetId = normalizedReportId ?? ctx.reportId ?? null;
      let targetData =
        ctx.workingData && (!normalizedReportId || normalizedReportId === ctx.reportId) ? ctx.workingData : undefined;
      let persistDirectly = false;

      if (!targetData) {
        if (!targetId) return jsonContent({ error: "No active report_id provided." });
        const { data: existing, error } = await ctx.supabase
          .from("reports")
          .select("structured_data")
          .eq("id", targetId)
          .eq("user_id", ctx.user.id)
          .maybeSingle();
        if (error || !existing) return jsonContent({ error: error?.message ?? "Report not found." });
        targetData = reportDataSchema.parse(existing.structured_data ?? {});
        persistDirectly = true;
      }

      const cleared: string[] = [];
      const alreadyEmpty: string[] = [];
      const targets: ReportKey[] =
        clear_all === true ? [...REPORT_KEYS] : Array.isArray(fields) ? fields.filter(isReportKey) : [];

      for (const key of targets) {
        if (targetData[key].trim() !== "") {
          targetData[key] = emptyReport()[key];
          ctx.updatedKeys?.add(key);
          cleared.push(key);
          ctx.onMutate?.();
        } else {
          alreadyEmpty.push(key);
        }
      }

      if (cleared.length > 0) {
        ctx.toolActions?.push(`Cleared ${cleared.length} field${cleared.length === 1 ? "" : "s"}`);
      }

      if (persistDirectly && targetId && cleared.length > 0) {
        await ctx.supabase
          .from("reports")
          .update({ structured_data: targetData as unknown as Json })
          .eq("id", targetId)
          .eq("user_id", ctx.user.id);
        ctx.onGlobalMutate?.({ mutated: true, updatedReportId: targetId, updatedData: targetData });
      }

      return jsonContent({
        cleared,
        already_empty: alreadyEmpty,
        status: computeReportStatus(targetData),
      });
    },
  );

  // Tool 7: Create a brand-new Weekly Accomplishment Report in Supabase
  server.registerTool(
    "create_weekly_report",
    {
      title: "Create Weekly Report",
      description:
        "Create a new Weekly Accomplishment Report in Supabase `reports` for the next open non-holiday week (or custom date_from / date_to) seeded with profile defaults.",
      inputSchema: {
        title: z.string().trim().max(120).optional().describe("Optional report title (e.g. 'Week 4')."),
        date_from: z.string().trim().max(40).optional().describe("Optional start date (Month Day, Year)."),
        date_to: z.string().trim().max(40).optional().describe("Optional end date (Month Day, Year)."),
      },
    },
    async ({ title, date_from, date_to }) => {
      await audit("create_weekly_report");
      const quota = await getUserQuotaStatus(ctx.supabase, ctx.user.id, ctx.user.email);
      if (!quota.canCreateReport) {
        return jsonContent({
          error:
            quota.maxReports !== null
              ? `Saved report limit reached (${quota.reportsCount}/${quota.maxReports}).`
              : "Your account is currently paused by the administrator.",
        });
      }

      const [{ data: profile }, { data: existingRows }, { data: tpl }] = await Promise.all([
        ctx.supabase
          .from("profiles")
          .select("name_last_first, name_first_last, office, internship_start_date")
          .eq("id", ctx.user.id)
          .maybeSingle(),
        ctx.supabase
          .from("reports")
          .select("id, title, structured_data")
          .eq("user_id", ctx.user.id)
          .order("created_at", { ascending: false })
          .limit(100),
        ctx.supabase
          .from("templates")
          .select("id")
          .eq("user_id", ctx.user.id)
          .eq("is_active", true)
          .maybeSingle(),
      ]);

      const holidayMondays = ctx.holidayMondays ?? normalizeHolidayMondays(ctx.user.user_metadata?.holiday_mondays);
      const existingWithWeek = (existingRows ?? []).map((r) => {
        const obj =
          r.structured_data && typeof r.structured_data === "object" && !Array.isArray(r.structured_data)
            ? (r.structured_data as Record<string, unknown>)
            : {};
        const from = typeof obj.date_from === "string" ? obj.date_from : "";
        const to = typeof obj.date_to === "string" ? obj.date_to : "";
        return {
          id: r.id,
          title: r.title,
          date_from: from,
          date_to: to,
          mondayIso: getReportWeekMondayIso(from, to),
        };
      });

      const seeded = emptyReport();
      seeded.intern_name_last_first = (profile?.name_last_first ?? "").toUpperCase();
      seeded.intern_name_first_last = (profile?.name_first_last ?? "").toUpperCase();
      seeded.office = profile?.office || "DNX";

      let finalTitle = title?.trim() ?? "";
      if (date_from && date_to) {
        seeded.date_from = normalizeDateToLongFormat(date_from);
        seeded.date_to = normalizeDateToLongFormat(date_to);
      } else {
        const nextWeek = inferNextWeekRange({
          startIso: profile?.internship_start_date ?? null,
          existingReports: existingWithWeek,
          holidayMondays,
        });
        if (nextWeek) {
          seeded.date_from = nextWeek.fromText;
          seeded.date_to = nextWeek.toText;
          if (!finalTitle) finalTitle = `Week ${nextWeek.weekNumber}`;
        }
      }

      const targetMonIso = getReportWeekMondayIso(seeded.date_from, seeded.date_to);
      if (targetMonIso) {
        const conflict = existingWithWeek.find((r) => r.mondayIso === targetMonIso);
        if (conflict) {
          return jsonContent({
            error: `A report already exists for that week ("${conflict.title || conflict.date_from}").`,
            existingReportId: conflict.id,
            url: `/reports/${conflict.id}`,
          });
        }
      }

      const { data: created, error } = await ctx.supabase
        .from("reports")
        .insert({
          user_id: ctx.user.id,
          template_id: tpl?.id ?? null,
          title: finalTitle,
          raw_notes: "",
          structured_data: seeded as unknown as Json,
          chat_messages: [] as unknown as Json,
        })
        .select("id, title, structured_data")
        .single();

      if (error || !created) {
        return jsonContent({ error: error?.message ?? "Could not create weekly report." });
      }

      ctx.toolActions?.push(`Created report ${finalTitle || created.id.slice(0, 8)}`);
      ctx.onGlobalMutate?.({ createdReportId: created.id, mutated: true });

      return jsonContent({
        reportId: created.id,
        title: created.title,
        date_from: seeded.date_from,
        date_to: seeded.date_to,
        url: `/reports/${created.id}`,
      });
    },
  );

  // Tool 8: Mark or unmark Holiday / Break weeks in calendar schedule
  server.registerTool(
    "update_holiday_weeks",
    {
      title: "Update Holiday / Break Weeks",
      description:
        "Add or remove holiday/break weeks (any date inside a week converts to that week's Monday ISO YYYY-MM-DD) so active internship Week numbers skip holiday weeks cleanly.",
      inputSchema: {
        add_dates: z
          .array(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/))
          .max(20)
          .optional()
          .describe("Dates (YYYY-MM-DD) whose weeks should be marked as Holiday / Break."),
        remove_dates: z
          .array(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/))
          .max(20)
          .optional()
          .describe("Dates (YYYY-MM-DD) whose weeks should be unmarked from Holiday / Break."),
      },
    },
    async ({ add_dates, remove_dates }) => {
      await audit("update_holiday_weeks");
      const current = new Set(normalizeHolidayMondays(ctx.user.user_metadata?.holiday_mondays));
      for (const raw of add_dates ?? []) {
        const dt = parseIsoDate(raw);
        if (dt) current.add(toIsoDate(getMondayOfWeek(dt)));
      }
      for (const raw of remove_dates ?? []) {
        const dt = parseIsoDate(raw);
        if (dt) current.delete(toIsoDate(getMondayOfWeek(dt)));
      }

      const updated = Array.from(current).sort().slice(0, 52);
      const { error } = await ctx.supabase.auth.updateUser({ data: { holiday_mondays: updated } });
      if (error) return jsonContent({ error: error.message });

      ctx.holidayMondays = updated;
      ctx.user.user_metadata = { ...(ctx.user.user_metadata ?? {}), holiday_mondays: updated };
      ctx.toolActions?.push("Updated holiday schedule");
      ctx.onGlobalMutate?.({ mutated: true });

      return jsonContent({
        holidayMondays: updated.map((iso) => {
          const mon = parseIsoDate(iso);
          return mon ? `${formatLongDate(mon)} – ${formatLongDate(addDays(mon, 4))} (${iso})` : iso;
        }),
      });
    },
  );

  // Tool 9: Save recurring profile defaults into Supabase `profiles`
  server.registerTool(
    "save_profile_defaults",
    {
      title: "Save Profile Defaults",
      description:
        "Save the intern's recurring name, office, verifier, default_daily_hours, target_ojt_hours, or internship_start_date (YYYY-MM-DD) in Supabase `profiles`.",
      inputSchema: {
        name_last_first: z.string().max(120).optional().describe("ALL CAPS format: LASTNAME, FIRSTNAME MI."),
        name_first_last: z.string().max(120).optional().describe("ALL CAPS format: FIRSTNAME MI. LASTNAME"),
        office: z.string().max(80).optional(),
        default_verifier: z.string().max(120).optional().describe("ALL CAPS verifier name"),
        default_daily_hours: z.number().min(0).max(24).optional(),
        target_ojt_hours: z.number().int().min(40).max(5000).optional(),
        internship_start_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("ISO date YYYY-MM-DD when Week 1 began (e.g. 2026-11-09)."),
      },
    },
    async (args) => {
      await audit("save_profile_defaults");
      const patch: Record<string, string | number> = {};
      if (args.name_last_first?.trim()) {
        patch.name_last_first = args.name_last_first.trim().toUpperCase().slice(0, 120);
      }
      if (args.name_first_last?.trim()) {
        patch.name_first_last = args.name_first_last.trim().toUpperCase().slice(0, 120);
      }
      if (args.office?.trim()) {
        patch.office = args.office.trim().slice(0, 80);
      }
      if (args.default_verifier?.trim()) {
        patch.default_verifier = args.default_verifier.trim().toUpperCase().slice(0, 120);
      }
      if (typeof args.default_daily_hours === "number") {
        patch.default_daily_hours = args.default_daily_hours;
      }
      if (typeof args.target_ojt_hours === "number") {
        patch.target_ojt_hours = args.target_ojt_hours;
      }
      if (args.internship_start_date?.trim()) {
        patch.internship_start_date = args.internship_start_date.trim();
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await ctx.supabase.from("profiles").upsert({ id: ctx.user.id, ...patch }, { onConflict: "id" });
        if (error) return jsonContent({ error: error.message });
        ctx.toolActions?.push("Saved profile defaults");
        ctx.onGlobalMutate?.({ mutated: true });
      }

      return jsonContent({ saved: Object.keys(patch) });
    },
  );

  // Tool 10: Search across all saved reports by keyword or inspect all reflections/problems
  server.registerTool(
    "search_reports",
    {
      title: "Search Reports Across Weeks",
      description:
        "Search all saved Weekly Accomplishment Reports in Supabase for a keyword across titles, daily accomplishments, trainings, problems, and solutions.",
      inputSchema: {
        query: z
          .string()
          .trim()
          .max(120)
          .optional()
          .describe("Keyword or topic to search for (leave empty to summarize tasks/problems across all weeks)."),
      },
    },
    async ({ query }) => {
      await audit("search_reports");
      const { data: rows, error } = await ctx.supabase
        .from("reports")
        .select("id, title, structured_data, created_at")
        .eq("user_id", ctx.user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) return jsonContent({ error: error.message });

      const q = (query ?? "").trim().toLowerCase();
      const matches: Array<{
        report_id: string;
        title: string;
        date_from: string;
        date_to: string;
        matched_fields: Array<{ field: string; text: string }>;
      }> = [];

      const searchableKeys: ReportKey[] = [
        "mon_accomplishments",
        "tue_accomplishments",
        "wed_accomplishments",
        "thu_accomplishments",
        "fri_accomplishments",
        "new_trainings",
        "problems_encountered",
        "solutions_done",
      ];

      for (const r of rows ?? []) {
        const sd = reportDataSchema.parse(r.structured_data ?? {});
        const matchedFields: Array<{ field: string; text: string }> = [];

        if (!q || r.title.toLowerCase().includes(q)) {
          if (q) matchedFields.push({ field: "title", text: r.title });
        }
        for (const k of searchableKeys) {
          const val = sd[k].trim();
          if (!val) continue;
          if (!q || val.toLowerCase().includes(q)) {
            matchedFields.push({ field: k, text: val });
          }
        }

        if (matchedFields.length > 0) {
          matches.push({
            report_id: r.id,
            title: r.title || sd.date_from || "Untitled Report",
            date_from: sd.date_from,
            date_to: sd.date_to,
            matched_fields: matchedFields,
          });
        }
      }

      return jsonContent({ query: query ?? "", matchCount: matches.length, matches });
    },
  );

  // Tool 11: Full OJT analytics, weekly progression, and projected completion forecast
  server.registerTool(
    "get_ojt_analytics",
    {
      title: "Get OJT Analytics & Forecast",
      description:
        "Compute chronological weekly hours, cumulative hours timeline, average weekly pace, and projected OJT completion date (skipping holidays) ready for charts or Excel/PDF exports.",
      inputSchema: {},
    },
    async () => {
      await audit("get_ojt_analytics");
      const [{ data: profile }, { data: rows }] = await Promise.all([
        ctx.supabase
          .from("profiles")
          .select("name_last_first, office, default_daily_hours, internship_start_date, target_ojt_hours")
          .eq("id", ctx.user.id)
          .maybeSingle(),
        ctx.supabase
          .from("reports")
          .select("id, title, structured_data, created_at")
          .eq("user_id", ctx.user.id)
          .order("created_at", { ascending: true })
          .limit(100),
      ]);

      const holidayMondays = ctx.holidayMondays ?? normalizeHolidayMondays(ctx.user.user_metadata?.holiday_mondays);
      const targetHours = profile?.target_ojt_hours ?? 486;

      // Sort chronologically by parsed week Monday ISO, falling back to created_at
      const sortedRows = [...(rows ?? [])].sort((a, b) => {
        const aSd = reportDataSchema.parse(a.structured_data ?? {});
        const bSd = reportDataSchema.parse(b.structured_data ?? {});
        const aKey = getReportWeekMondayIso(aSd.date_from, aSd.date_to) ?? a.created_at.slice(0, 10);
        const bKey = getReportWeekMondayIso(bSd.date_from, bSd.date_to) ?? b.created_at.slice(0, 10);
        return aKey.localeCompare(bKey);
      });

      let runningSum = 0;
      let maxTotal = 0;
      const weeklyTimeline = sortedRows.map((r, idx) => {
        const sd = reportDataSchema.parse(r.structured_data ?? {});
        const wHrs = parseHoursNumber(sd.hours_this_week) ?? 0;
        const tHrs = parseHoursNumber(sd.total_hours_worked);
        runningSum += wHrs;
        if (tHrs !== null && tHrs > maxTotal) maxTotal = tHrs;
        const cumulative = tHrs !== null ? Math.max(tHrs, runningSum) : runningSum;
        const status = computeReportStatus(sd);
        const daysWorked = DAYS.filter((d) => sd[`${d}_accomplishments`].trim().length > 0).length;
        const cat = resolveWeekCategory({
          dateFrom: sd.date_from,
          dateTo: sd.date_to,
          startDateIso: profile?.internship_start_date ?? null,
          holidayMondays,
        });

        return {
          report_id: r.id,
          weekLabel: r.title?.trim() || (cat.weekNumber ? `Week ${cat.weekNumber}` : `Week ${idx + 1}`),
          date_from: sd.date_from,
          date_to: sd.date_to,
          days_worked: daysWorked,
          hours_this_week: wHrs,
          cumulative_hours: cumulative,
          is_complete: status.isComplete,
        };
      });

      const completedHours = Math.max(maxTotal, runningSum);
      const remainingHours = Math.max(0, targetHours - completedHours);
      const nonZeroWeeks = weeklyTimeline.filter((w) => w.hours_this_week > 0);
      const avgHoursPerWeek =
        nonZeroWeeks.length > 0
          ? Number((nonZeroWeeks.reduce((s, w) => s + w.hours_this_week, 0) / nonZeroWeeks.length).toFixed(1))
          : (profile?.default_daily_hours ?? 8) * 5;

      const estimatedWeeksRemaining =
        remainingHours > 0 ? Math.ceil(remainingHours / Math.max(1, avgHoursPerWeek)) : 0;

      const nextWeek = inferNextWeekRange({
        startIso: profile?.internship_start_date ?? null,
        existingReports: weeklyTimeline,
        holidayMondays,
      });

      let projectedCompletion: { weekNumber: number; fromText: string; toText: string } | null = null;
      if (estimatedWeeksRemaining > 0 && nextWeek) {
        const anchorIso = profile?.internship_start_date || nextWeek.mondayIso;
        const targetWeekIndex = nextWeek.weekNumber + estimatedWeeksRemaining - 1;
        const startAnchor = parseIsoDate(anchorIso);
        if (startAnchor) {
          const holidaySet = new Set(holidayMondays);
          const mon1 = getMondayOfWeek(startAnchor);
          let activeCount = 0;
          for (let offset = 0; offset < 120; offset++) {
            const m = addDays(mon1, offset * 7);
            const mIso = toIsoDate(m);
            if (holidaySet.has(mIso)) continue;
            activeCount += 1;
            if (activeCount === targetWeekIndex) {
              projectedCompletion = {
                weekNumber: activeCount,
                fromText: formatLongDate(m),
                toText: formatLongDate(addDays(m, 4)),
              };
              break;
            }
          }
        }
      }

      return jsonContent({
        internName: profile?.name_last_first ?? "",
        office: profile?.office ?? "DNX",
        completedHours,
        targetHours,
        remainingHours,
        percentComplete: Math.min(100, Math.round((completedHours / Math.max(1, targetHours)) * 100)),
        averageHoursPerWeek: avgHoursPerWeek,
        estimatedWeeksRemaining,
        projectedCompletion,
        holidayMondays,
        weeklyTimeline,
      });
    },
  );

  return server;
}
