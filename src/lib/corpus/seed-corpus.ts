import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { and, eq, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { acts, codeMap, sections } from "@/lib/db/schema";

// Seeds bare acts and the NCRB old→new code map from data/corpus/*.json (written by
// scripts/corpus/ingest.mjs). Idempotent: acts and sections are upserted, sections no
// longer in the data are removed, and each code-map table is replaced as a whole.

type SectionJson = { no: string; sortKey: number; heading: string; chapter: string | null; text: string; footnotes: string[] };
type ActJson = {
  id: string;
  title: string;
  shortTitle: string;
  actNo: string;
  year: number;
  inForceFrom: string | null;
  repealedOn: string | null;
  replacedBy: string | null;
  source: { name: string; url: string; retrievedOn: string };
  sourceNote: string;
  sections: SectionJson[];
};
type CodeMapJson = {
  publisher: string;
  pairs: {
    oldAct: string;
    newAct: string;
    sourceUrl: string;
    sourceTitle: string;
    rows: { oldSection: string; newSection: string; subject: string | null; changed: boolean; details: string[] }[];
  }[];
};

const DIR = path.join(process.cwd(), "data", "corpus");
const BATCH = 100;

/** Section text as stored for search and AI context: body, then the amendment footnotes. */
export function sectionText(s: Pick<SectionJson, "text" | "footnotes">) {
  if (!s.footnotes?.length) return s.text;
  return `${s.text}\n\nFootnotes:\n${s.footnotes.map((f, i) => `${i + 1}. ${f}`).join("\n")}`;
}

export async function seedCorpus(db: Db): Promise<void> {
  if (!existsSync(DIR)) {
    console.log("· data/corpus not found; run `node scripts/corpus/ingest.mjs` first, corpus skipped");
    return;
  }
  const files = readdirSync(DIR).filter((f) => /^[A-Z]+\.json$/.test(f));
  if (files.length === 0) {
    console.log("· no act files in data/corpus, corpus skipped");
    return;
  }

  let total = 0;
  for (const file of files) {
    const act = JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as ActJson;
    const actRow = {
      id: act.id,
      title: act.title,
      shortTitle: act.shortTitle,
      actNo: act.actNo,
      year: act.year,
      inForceFrom: act.inForceFrom,
      repealedOn: act.repealedOn,
      replacedBy: act.replacedBy,
      sourceUrl: act.source.url,
      sourceNote: `${act.source.name}. Retrieved ${act.source.retrievedOn}. ${act.sourceNote}`,
    };
    // Acts changed after seeding (India Code sync or an admin edit, see revise.ts) keep
    // their current text: re-seeding must never silently undo a recorded change.
    const [existing] = await db.select({ updatedAt: acts.updatedAt }).from(acts).where(eq(acts.id, act.id)).limit(1);
    if (existing?.updatedAt) {
      console.log(`· ${act.id}: kept (updated ${existing.updatedAt.toISOString().slice(0, 10)} after seeding)`);
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.insert(acts).values(actRow).onConflictDoUpdate({ target: acts.id, set: actRow });
      for (let i = 0; i < act.sections.length; i += BATCH) {
        const rows = act.sections.slice(i, i + BATCH).map((s) => ({
          actId: act.id,
          sectionNo: s.no,
          sortKey: s.sortKey,
          heading: s.heading,
          chapter: s.chapter,
          text: sectionText(s),
        }));
        await tx
          .insert(sections)
          .values(rows)
          .onConflictDoUpdate({
            target: [sections.actId, sections.sectionNo],
            set: {
              sortKey: sql`excluded.sort_key`,
              heading: sql`excluded.heading`,
              chapter: sql`excluded.chapter`,
              text: sql`excluded.text`,
            },
          });
      }
      const keep = act.sections.map((s) => s.no);
      await tx.delete(sections).where(and(eq(sections.actId, act.id), notInArray(sections.sectionNo, keep)));
    });
    total += act.sections.length;
    console.log(`✓ ${act.id}: ${act.sections.length} sections`);
  }

  const mapFile = path.join(DIR, "code-map.json");
  if (existsSync(mapFile)) {
    const map = JSON.parse(readFileSync(mapFile, "utf8")) as CodeMapJson;
    let pairs = 0;
    for (const p of map.pairs) {
      await db.transaction(async (tx) => {
        await tx.delete(codeMap).where(and(eq(codeMap.oldAct, p.oldAct), eq(codeMap.newAct, p.newAct)));
        const source = `${p.sourceTitle} (${map.publisher}): ${p.sourceUrl}`;
        for (let i = 0; i < p.rows.length; i += BATCH) {
          await tx.insert(codeMap).values(
            p.rows.slice(i, i + BATCH).map((r) => ({
              oldAct: p.oldAct,
              oldSection: r.oldSection,
              newAct: p.newAct,
              newSection: r.newSection,
              subject: r.subject,
              note: `${r.details.join("; ")}${r.changed ? ". NCRB marks the new provision as changed." : ""}`,
              source,
            })),
          );
        }
      });
      pairs += p.rows.length;
    }
    console.log(`✓ code map: ${pairs} official NCRB correspondence rows`);
  } else {
    console.log("· data/corpus/code-map.json not found, code map skipped");
  }
  console.log(`✓ corpus: ${total} sections from ${files.length} acts`);
}
