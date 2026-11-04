// Law-library admin actions (defineAction + owner-connection corpus writes) against an
// in-memory PostgreSQL: permission and fresh admin check, field errors, audit records,
// the add-versus-edit check, and the removal limit on the paste flow.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; role: string },
  fresh: true,
  audits: [] as { action: string; actorId?: string | null; entityId?: string | null; data?: Record<string, unknown> | null }[],
  revalidated: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void state.revalidated.push(p) }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: async () => state.user, requestIp: async () => "203.0.113.9" }));
vi.mock("@/lib/admin/guard", () => ({
  NOT_ADMIN: "You need administrator access.",
  adminForAction: async () => (state.user && state.user.role === "admin" && state.fresh ? state.user : null),
}));
vi.mock("@/lib/audit", () => ({ appendAudit: async (e: (typeof state.audits)[number]) => void state.audits.push(e) }));
vi.mock("@/lib/rate-limit", () => ({ RateLimitError: class extends Error {}, enforceRateLimit: async () => {} }));
vi.mock("@/lib/judgments/queries", () => ({ isJudgmentId: (id: string) => /^[0-9a-f-]{36}$/.test(id) }));
vi.mock("@/lib/db", async () => (await import("../../../../test/pglite-db")).mockDbModule());

const { db, __pg: pg } = (await import("@/lib/db")) as unknown as import("../../../../test/pglite-db").TestDbModule;
const { acts, sections } = await import("@/lib/db/schema");
const actions = await import("./actions");

const ACT = "LIBTEST";
const admin = { id: "admin-1", role: "admin" };
const nos = async () => (await db.select({ no: sections.sectionNo }).from(sections).where(eq(sections.actId, ACT)).orderBy(asc(sections.sortKey))).map((r) => r.no);

beforeEach(async () => {
  state.user = admin;
  state.fresh = true;
  state.audits = [];
  state.revalidated = [];
  await pg.exec(`delete from corpus.sections where act_id = '${ACT}'; delete from corpus.acts where id = '${ACT}';`);
  await db.insert(acts).values({ id: ACT, title: "Library Test Act", shortTitle: "Library Test", year: 2026, sourceUrl: "https://example.test" });
  await db.insert(sections).values(Array.from({ length: 12 }, (_, i) => ({ actId: ACT, sectionNo: String(i + 1), sortKey: (i + 1) * 10, heading: `H${i + 1}`, text: `T${i + 1}` })));
});

describe("permission", () => {
  it("refuses signed-out users, non-admins and admins who lost access, writing nothing", async () => {
    state.user = null;
    expect(await actions.deleteSection({ actId: ACT, sectionNo: "1", note: "remove it" })).toEqual({ ok: false, error: "Please sign in." });
    state.user = { id: "u1", role: "advocate" };
    expect(await actions.deleteSection({ actId: ACT, sectionNo: "1", note: "remove it" })).toEqual({ ok: false, error: "You do not have access to this." });
    // Session still says admin, the database no longer does (demoted, banned, no 2FA).
    state.user = admin;
    state.fresh = false;
    expect(await actions.deleteSection({ actId: ACT, sectionNo: "1", note: "remove it" })).toEqual({ ok: false, error: "You need administrator access." });
    expect(await nos()).toHaveLength(12);
    expect(state.audits).toEqual([]);
  });
});

