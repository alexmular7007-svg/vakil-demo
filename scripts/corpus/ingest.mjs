#!/usr/bin/env node
/**
 * Statute ingestion for Vaakil AI. Fetches bare-act text from India Code
 * (indiacode.gov.in, Legislative Department, Ministry of Law and Justice) and the
 * old↔new criminal-code correspondence from NCRB SANKALAN (National Crime Records
 * Bureau, Ministry of Home Affairs), and writes data/corpus/*.json.
 *
 * It only fetches and writes files; it never opens the database. Seed afterwards
 * with `npm run db:seed` (src/lib/corpus/seed-corpus.ts reads these files).
 *
 *   node scripts/corpus/ingest.mjs                 # everything
 *   node scripts/corpus/ingest.mjs --only BNS,IPC  # some acts
 *   node scripts/corpus/ingest.mjs --no-cache      # refetch
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getBuffer, getJson, getText } from "./lib/http.mjs";
import { bitstreams, handleUrl, htmlToFootnotes, htmlToParagraphs, itemsForAct, meta, INDIA_CODE } from "./lib/indiacode.mjs";
import { pdfToPages } from "./lib/pdf-lines.mjs";
import { bodyChapterTitles, cleanHeading, flatten, mergeTitles, parseBody, parseToc, titleCase } from "./lib/parse-act-pdf.mjs";
import { parseNcrbTable } from "./lib/ncrb.mjs";
import { ACTS, NCRB_TABLES } from "./acts.mjs";

const OUT = join(process.cwd(), "data", "corpus");
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",").map((s) => s.trim().toUpperCase()) : null;
const useCache = !args.includes("--no-cache");
const skipMap = args.includes("--no-map");
const today = new Date().toISOString().slice(0, 10);

const naturalKey = (no) => {
  const m = String(no).match(/^(\d+)([A-Z]*)$/);
  return m ? Number(m[1]) * 100 + (m[2] ? m[2].split("").reduce((a, c) => a * 27 + (c.charCodeAt(0) - 64), 0) % 100 : 0) : 0;
};

function paragraphsToText(paras) {
  return paras.map((p) => p.text).join("\n\n");
}

/** Chapters from the act PDF's Arrangement of Sections (titles merged with the body's). */
async function chaptersFromPdf(pdfUrl) {
  const buf = await getBuffer(pdfUrl, { useCache });
  const { pages } = await pdfToPages(buf);
  const lines = flatten(pages);
  const toc = parseToc(lines);
  const bodyTitles = bodyChapterTitles(lines, toc.bodyStart);
  const chapters = toc.chapters.map((c) => ({ number: c.number, title: mergeTitles(c.title, bodyTitles.get(c.number)) }));
  return { toc, chapters, lines };
}

function pickPdf(streams, preferName) {
  const pdfs = streams.filter((b) => b.bundle === "ORIGINAL" && /\.pdf$/i.test(b.name));
  if (preferName) {
    const exact = pdfs.find((b) => b.name === preferName);
    if (exact) return exact;
  }
  // The English text, not the Hindi ("H…") edition.
  return pdfs.filter((b) => !/^H/i.test(b.name)).sort((a, b) => a.size - b.size)[0] ?? pdfs[0];
}

function chapterLabel(ch) {
  return ch ? `Chapter ${ch.number}: ${titleCase(ch.title)}` : null;
}

function assignChapters(sections, toc, chapters) {
  const byNo = new Map(toc.entries.map((e) => [e.no, e.chapterNo]));
  let last = null;
  for (const s of sections) {
    const c = byNo.get(s.no) ?? last;
    s.chapterNo = c ?? null;
    last = c ?? last;
  }
  return chapters.map((c) => ({ number: c.number, title: titleCase(c.title), sections: sections.filter((s) => s.chapterNo === c.number).map((s) => s.no) }));
}

/* ------------------------- structured India Code acts ------------------------- */

