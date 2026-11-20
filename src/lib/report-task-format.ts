/**
 * Deterministic sanitizer that keeps report accomplishment entries strictly
 * past-tense and focused on actual work tasks (stripping arrival/departure/break filler).
 */

const BULLET_PREFIX = /^\s*(?:[-*•▪◦·–—]|\d+[.)])\s+/;
const LEADING_DAY_OR_TIME =
  /^(?:(?:mon|tue|wed|thu|fri|monday|tuesday|wednesday|thursday|friday)\s*[:–-]\s*|\d{1,2}:\d{2}\s*(?:am|pm)?\s*[:–-]\s*)/i;

const NON_TASK_LINE_RE =
  /^(?:arrived\s+(?:at|in|on)\b|entered\s+(?:the\s+)?office\b|went\s+(?:to\s+(?:the\s+)?office|home|back\s+to)\b|left\s+(?:the\s+office|for\s+home|at)\b|departed\b|dismissed\s+(?:at|early|around|by)\b|clocked\s+(?:in|out)\b|timed\s+(?:in|out)\b|took\s+(?:a\s+)?(?:lunch|break|dinner|snack)\b|had\s+(?:lunch|breakfast|dinner|snack)\b|commuted\b|heading\s+home\b|returned\s+to\s+(?:the\s+)?(?:boarding|bh|home)\b|stayed\s+at\s+(?:boarding\s+house|home)\b)/i;

const TRAILING_ATTENDANCE_RE =
  /(?:[,;]\s*(?:and\s+)?(?:left|arrived|went\s+home|dismissed|departed|clocked\s+(?:in|out)|timed\s+(?:in|out))\b[^.;]*|\s+(?:before\s+going\s+home|before\s+dismissal|until\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)))\s*$/i;

const VERB_TO_PAST: Record<string, string> = {
  add: "Added",
  adding: "Added",
  adjust: "Adjusted",
  adjusting: "Adjusted",
  analyze: "Analyzed",
  analyzing: "Analyzed",
  apply: "Applied",
  applying: "Applied",
  assist: "Assisted",
  assisting: "Assisted",
  attend: "Attended",
  attending: "Attended",
  build: "Built",
  building: "Built",
  check: "Checked",
  checking: "Checked",
  clarify: "Clarified",
  clarifying: "Clarified",
  clean: "Cleaned",
  cleaning: "Cleaned",
  collaborate: "Collaborated",
  collaborating: "Collaborated",
  complete: "Completed",
  completing: "Completed",
  conduct: "Conducted",
  conducting: "Conducted",
  configure: "Configured",
  configuring: "Configured",
  connect: "Connected",
  connecting: "Connected",
  continue: "Continued",
  continuing: "Continued",
  convert: "Converted",
  converting: "Converted",
  coordinate: "Coordinated",
  coordinating: "Coordinated",
  create: "Created",
  creating: "Created",
  debug: "Debugged",
  debugging: "Debugged",
  deploy: "Deployed",
  deploying: "Deployed",
  design: "Designed",
  designing: "Designed",
  develop: "Developed",
  developing: "Developed",
  discuss: "Discussed",
  discussing: "Discussed",
  document: "Documented",
  documenting: "Documented",
  draft: "Drafted",
  drafting: "Drafted",
  edit: "Edited",
  editing: "Edited",
  enhance: "Enhanced",
  enhancing: "Enhanced",
  explore: "Explored",
  exploring: "Explored",
  finalize: "Finalized",
  finalizing: "Finalized",
  fix: "Fixed",
  fixing: "Fixed",
  format: "Formatted",
  formatting: "Formatted",
  generate: "Generated",
  generating: "Generated",
  handle: "Handled",
  handling: "Handled",
  help: "Helped",
  helping: "Helped",
  implement: "Implemented",
  implementing: "Implemented",
  improve: "Improved",
  improving: "Improved",
  inspect: "Inspected",
  inspecting: "Inspected",
  install: "Installed",
  installing: "Installed",
  integrate: "Integrated",
  integrating: "Integrated",
  join: "Joined",
  joining: "Joined",
  learn: "Learned",
  learning: "Learned",
  make: "Made",
  making: "Made",
  manage: "Managed",
  managing: "Managed",
  meet: "Met",
  meeting: "Met",
  merge: "Merged",
  merging: "Merged",
  migrate: "Migrated",
  migrating: "Migrated",
  modify: "Modified",
  modifying: "Modified",
  monitor: "Monitored",
  monitoring: "Monitored",
  optimize: "Optimized",
  optimizing: "Optimized",
  organize: "Organized",
  organizing: "Organized",
  participate: "Participated",
  participating: "Participated",
  perform: "Performed",
  performing: "Performed",
  plan: "Planned",
  planning: "Planned",
  polish: "Polished",
  polishing: "Polished",
  practice: "Practiced",
  practicing: "Practiced",
  prepare: "Prepared",
  preparing: "Prepared",
  present: "Presented",
  presenting: "Presented",
  publish: "Published",
  publishing: "Published",
  rebuild: "Rebuilt",
  rebuilding: "Rebuilt",
  receive: "Received",
  receiving: "Received",
  record: "Recorded",
  recording: "Recorded",
  redesign: "Redesigned",
  redesigning: "Redesigned",
  refactor: "Refactored",
  refactoring: "Refactored",
  refine: "Refined",
  refining: "Refined",
  remove: "Removed",
  removing: "Removed",
  repair: "Repaired",
  repairing: "Repaired",
  request: "Requested",
  requesting: "Requested",
  research: "Researched",
  researching: "Researched",
  resolve: "Resolved",
  resolving: "Resolved",
  review: "Reviewed",
  reviewing: "Reviewed",
  revise: "Revised",
  revising: "Revised",
  run: "Ran",
  running: "Ran",
  setup: "Set up",
  solve: "Solved",
  solving: "Solved",
  study: "Studied",
  studying: "Studied",
  style: "Styled",
  styling: "Styled",
  submit: "Submitted",
  submitting: "Submitted",
  support: "Supported",
  supporting: "Supported",
  test: "Tested",
  testing: "Tested",
  train: "Trained",
  training: "Trained",
  translate: "Translated",
  translating: "Translated",
  troubleshoot: "Troubleshot",
  troubleshooting: "Troubleshot",
  update: "Updated",
  updating: "Updated",
  upgrade: "Upgraded",
  upgrading: "Upgraded",
  upload: "Uploaded",
  uploading: "Uploaded",
  verify: "Verified",
  verifying: "Verified",
  work: "Worked",
  working: "Worked",
  write: "Wrote",
  writing: "Wrote",
};

