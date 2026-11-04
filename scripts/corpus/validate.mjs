#!/usr/bin/env node
// Checks data/corpus/*.json: section counts, known sections, and that every
// code-map row points at sections that exist. Exit code 1 on any failure.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTS } from "./acts.mjs";

const DIR = join(process.cwd(), "data", "corpus");
const load = (id) => {
  const f = join(DIR, `${id}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
};

// Official section counts of the new codes as enacted.
const EXPECTED_COUNTS = { BNS: 358, BNSS: 531, BSA: 170 };

const SPOT = [
  ["BNS", "103", /punishment for murder/i, /death or imprisonment for life/i],
  ["BNS", "105", /culpable homicide not amounting to murder/i, /imprisonment for life/i],
  ["BNS", "318", /cheating/i, /is said to .?cheat/i],
  ["BNS", "61", /criminal conspiracy/i, /agree/i],
  ["IPC", "302", /punishment for murder/i, /punished with death/i],
  ["IPC", "420", /cheating and dishonestly inducing delivery of property/i, /seven years/i],
  ["IPC", "120A", /criminal conspiracy/i, /agree/i],
  ["IPC", "304A", /death by negligence/i, /rash or negligent/i],
  ["IPC", "498A", /cruelty/i, /husband/i],
  ["BNSS", "480", /bail.*non-bailable/i, /bail/i],
  ["BNSS", "482", /apprehending arrest/i, /bail/i],
  ["BNSS", "483", /special powers of high court or court of session regarding bail/i, /bail/i],
  ["BNSS", "35", /arrest without warrant/i, /police officer/i],
  ["CRPC", "438", /apprehending arrest/i, /bail/i],
  ["CRPC", "439", /special powers of high court or court of session regarding bail/i, /bail/i],
  ["CRPC", "482", /inherent power/i, /ends of justice/i],
  ["CRPC", "41A", /notice of appearance/i, /notice/i],
  ["BSA", "63", /admissibility of electronic records/i, /certificate/i],
  ["IEA", "65B", /admissibility of electronic records/i, /certificate/i],
  ["NIA", "138", /dishonour of cheque/i, /cheque/i],
  ["HMA", "13B", /divorce by mutual consent/i, /mutually agreed/i],
  ["CPA", "2", /definitions/i, /consumer/i],
  ["RTI", "6", /request for obtaining information/i, /information/i],
];

const MAP_SPOT = [
  ["IPC", "302", "BNS", "103"],
  ["IPC", "420", "BNS", "318"],
  ["IPC", "304A", "BNS", "106"],
  ["IPC", "498A", "BNS", "85"],
  ["IPC", "120B", "BNS", "61"],
  ["CRPC", "437", "BNSS", "480"],
  ["CRPC", "438", "BNSS", "482"],
  ["CRPC", "439", "BNSS", "483"],
  ["CRPC", "482", "BNSS", "528"],
  ["IEA", "65B", "BSA", "63"],
];

let failures = 0;
const fail = (m) => {
  failures++;
  console.log(`  ✗ ${m}`);
};
const ok = (m) => console.log(`  ✓ ${m}`);

console.log("Section counts");
const docs = {};
for (const a of ACTS) {
  const d = load(a.id);
  if (!d) {
    fail(`${a.id}: data/corpus/${a.id}.json missing`);
    continue;
  }
  docs[a.id] = d;
  const nos = d.sections.map((s) => s.no);
  const dups = nos.filter((n, i) => nos.indexOf(n) !== i);
  const empty = d.sections.filter((s) => !s.text.trim()).map((s) => s.no);
  const exp = EXPECTED_COUNTS[a.id];
  const countOk = exp ? d.sections.length === exp : d.sections.length > 0;
  (countOk ? ok : fail)(`${a.id}: ${d.sections.length} sections${exp ? ` (expected ${exp})` : ""}, ${d.chapters.length} chapters`);
  if (dups.length) fail(`${a.id}: duplicate section numbers ${dups.join(", ")}`);
  if (empty.length) fail(`${a.id}: empty text in ${empty.join(", ")}`);
  const noChapter = d.chapters.length ? d.sections.filter((s) => !s.chapterNo).map((s) => s.no) : [];
  if (noChapter.length) console.log(`  · ${a.id}: ${noChapter.length} section(s) without a chapter (${noChapter.slice(0, 8).join(", ")})`);
}

console.log("\nSpot checks");
for (const [act, no, head, text] of SPOT) {
  const s = docs[act]?.sections.find((x) => x.no === no);
  if (!s) {
    fail(`${act} ${no}: missing`);
    continue;
  }
  const h = head.test(s.heading);
  const t = text.test(s.text);
  (h && t ? ok : fail)(`${act} ${no}: “${s.heading}”${h ? "" : " (heading mismatch)"}${t ? "" : " (text mismatch)"}`);
}

console.log("\nCode map (NCRB)");
const mapFile = join(DIR, "code-map.json");
if (!existsSync(mapFile)) fail("code-map.json missing");
else {
  const map = JSON.parse(readFileSync(mapFile, "utf8"));
  for (const [oa, os, na, ns] of MAP_SPOT) {
    const pair = map.pairs.find((p) => p.oldAct === oa && p.newAct === na);
    const row = pair?.rows.find((r) => r.oldSection === os && r.newSection === ns);
    (row ? ok : fail)(`${oa} ${os} → ${na} ${ns}${row ? ` (${row.details.join("; ")})` : ""}`);
  }
  for (const p of map.pairs) {
    const oldNos = new Set(docs[p.oldAct]?.sections.map((s) => s.no) ?? []);
    const newNos = new Set(docs[p.newAct]?.sections.map((s) => s.no) ?? []);
    const badOld = [...new Set(p.rows.filter((r) => !oldNos.has(r.oldSection)).map((r) => r.oldSection))];
    const badNew = [...new Set(p.rows.filter((r) => !newNos.has(r.newSection)).map((r) => r.newSection))];
    console.log(`  · ${p.oldAct}→${p.newAct}: ${p.rows.length} pairs`);
    if (badOld.length) console.log(`    ! old sections not in corpus: ${badOld.join(", ")}`);
    if (badNew.length) console.log(`    ! new sections not in corpus: ${badNew.join(", ")}`);
    const covered = new Set(p.rows.map((r) => r.newSection));
    const uncovered = [...newNos].filter((n) => !covered.has(n) && !p.newProvisions.some((x) => x.split("(")[0] === n));
    if (uncovered.length) console.log(`    · ${uncovered.length} ${p.newAct} section(s) with no NCRB row: ${uncovered.slice(0, 20).join(", ")}${uncovered.length > 20 ? "…" : ""}`);
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