async function ingestStructured(cfg) {
  console.log(`\n▶ ${cfg.id}: India Code section records (${cfg.indiaCodeActId})`);
  const items = await itemsForAct(cfg.indiaCodeActId);
  const actItem = items.find((i) => meta(i, "dc.identifier.collection") === "ACT");
  const secItems = items.filter((i) => meta(i, "dc.identifier.collection") === "SECTION");
  if (!actItem) throw new Error(`No ACT item for ${cfg.id}`);
  const streams = await bitstreams(actItem.uuid);
  const pdf = pickPdf(streams, cfg.pdfName);

  const seen = new Set();
  const sections = [];
  for (const it of secItems) {
    const no = (meta(it, "dc.identifier.section_number") ?? "").trim().toUpperCase();
    if (!no || seen.has(no)) continue;
    seen.add(no);
    const paragraphs = htmlToParagraphs(meta(it, "dc.identifier.section_page_note"));
    const footnotes = htmlToFootnotes(meta(it, "dc.identifier.section_footnote")).map((f) => f.text);
    sections.push({
      no,
      order: Number(meta(it, "dc.identifier.order_number") ?? 0) || naturalKey(no),
      heading: cleanHeading(meta(it, "dc.title") ?? ""),
      paragraphs,
      footnotes,
      sourceUrl: handleUrl(it.handle),
    });
  }
  sections.sort((a, b) => a.order - b.order || naturalKey(a.no) - naturalKey(b.no));

  let chapters = [];
  if (pdf) {
    try {
      const { toc, chapters: ch } = await chaptersFromPdf(pdf.url);
      chapters = assignChapters(sections, toc, ch);
      const tocNos = new Set(toc.entries.map((e) => e.no));
      const notInToc = sections.filter((s) => !tocNos.has(s.no)).map((s) => s.no);
      if (notInToc.length) console.log(`  · ${notInToc.length} section(s) not in the PDF arrangement: ${notInToc.slice(0, 12).join(", ")}`);
    } catch (e) {
      console.warn(`  ! chapters unavailable: ${e.message}`);
    }
  }

  return {
    sections,
    chapters,
    source: {
      name: "India Code (Legislative Department, Ministry of Law and Justice, Government of India)",
      url: handleUrl(actItem.handle),
      pdfUrl: pdf?.url ?? null,
      method: "India Code section records (DSpace REST API); chapters from the official PDF's arrangement of sections",
      retrievedOn: today,
    },
    indiaCodeMeta: {
      enactDate: meta(actItem, "dc.date.enact_date"),
      enforcementDate: meta(actItem, "dc.date.enforcement_date"),
      lastModified: meta(actItem, "dc.date.last_modified"),
      longTitle: meta(actItem, "dc.title.long_title"),
    },
  };
}

/* ------------------------------- PDF-only acts ------------------------------- */

async function ingestPdf(cfg) {
  console.log(`\n▶ ${cfg.id}: India Code PDF (${cfg.itemUuid})`);
  const item = await getJson(`${INDIA_CODE}/server/api/core/items/${cfg.itemUuid}`, { useCache });
  const streams = await bitstreams(cfg.itemUuid);
  const pdf = pickPdf(streams, cfg.pdfName);
  if (!pdf) throw new Error(`No PDF for ${cfg.id}`);
  const { toc, chapters: ch, lines } = await chaptersFromPdf(pdf.url);
  const { sections: parsed, missing } = parseBody(lines, toc);
  if (missing.length) console.warn(`  ! could not locate in body: ${missing.join(", ")}`);
  const sections = parsed.map((s, i) => ({
    no: s.no,
    order: i + 1,
    heading: s.heading,
    paragraphs: s.paragraphs,
    footnotes: s.footnotes,
    sourceUrl: handleUrl(item.handle),
    chapterNo: s.chapterNo,
  }));
  const chapters = ch.map((c) => ({ number: c.number, title: titleCase(c.title), sections: sections.filter((s) => s.chapterNo === c.number).map((s) => s.no) }));
  return {
    sections,
    chapters,
    tocCount: toc.entries.length,
    missing,
    source: {
      name: "India Code (Legislative Department, Ministry of Law and Justice, Government of India)",
      url: handleUrl(item.handle),
      pdfUrl: pdf.url,
      method: "Text extracted from the official India Code PDF and split into sections using its arrangement of sections",
      retrievedOn: today,
    },
  };
}

/* ----------------------------------- main ----------------------------------- */