/** Converts leading base/present/gerund verbs to past tense and capitalizes the first character. */
export function enforcePastTenseLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || /^none$/i.test(trimmed)) return trimmed;

  const setUpMatch = trimmed.match(/^(?:to\s+)?set\s+up\b(.*)$/i);
  if (setUpMatch) {
    return `Set up${setUpMatch[1]}`.trim();
  }

  const strippedInfinitive = trimmed.replace(/^to\s+/i, "");
  const firstWordMatch = strippedInfinitive.match(/^([A-Za-z]+)([\s\S]*)$/);
  if (!firstWordMatch) return trimmed;

  const [, firstWord, rest] = firstWordMatch;
  const replacement = VERB_TO_PAST[firstWord.toLowerCase()];
  if (replacement) {
    return `${replacement}${rest}`.trim();
  }

  return `${firstWord.charAt(0).toUpperCase()}${firstWord.slice(1)}${rest}`.trim();
}

/**
 * Formats and filters a list field (`mon_accomplishments`–`fri_accomplishments` or reflections).
 * For daily accomplishments (`isDailyTask = true`), strips attendance/commute/time-in-out filler
 * so only past-tense completed work tasks remain.
 */
export function sanitizeAccomplishmentLines(raw: string, maxLines: number, isDailyTask: boolean): string {
  const normalized = raw.replace(/\r?\n|;\s+/g, "\n");
  const out: string[] = [];

  for (const rawLine of normalized.split("\n")) {
    let line = rawLine.replace(BULLET_PREFIX, "").replace(LEADING_DAY_OR_TIME, "").trim();
    if (!line) continue;

    if (isDailyTask) {
      line = line.replace(TRAILING_ATTENDANCE_RE, "").trim().replace(/[.,;]+$/, "");
      if (!line || NON_TASK_LINE_RE.test(line)) continue;
      // Drop pure attendance/time-only snippets like "Worked from 7am to 4:30pm" or "7:00 AM - 4:30 PM"
      if (/^(?:\d{1,2}:\d{2}\s*(?:am|pm)|worked\s+(?:from|at|until)\s+\d)/i.test(line)) continue;
    }

    const pastTensed = enforcePastTenseLine(line).slice(0, 100).trim();
    if (!pastTensed) continue;
    out.push(pastTensed);
    if (out.length >= maxLines) break;
  }

  return out.join("\n");
}
