// reviseSection / reviseSections / removeSection against an in-memory PostgreSQL
// (PGlite) with the real migrations and security.sql.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, sql } from "drizzle-orm";

vi.mock("@/lib/db", async () => (await import("../../../test/pglite-db")).mockDbModule());

const { db, __pg: pg } = (await import("@/lib/db")) as unknown as import("../../../test/pglite-db").TestDbModule;
const { acts, sectionRevisions, sections } = await import("@/lib/db/schema");
const { removeSection, reviseSection, reviseSections, SectionInputError, UnsafeChangeError } = await import("./revise");

const ACT = "TESTACT";
const by = { source: "admin" as const, changedBy: "admin-1", note: "test edit" };

async function rows() {
  return db.select({ no: sections.sectionNo, key: sections.sortKey, heading: sections.heading, text: sections.text, chapter: sections.chapter }).from(sections).where(eq(sections.actId, ACT)).orderBy(asc(sections.sortKey));
}
async function revisionCount() {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(sectionRevisions).where(eq(sectionRevisions.actId, ACT));
  return r.n;
}

beforeEach(async () => {
  // section_revisions is append-only; a fresh act id per test keeps the history separate.
  await pg.exec(`delete from corpus.sections where act_id = '${ACT}'; delete from corpus.acts where id = '${ACT}';`);
  await db.insert(acts).values({ id: ACT, title: "The Test Act, 2026", shortTitle: "Test Act", year: 2026, sourceUrl: "https://example.test/act" });
  await db.insert(sections).values(
    ["1", "2", "3"].map((no, i) => ({ actId: ACT, sectionNo: no, sortKey: (i + 1) * 10, heading: `Heading ${no}`, text: `Text of ${no}.`, chapter: "Chapter I" })),
  );
  await pg.exec(`create temp table if not exists rev_mark as select 0 as n; truncate rev_mark; insert into rev_mark select count(*) from corpus.section_revisions where act_id = '${ACT}';`);
});

const revisionsSinceStart = async () => (await revisionCount()) - Number(((await pg.query<{ n: number }>("select n from rev_mark")).rows[0]?.n ?? 0));