async function ingestAct(cfg) {
  const res = cfg.kind === "structured" ? await ingestStructured(cfg) : await ingestPdf(cfg);
  // Manual fixes for chapter titles the PDF typesets without word spaces.
  for (const c of res.chapters) if (cfg.chapterTitleFixes?.[c.number]) c.title = cfg.chapterTitleFixes[c.number];
  const chapterOf = new Map();
  for (const c of res.chapters) for (const no of c.sections) chapterOf.set(no, c);
  const sections = res.sections.map((s, i) => ({
    no: s.no,
    sortKey: (i + 1) * 10,
    heading: s.heading || `Section ${s.no}`,
    chapter: chapterLabel(chapterOf.get(s.no)),
    chapterNo: chapterOf.get(s.no)?.number ?? null,
    text: paragraphsToText(s.paragraphs),
    paragraphs: s.paragraphs,
    footnotes: s.footnotes,
  }));
  const doc = {
    id: cfg.id,
    title: cfg.title,
    shortTitle: cfg.shortTitle,
    actNo: cfg.actNo,
    year: cfg.year,
    enactedOn: cfg.enactedOn,
    inForceFrom: cfg.inForceFrom,
    repealedOn: cfg.repealedOn ?? null,
    replacedBy: cfg.replacedBy ?? null,
    replaces: cfg.replaces ?? null,
    longTitle: cfg.longTitle ?? res.indiaCodeMeta?.longTitle ?? null,
    category: cfg.category,
    source: res.source,
    sourceNote: cfg.sourceNote,
    chapters: res.chapters,
    sectionCount: sections.length,
    sections,
  };
  writeFileSync(join(OUT, `${cfg.id}.json`), JSON.stringify(doc, null, 1));
  console.log(`  ✓ ${cfg.id}: ${sections.length} sections, ${res.chapters.length} chapters → data/corpus/${cfg.id}.json`);
  return doc;
}

async function buildCodeMap() {
  console.log("\n▶ Old↔new correspondence: NCRB SANKALAN section tables");
  const out = { generatedOn: today, publisher: "National Crime Records Bureau (NCRB), Ministry of Home Affairs, Government of India", pairs: [] };
  for (const t of NCRB_TABLES) {
    const html = await getText(t.url, { useCache });
    const { rows, deleted } = parseNcrbTable(html, t.header);
    // Section-level pairs, merged across sub-section rows.
    const pairMap = new Map();
    for (const r of rows) {
      for (const o of r.old) {
        const k = `${o.section}→${r.newSection}`;
        const prev = pairMap.get(k);
        const detail = `${t.newAct} ${r.newRef} ↔ ${t.oldAct} ${o.ref}`;
        if (prev) {
          if (!prev.details.includes(detail)) prev.details.push(detail);
          prev.changed ||= r.changed;
        } else {
          pairMap.set(k, { oldSection: o.section, newSection: r.newSection, subject: r.newHeading, changed: r.changed, details: [detail] });
        }
      }
    }
    const newOnly = [...new Set(rows.filter((r) => r.kind === "new").map((r) => r.newRef))];
    const pairs = [...pairMap.values()];
    out.pairs.push({
      oldAct: t.oldAct,
      newAct: t.newAct,
      sourceUrl: t.url,
      sourceTitle: t.title,
      rows: pairs,
      newProvisions: newOnly,
      deleted: deleted.map((d) => ({ section: d.section, ref: d.ref, text: d.text })),
    });
    console.log(`  ✓ ${t.oldAct}→${t.newAct}: ${pairs.length} section pairs, ${newOnly.length} new provisions, ${deleted.length} omitted old provisions`);
  }
  writeFileSync(join(OUT, "code-map.json"), JSON.stringify(out, null, 1));
}

async function main() {
  const acts = ACTS.filter((a) => !only || only.includes(a.id));
  const failures = [];
  for (const cfg of acts) {
    try {
      await ingestAct(cfg);
    } catch (e) {
      failures.push(`${cfg.id}: ${e.message}`);
      console.error(`  ✗ ${cfg.id} failed: ${e.message}`);
    }
  }
  if (!skipMap && (!only || only.includes("MAP"))) {
    try {
      await buildCodeMap();
    } catch (e) {
      failures.push(`code map: ${e.message}`);
      console.error(`  ✗ code map failed: ${e.message}`);
    }
  }
  if (failures.length) {
    console.error(`\nFinished with ${failures.length} failure(s):\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\nDone. Run `node scripts/corpus/validate.mjs` next.");
}

main();