describe("sections", () => {
  it("adds, edits and removes through the revision API, auditing each change", async () => {
    const add = await actions.saveSection({ actId: ACT.toLowerCase(), sectionNo: "s. 2a", heading: "New", text: "Inserted.", chapter: null, note: "Inserted by amendment", mode: "add" });
    expect(add).toEqual({ ok: true, data: { result: "added" } });
    expect((await nos()).slice(0, 4)).toEqual(["1", "2", "2A", "3"]);
    expect(state.audits[0]).toMatchObject({ action: "admin.section_added", actorId: "admin-1", entityId: `${ACT}:2A` });

    const same = await actions.saveSection({ actId: ACT, sectionNo: "2A", heading: "New", text: "Inserted.", chapter: null, note: "No real change", mode: "edit" });
    expect(same).toEqual({ ok: true, data: { result: "unchanged" } });
    expect(state.audits).toHaveLength(1);

    const dup = await actions.saveSection({ actId: ACT, sectionNo: "2A", heading: "x", text: "y", chapter: null, note: "Add again", mode: "add" });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.fieldErrors?.sectionNo).toMatch(/already exists/);

    const missing = await actions.saveSection({ actId: ACT, sectionNo: "99", heading: "x", text: "y", chapter: null, note: "Edit missing", mode: "edit" });
    expect(missing).toEqual({ ok: false, error: "Section 99 not found." });

    expect(await actions.deleteSection({ actId: ACT, sectionNo: "2A", note: "Omitted again" })).toEqual({ ok: true, data: undefined });
    expect(await actions.deleteSection({ actId: ACT, sectionNo: "2A", note: "Omitted again" })).toEqual({ ok: false, error: "Section not found." });
    expect(state.audits.map((a) => a.action)).toEqual(["admin.section_added", "admin.section_removed"]);
    expect(state.revalidated).toContain(`/admin/library/acts/${ACT}`);
  });

  it("loads a section for the editor", async () => {
    expect(await actions.loadSection({ actId: ACT, sectionNo: "3" })).toEqual({ ok: true, data: { heading: "H3", text: "T3", chapter: null } });
    expect(await actions.loadSection({ actId: ACT, sectionNo: "300" })).toEqual({ ok: false, error: "Section not found." });
  });

  it("saves a pasted batch in one transaction, and limits removals like the sync", async () => {
    const r = await actions.saveSectionsBatch({
      actId: ACT,
      note: "Text from India Code",
      sections: [
        { sectionNo: "1", heading: "H1", text: "T1", chapter: null },
        { sectionNo: "2", heading: "H2", text: "T2 amended", chapter: null },
        { sectionNo: "13", heading: "H13", text: "T13", chapter: "Chapter II" },
      ],
      remove: ["12"],
    });
    expect(r).toEqual({ ok: true, data: { added: 1, changed: 1, unchanged: 1, removed: 1 } });
    expect(state.audits[0]).toMatchObject({ action: "admin.sections_imported", data: { added: 1, changed: 1, removed: 1, removedSections: ["12"] } });

    // 12 sections now: at most 10 may go in one paste.
    const tooMany = await actions.saveSectionsBatch({ actId: ACT, note: "Remove most", sections: [], remove: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"] });
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error).toMatch(/11 sections would be removed at once; at most 10/);
    expect(await nos()).toHaveLength(12);

    const unknown = await actions.saveSectionsBatch({ actId: "NOPE", note: "Unknown act", sections: [{ sectionNo: "1", heading: "h", text: "t", chapter: null }] });
    expect(unknown).toEqual({ ok: false, error: "Act not found." });
  });
});

describe("acts", () => {
  it("creates an act once and reports a taken id on the field", async () => {
    const input = { id: "newact", title: "The New Act, 2026", shortTitle: "New Act", year: 2026, sourceUrl: "https://example.test/new" };
    expect(await actions.createAct(input)).toEqual({ ok: true, data: { id: "NEWACT" } });
    const again = await actions.createAct(input);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.fieldErrors?.id).toMatch(/already exists/);
    await pg.exec("delete from corpus.acts where id = 'NEWACT'");
  });

  it("updates details and tracking, auditing what changed", async () => {
    expect(await actions.updateAct({ id: ACT, title: "Library Test Act, renamed", shortTitle: "Library Test", year: 2026, sourceUrl: "https://example.test" })).toEqual({ ok: true, data: undefined });
    expect(state.audits[0]).toMatchObject({ action: "admin.act_updated", data: { changed: { title: { from: "Library Test Act", to: "Library Test Act, renamed" } } } });
    expect(await actions.setActTracked({ actId: ACT, tracked: false })).toEqual({ ok: true, data: undefined });
    expect((await db.select({ t: acts.tracked }).from(acts).where(eq(acts.id, ACT)))[0].t).toBe(false);
  });
});
