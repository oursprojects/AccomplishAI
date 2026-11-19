/**
 * Offline check of the scanner → tagger → filler pipeline against the real
 * template (no Supabase / Groq needed):
 *
 *   npx tsx scripts/test-template.ts [path/to/template.docx]
 *
 * Writes tmp/master.tagged.docx and tmp/sample.filled.docx for visual review.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import { scanDocx } from "@/lib/docx/scanner";
import { heuristicFields } from "@/lib/docx/mapping";
import { tagDocx } from "@/lib/docx/tagger";
import { fillTemplate } from "@/lib/docx/fill";
import { REPORT_KEYS, type ReportData } from "@/lib/report-schema";

const src = process.argv[2] ?? join("templates", "2026-Weekly-Accomplishment-Report.docx");
const original = readFileSync(src);

const scan = scanDocx(original);
console.log(`\n== ${scan.candidates.length} candidates ==`);
for (const c of scan.candidates) {
  console.log(
    `${c.locked ? "LOCK" : "    "} ${c.id.padEnd(28)} ${String(c.heuristicKey).padEnd(24)} ${c.reason.padEnd(17)} "${c.currentText.replace(/\n/g, " | ").slice(0, 50)}"`,
  );
}
if (scan.warnings.length) console.log("warnings:", scan.warnings);

const fields = heuristicFields(scan.candidates);
const missing = REPORT_KEYS.filter((k) => !fields.some((f) => f.key === k));
console.log(`\n== ${fields.length}/${REPORT_KEYS.length} keys mapped ==`, missing.length ? `missing: ${missing.join(", ")}` : "");

const tagged = tagDocx(original, fields);
mkdirSync("tmp", { recursive: true });
writeFileSync(join("tmp", "master.tagged.docx"), tagged);

const sample: ReportData = {
  intern_name_last_first: "SANTIAGO, MIKE RYNO A.",
  office: "YML",
  date_from: "November 16, 2026",
  date_to: "November 20, 2026",
  mon_accomplishments: "Attended the orientation on company rules & regulations.\nSet up the development workstation.",
  mon_verified_by: "N.R.G.",
  tue_accomplishments: "Configured network switches in the server room.",
  tue_verified_by: "N.R.G.",
  wed_accomplishments: "",
  wed_verified_by: "",
  thu_accomplishments: "- Documented the IP address allocation table.\n- Assisted in cable management.",
  thu_verified_by: "N.R.G.",
  fri_accomplishments: "Prepared the weekly inventory report <draft>.",
  fri_verified_by: "N.R.G.",
  hours_this_week: "32",
  total_hours_worked: "72",
  new_trainings: "Basic router configuration",
  problems_encountered: "Instructions from my supervisor were not clear",
  solutions_done: "Requested my supervisor to clarify the instructions",
  intern_name_first_last: "MIKE RYNO A. SANTIAGO",
};
const filled = fillTemplate(tagged, sample, fields);
writeFileSync(join("tmp", "sample.filled.docx"), filled);

// Sanity checks on the filled XML
const xml = new PizZip(filled).file("word/document.xml")!.asText();
const text = xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "");
const mustKeep = ["Student Intern", "NIÑO R. GUILLERMO", "Infrastructure, Research &amp; Development Maager", "_________", "Day", "Verified By", "Prepared by:", "Noted by:", "Date:"];
const mustGone = ["LASTNAME", "FIRSTNAME", "(example:", "Continue as necessary", "{", "}"];
const mustHave = ["SANTIAGO, MIKE RYNO A.", "MIKE RYNO A. SANTIAGO", "November 16, 2026", "Configured network switches", "Documented the IP address", "&lt;draft&gt;", ">32<", ">72<"];
let ok = true;
for (const s of mustKeep) if (!text.includes(s)) { ok = false; console.error("LOST original text:", s); }
for (const s of mustGone) if (text.includes(s)) { ok = false; console.error("Leftover placeholder:", s); }
for (const s of mustHave) if (!xml.includes(s)) { ok = false; console.error("Missing filled value:", s); }
for (const part of ["word/header2.xml", "word/footer2.xml"]) {
  if (new PizZip(original).file(part)!.asText() !== new PizZip(filled).file(part)!.asText()) {
    ok = false; console.error("Header/footer changed:", part);
  }
}
console.log(ok ? "\nPASS: tmp/master.tagged.docx + tmp/sample.filled.docx written" : "\nFAIL");
process.exit(ok ? 0 : 1);
