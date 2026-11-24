import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getReportWeekMondayIso,
  normalizeDateToLongFormat,
  normalizeHolidayMondays,
  parseHoursNumber,
  resolveWeekCategory,
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
  onMutate?: () => void;
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

const setReportFieldShape = Object.fromEntries(
  REPORT_KEYS.map((k) => [
    k,
    z
      .string()
      .optional()
      .describe(
        REPORT_FIELD_META[k].kind === "list"
          ? `${REPORT_FIELD_META[k].description}. Strictly accomplished tasks only (no arrival/departure times), past-tense formal lines separated by \\n, max 12 words per line, NO bullet characters.`
          : REPORT_FIELD_META[k].description,
      ),
  ]),
) as Record<ReportKey, z.ZodOptional<z.ZodString>>;

/**
 * Builds an AccomplishAI MCP Server backed by the signed-in user's RLS-scoped Supabase client.
 * Exposes read & write tools for reports, OJT cumulative hours, and profile defaults.
 */
export function createAccomplishMcpServer(ctx: AccomplishMcpSessionState): McpServer {
  const server = new McpServer({
    name: "accomplish-ai-supabase-mcp",
    version: "1.0.0",
  });

  // Tool 1: List saved reports from Supabase (previous & current weeks)
  server.registerTool(
    "list_reports",
    {
      title: "List Saved Reports",
      description:
        "Query Supabase `reports` for this intern to inspect previous weeks' dates, hours_this_week, and total_hours_worked.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().describe("Maximum recent reports to fetch (default 12)."),
      },
    },
    async ({ limit }) => {
      const { data, error } = await ctx.supabase
        .from("reports")
        .select("id, title, structured_data, created_at, updated_at")
        .eq("user_id", ctx.user.id)
        .order("created_at", { ascending: false })
        .limit(limit ?? 12);

      if (error) return jsonContent({ error: error.message });

      const reports = (data ?? []).map((r) => {
        const parsed = reportDataSchema.parse(r.structured_data ?? {});
        return {
          id: r.id,
          title: r.title,
          date_from: parsed.date_from,
          date_to: parsed.date_to,
          hours_this_week: parsed.hours_this_week,
          total_hours_worked: parsed.total_hours_worked,
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
      const holidayMondays = normalizeHolidayMondays(ctx.user.user_metadata?.holiday_mondays);

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

  // Tool 3: Read current report fields & completion status
  server.registerTool(
    "get_report_fields",
    {
      title: "Get Report Fields",
      description: "Read all current report field values and check which sections are filled or missing.",
      inputSchema: {
        report_id: z
          .string()
          .uuid()
          .optional()
          .describe("Optional report ID (needed only when calling outside an active chat report session)."),
      },
    },
    async ({ report_id }) => {
      if (ctx.workingData && (!report_id || report_id === ctx.reportId)) {
        return jsonContent({
          ...computeReportStatus(ctx.workingData),
          current_data: ctx.workingData,
        });
      }

      const targetId = report_id ?? ctx.reportId;
      if (!targetId) {
        return jsonContent({ error: "Provide report_id to read a report outside an active workspace session." });
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

  // Tool 4: Set or update report fields (with Supabase duplicate-week & cumulative hours logic)
  server.registerTool(
    "set_report_fields",
    {
      title: "Update Report Fields",
      description:
        "Create or update one or more fields on the Weekly Accomplishment Report. Pass ONLY fields being set with non-empty values. Use exact 'Month Day, Year' format for date_from/date_to and ALL CAPS for names.",
      inputSchema: {
        ...setReportFieldShape,
        report_id: z
          .string()
          .uuid()
          .optional()
          .describe("Optional report ID when calling via /api/mcp outside an active chat turn."),
      },
    },
    async (args) => {
      const targetId = args.report_id ?? ctx.reportId ?? null;
      let targetData = ctx.workingData;
      let persistDirectly = false;

      if (!targetData) {
        if (!targetId) {
          return jsonContent({ error: "No active report_id provided." });
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
      }

      return jsonContent({
        updated: changed,
        ...(blockedDateConflict ? { blocked_date_conflict: blockedDateConflict } : {}),
        status: computeReportStatus(targetData),
      });
    },
  );

  // Tool 5: Clear report fields
  server.registerTool(
    "clear_report_fields",
    {
      title: "Clear Report Fields",
      description:
        "Clear one or more report fields to empty string, or clear all fields when clear_all is true. Checks current values first.",
      inputSchema: {
        fields: z.array(z.enum(REPORT_KEYS)).optional().describe("List of field keys to clear."),
        clear_all: z.boolean().optional().describe("Set true ONLY if the user explicitly asks to clear the whole report."),
        report_id: z.string().uuid().optional(),
      },
    },
    async ({ fields, clear_all, report_id }) => {
      const targetId = report_id ?? ctx.reportId ?? null;
      let targetData = ctx.workingData;
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
      }

      return jsonContent({
        cleared,
        already_empty: alreadyEmpty,
        status: computeReportStatus(targetData),
      });
    },
  );

  // Tool 6: Save recurring profile defaults into Supabase `profiles`
  server.registerTool(
    "save_profile_defaults",
    {
      title: "Save Profile Defaults",
      description:
        "Save the intern's recurring name, office, verifier, or internship_start_date (YYYY-MM-DD) in Supabase `profiles`.",
      inputSchema: {
        name_last_first: z.string().optional().describe("ALL CAPS format: LASTNAME, FIRSTNAME MI."),
        name_first_last: z.string().optional().describe("ALL CAPS format: FIRSTNAME MI. LASTNAME"),
        office: z.string().optional(),
        default_verifier: z.string().optional().describe("ALL CAPS verifier name"),
        internship_start_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("ISO date YYYY-MM-DD when Week 1 began (e.g. 2026-11-09)."),
      },
    },
    async (args) => {
      const patch: Record<string, string> = {};
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
      if (args.internship_start_date?.trim()) {
        patch.internship_start_date = args.internship_start_date.trim();
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await ctx.supabase.from("profiles").upsert({ id: ctx.user.id, ...patch }, { onConflict: "id" });
        if (error) return jsonContent({ error: error.message });
        ctx.toolActions?.push("Saved profile defaults");
      }

      return jsonContent({ saved: Object.keys(patch) });
    },
  );

  return server;
}