describe("reviseSection", () => {
  it("adds, changes and skips unchanged sections, recording each change", async () => {
    expect(await reviseSection({ actId: ACT, sectionNo: "2A", heading: "New", text: "Inserted.", ...by })).toBe("added");
    expect(await reviseSection({ actId: ACT, sectionNo: "2", heading: "Heading 2", text: "Text of 2.", ...by })).toBe("unchanged");
    expect(await reviseSection({ actId: ACT, sectionNo: "2", heading: "Heading 2", text: "Amended.", ...by })).toBe("changed");
    expect(await revisionsSinceStart()).toBe(2);

    const list = await rows();
    expect(list.map((r) => r.no)).toEqual(["1", "2", "2A", "3"]);
    expect(list.find((r) => r.no === "2A")?.key).toBe(25);
    const [rev] = await db
      .select()
      .from(sectionRevisions)
      .where(and(eq(sectionRevisions.actId, ACT), eq(sectionRevisions.sectionNo, "2")))
      .orderBy(sql`${sectionRevisions.createdAt} desc`)
      .limit(1);
    expect(rev).toMatchObject({ beforeText: "Text of 2.", afterText: "Amended.", source: "admin", changedBy: "admin-1", note: "test edit" });
    const [act] = await db.select({ updatedAt: acts.updatedAt }).from(acts).where(eq(acts.id, ACT));
    expect(act.updatedAt).toBeInstanceOf(Date);
  });

  it("validates the input before touching the database", async () => {
    const bad = async (change: Partial<Parameters<typeof reviseSection>[0]>) =>
      reviseSection({ actId: ACT, sectionNo: "9", heading: "h", text: "t", ...by, ...change }).then(
        () => null,
        (e: unknown) => e,
      );
    expect(await bad({ sectionNo: "9-A" })).toMatchObject({ code: "invalid_section_no" });
    expect(await bad({ heading: " " })).toMatchObject({ code: "invalid_heading" });
    expect(await bad({ text: "x".repeat(200_001) })).toMatchObject({ code: "invalid_text" });
    expect(await bad({ text: "nul\u0000" })).toMatchObject({ code: "invalid_text" });
    expect(await bad({ changedBy: "" })).toMatchObject({ code: "invalid_meta" });
    const unknown = await bad({ actId: "NOSUCHACT" });
    expect(unknown).toBeInstanceOf(SectionInputError);
    expect((unknown as Error).message).toMatch(/^Unknown act/);
    expect(await revisionsSinceStart()).toBe(0);
  });

  it("checks add-versus-edit under the lock", async () => {
    await expect(reviseSections(ACT, [{ sectionNo: "1", heading: "x", text: "y", expect: "new" }], by)).rejects.toMatchObject({ code: "exists" });
    await expect(reviseSections(ACT, [{ sectionNo: "7", heading: "x", text: "y", expect: "existing" }], by)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("reviseSections", () => {
  it("applies a batch in one transaction and summarises it", async () => {
    const r = await reviseSections(
      ACT,
      {
        upsert: [
          { sectionNo: "1", heading: "Heading 1", text: "Text of 1." },
          { sectionNo: "2", heading: "Heading 2", text: "Amended 2.", sourceRef: "https://example.test/s2" },
          { sectionNo: "4", heading: "Heading 4", text: "New 4.", chapter: "Chapter II" },
        ],
        remove: ["3", "99"],
      },
      { ...by, removalNote: "omitted" },
    );
    expect(r).toMatchObject({ added: ["4"], changed: ["2"], unchanged: ["1"], removed: ["3"], notFound: ["99"], wrote: true });
    expect(r.counts).toEqual({ added: 1, changed: 1, unchanged: 1, removed: 1, notFound: 1 });
    expect((await rows()).map((x) => x.no)).toEqual(["1", "2", "4"]);
    expect(await revisionsSinceStart()).toBe(3);
    const revs = await db.select().from(sectionRevisions).where(eq(sectionRevisions.actId, ACT));
    expect(revs.find((x) => x.sectionNo === "3")).toMatchObject({ afterText: null, beforeText: "Text of 3.", note: "omitted" });
    expect(revs.find((x) => x.sectionNo === "2" && x.afterText === "Amended 2.")?.sourceRef).toBe("https://example.test/s2");
  });

  it("rolls the whole batch back when the guard refuses", async () => {
    const attempt = reviseSections(ACT, { upsert: [{ sectionNo: "1", heading: "Heading 1", text: "Changed." }], remove: ["2", "3"] }, by, {
      guard: ({ removed, currentCount }) => (removed.length > 1 ? `refused: ${removed.length} of ${currentCount}` : null),
    });
    await expect(attempt).rejects.toBeInstanceOf(UnsafeChangeError);
    await expect(attempt).rejects.toThrow("refused: 2 of 3");
    expect((await rows()).map((x) => [x.no, x.text])).toEqual([
      ["1", "Text of 1."],
      ["2", "Text of 2."],
      ["3", "Text of 3."],
    ]);
    expect(await revisionsSinceStart()).toBe(0);
  });

  it("refuses repeated or contradictory sections and writes nothing", async () => {
    await expect(reviseSections(ACT, [sec("5"), sec("5")], by)).rejects.toMatchObject({ code: "duplicate" });
    await expect(reviseSections(ACT, { upsert: [sec("1")], remove: ["1"] }, by)).rejects.toMatchObject({ code: "conflict" });
    expect(await revisionsSinceStart()).toBe(0);
  });

  it("plans without writing in a dry run", async () => {
    const r = await reviseSections(ACT, { upsert: [{ sectionNo: "1", heading: "Heading 1", text: "Changed." }] }, by, { dryRun: true });
    expect(r).toMatchObject({ changed: ["1"], wrote: false });
    expect((await rows())[0].text).toBe("Text of 1.");
  });

  it("spaces the keys out when a new section has no gap left", async () => {
    await db.update(sections).set({ sortKey: 11 }).where(and(eq(sections.actId, ACT), eq(sections.sectionNo, "2")));
    await reviseSection({ actId: ACT, sectionNo: "1A", heading: "h", text: "t", ...by });
    const list = await rows();
    expect(list.map((x) => x.no)).toEqual(["1", "1A", "2", "3"]);
    expect(new Set(list.map((x) => x.key)).size).toBe(4);
  });

  it("holds the act's advisory lock until the transaction ends", async () => {
    const held = await db.transaction(async (tx) => {
      await reviseSections(ACT, [{ sectionNo: "1", heading: "Heading 1", text: "Locked change." }], by, { conn: tx as never });
      const r = await tx.execute(sql`select count(*)::int as n from pg_locks where locktype = 'advisory' and objid = (hashtext(${`corpus:${ACT}`}))::oid`);
      return (r as unknown as { rows: { n: number }[] }).rows[0].n;
    });
    expect(held).toBeGreaterThan(0);
    const after = await pg.query<{ n: number }>(`select count(*)::int as n from pg_locks where locktype = 'advisory'`);
    expect(after.rows[0].n).toBe(0);
  });
});

describe("removeSection", () => {
  it("removes an existing section, keeps its text in the history, and reports a missing one", async () => {
    expect(await removeSection({ actId: ACT, sectionNo: "3", ...by })).toBe(true);
    expect(await removeSection({ actId: ACT, sectionNo: "3", ...by })).toBe(false);
    expect((await rows()).map((x) => x.no)).toEqual(["1", "2"]);
    expect(await revisionsSinceStart()).toBe(1);
  });
});

function sec(no: string) {
  return { sectionNo: no, heading: `Heading ${no}`, text: `Text of ${no}.` };
}
