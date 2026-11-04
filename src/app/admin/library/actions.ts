"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { acts, judgments, sections } from "@/lib/db/schema";
import { adminForAction, NOT_ADMIN } from "@/lib/admin/guard";
import { ActionError, ActionFieldError, ok, type ActionResult } from "@/lib/action";
import { defineAction } from "@/lib/define-action";
import { CORPUS_LIMITS, maxSafeRemovals, SectionInputError, UnsafeChangeError } from "@/lib/corpus/plan";
import { removeSection, reviseSections, type ChangeResult } from "@/lib/corpus/revise";
import { isJudgmentId } from "@/lib/judgments/queries";

// Admin edits to the law library, built with defineAction: session, the
// "admin.library" permission, zod validation, rate limit, audit and revalidation.
// defineAction runs `run` inside withUser (row-level security): reads use that `tx`,
// but the corpus is server-only reference data that app_user cannot write, so writes
// go through the owner connection after a fresh admin check (database role, ban,
// two-factor). Statute text only ever changes through reviseSections / removeSection,
// which take the act's advisory lock and record each change in the append-only
// corpus.section_revisions.

const ACT_ID = /^[A-Z][A-Z0-9_]{1,15}$/;
const SECTION_NO = /^\d{1,4}[A-Z]{0,4}$/;

const actIdSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(ACT_ID, "Use 2–16 capital letters, digits or _ starting with a letter, e.g. BNS2."));
const sectionNoSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase().replace(/^S(?:EC(?:TION)?)?\.?\s*/, ""))
  .pipe(z.string().regex(SECTION_NO, "Use a section number such as 103 or 498A."));
const noteSchema = z.string().trim().min(5, "Say why (at least 5 characters); it is kept in the history.").max(500);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable()
    .optional()
    .transform((v) => v ?? null);
const optDate = z
  .string()
  .trim()
  .refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), "Use a date")
  .transform((s) => s || null)
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const LIBRARY = "admin.library" as const;
const TEXT_PATHS = (actId: string) => ["/admin/library", `/admin/library/acts/${actId}`, "/app/research"];

/** defineAction checks the session's role; this also checks the database, like every admin action. */
async function freshAdmin() {
  const admin = await adminForAction();
  if (!admin) throw new ActionError(NOT_ADMIN);
  return admin;
}

/** Corpus rule violations and guard refusals are safe to show to the admin. */
function corpusRefusal(err: unknown): never {
  if (err instanceof SectionInputError) {
    if (err.code === "exists") throw new ActionFieldError("sectionNo", err.message);
    if (err.code === "unknown_act") throw new ActionError("Act not found.");
    throw new ActionError(err.message);
  }
  if (err instanceof UnsafeChangeError) throw new ActionError(err.message);
  throw err;
}

/* -------------------------------- judgments -------------------------------- */

const deleteJudgmentAction = defineAction({
  input: z.string(),
  permission: LIBRARY,
  rateLimit: { name: "library:delete", limit: 60, windowSeconds: 3600 },
  run: async ({ input: id }) => {
    if (!isJudgmentId(id)) throw new ActionError("Judgment not found.");
    await freshAdmin();
    const [row] = await db
      .delete(judgments)
      .where(eq(judgments.id, id))
      .returning({ id: judgments.id, title: judgments.title, court: judgments.court, citation: judgments.citation, sourceKey: judgments.sourceKey });
    if (!row) throw new ActionError("Judgment not found.");
    return row;
  },
  audit: (id, row) => ({
    action: "admin.judgment_deleted",
    entityType: "judgment",
    entityId: id,
    data: { title: row.title, court: row.court, citation: row.citation, sourceKey: row.sourceKey },
  }),
  revalidate: () => ["/admin/library", "/app/research"],
});

export async function deleteJudgment(id: string): Promise<ActionResult> {
  const r = await deleteJudgmentAction(id);
  return r.ok ? ok(undefined) : r;
}

/* ---------------------------------- acts ---------------------------------- */

const actSchema = z.object({
  id: actIdSchema,
  title: z.string().trim().min(3, "Enter the full title.").max(300),
  shortTitle: z.string().trim().min(2, "Enter a short title.").max(160),
  actNo: optText(120),
  year: z.coerce.number().int().min(1800, "Enter the year of the act.").max(2100),
  inForceFrom: optDate,
  sourceUrl: z.string().trim().url("Use a full link starting with https://").max(500),
  sourceNote: optText(1000),
  tracked: z.boolean().default(false),
});
export type ActInput = z.input<typeof actSchema>;

const createActAction = defineAction({
  input: actSchema,
  permission: LIBRARY,
  rateLimit: { name: "library:act", limit: 60, windowSeconds: 3600 },
  run: async ({ input: a }) => {
    await freshAdmin();
    const [row] = await db
      .insert(acts)
      .values({ ...a, updatedAt: sql`now()` })
      .onConflictDoNothing({ target: acts.id })
      .returning({ id: acts.id });
    if (!row) throw new ActionFieldError("id", `An act with the id ${a.id} already exists.`);
    return { id: row.id };
  },
  audit: (a) => ({ action: "admin.act_created", entityType: "act", entityId: a.id, data: { title: a.title, year: a.year, sourceUrl: a.sourceUrl } }),
  revalidate: () => ["/admin/library"],
});

export async function createAct(input: ActInput): Promise<ActionResult<{ id: string }>> {
  return createActAction(input);
}

const updateActAction = defineAction({
  input: actSchema.omit({ tracked: true }),
  permission: LIBRARY,
  rateLimit: { name: "library:act", limit: 60, windowSeconds: 3600 },
  run: async ({ tx, input }) => {
    const { id, ...rest } = input;
    await freshAdmin();
    const [before] = await tx.select().from(acts).where(eq(acts.id, id)).limit(1);
    if (!before) throw new ActionError("Act not found.");
    // Marks the act as changed so seeding keeps the edit.
    await db.update(acts).set({ ...rest, updatedAt: sql`now()` }).where(eq(acts.id, id));
    const changed = Object.fromEntries(
      Object.entries(rest)
        .filter(([k, v]) => String(before[k as keyof typeof before] ?? "") !== String(v ?? ""))
        .map(([k, v]) => [k, { from: before[k as keyof typeof before] ?? null, to: v }]),
    );
    return { changed };
  },
  audit: (input, r) => ({ action: "admin.act_updated", entityType: "act", entityId: input.id, data: { changed: r.changed } }),
  revalidate: (input) => ["/admin/library", `/admin/library/acts/${input.id}`],
});

/** Updates an act's details (not its text). Marks the act as changed so seeding keeps the edit. */
export async function updateAct(input: ActInput): Promise<ActionResult> {
  const r = await updateActAction(input);
  return r.ok ? ok(undefined) : r;
}

const trackedSchema = z.object({ actId: actIdSchema, tracked: z.boolean() });

const setActTrackedAction = defineAction({
  input: trackedSchema,
  permission: LIBRARY,
  rateLimit: { name: "library:act", limit: 60, windowSeconds: 3600 },
  run: async ({ input }) => {
    await freshAdmin();
    const [row] = await db.update(acts).set({ tracked: input.tracked }).where(eq(acts.id, input.actId)).returning({ id: acts.id });
    if (!row) throw new ActionError("Act not found.");
    return row;
  },
  audit: (input, row) => ({ action: "admin.act_tracking_changed", entityType: "act", entityId: row.id, data: { tracked: input.tracked } }),
  revalidate: (_input, row) => ["/admin/library", `/admin/library/acts/${row.id}`],
});

export async function setActTracked(input: { actId: string; tracked: boolean }): Promise<ActionResult> {
  const r = await setActTrackedAction(input);
  return r.ok ? ok(undefined) : r;
}

/* -------------------------------- sections -------------------------------- */

const sectionSchema = z.object({
  actId: actIdSchema,
  sectionNo: sectionNoSchema,
  heading: z.string().trim().min(1, "Enter the heading.").max(CORPUS_LIMITS.headingMax),
  text: z.string().trim().min(1, "Enter the section text.").max(100_000),
  chapter: optText(CORPUS_LIMITS.chapterMax),
  sortKey: z.number().int().min(1).max(10_000_000).optional(),
});

const sectionRefSchema = z.object({ actId: actIdSchema, sectionNo: sectionNoSchema });

const loadSectionAction = defineAction({
  input: sectionRefSchema,
  permission: LIBRARY,
  run: async ({ tx, input }) => {
    await freshAdmin();
    // The corpus is readable by app_user: a plain read inside the action's own transaction.
    const [row] = await tx
      .select({ heading: sections.heading, text: sections.text, chapter: sections.chapter })
      .from(sections)
      .where(and(eq(sections.actId, input.actId), eq(sections.sectionNo, input.sectionNo)))
      .limit(1);
    if (!row) throw new ActionError("Section not found.");
    return row;
  },
});

/** Full text of one section, for the editor. */
export async function loadSection(input: { actId: string; sectionNo: string }): Promise<ActionResult<{ heading: string; text: string; chapter: string | null }>> {
  return loadSectionAction(input);
}

const saveSectionSchema = sectionSchema.extend({ note: noteSchema, mode: z.enum(["add", "edit"]) });

const saveSectionAction = defineAction({
  input: saveSectionSchema,
  permission: LIBRARY,
  rateLimit: { name: "library:section", limit: 300, windowSeconds: 3600 },
  run: async ({ input: s }) => {
    const admin = await freshAdmin();
    // "add" and "edit" are checked under the act lock, so two admins cannot both add s. 3A.
    const r = await reviseSections(
      s.actId,
      [{ sectionNo: s.sectionNo, heading: s.heading, text: s.text, chapter: s.chapter, sortKey: s.sortKey, expect: s.mode === "add" ? "new" : "existing" }],
      { source: "admin", changedBy: admin.id, note: s.note },
    ).catch(corpusRefusal);
    const result: ChangeResult = r.added.length ? "added" : r.changed.length ? "changed" : "unchanged";
    return { result };
  },
  audit: (s, r) =>
    r.result === "unchanged"
      ? null
      : { action: r.result === "added" ? "admin.section_added" : "admin.section_changed", entityType: "section", entityId: `${s.actId}:${s.sectionNo}`, data: { note: s.note } },
  revalidate: (s) => TEXT_PATHS(s.actId),
});

export async function saveSection(input: z.input<typeof sectionSchema> & { note: string; mode: "add" | "edit" }): Promise<ActionResult<{ result: ChangeResult }>> {
  return saveSectionAction(input);
}

const deleteSectionAction = defineAction({
  input: sectionRefSchema.extend({ note: noteSchema }),
  permission: LIBRARY,
  rateLimit: { name: "library:section", limit: 300, windowSeconds: 3600 },
  run: async ({ input }) => {
    const admin = await freshAdmin();
    const removed = await removeSection({ actId: input.actId, sectionNo: input.sectionNo, source: "admin", changedBy: admin.id, note: input.note }).catch(corpusRefusal);
    if (!removed) throw new ActionError("Section not found.");
    return { removed };
  },
  audit: (input) => ({ action: "admin.section_removed", entityType: "section", entityId: `${input.actId}:${input.sectionNo}`, data: { note: input.note } }),
  revalidate: (input) => TEXT_PATHS(input.actId),
});

export async function deleteSection(input: { actId: string; sectionNo: string; note: string }): Promise<ActionResult> {
  const r = await deleteSectionAction(input);
  return r.ok ? ok(undefined) : r;
}

const batchSchema = z.object({
  actId: actIdSchema,
  note: noteSchema,
  sections: z.array(sectionSchema.omit({ actId: true })).max(40),
  /** Sections not in the pasted text, removed when the admin ticked "remove". */
  remove: z.array(sectionNoSchema).max(500).optional(),
});

const saveSectionsBatchAction = defineAction({
  input: batchSchema.refine((b) => b.sections.length > 0 || (b.remove?.length ?? 0) > 0, "Nothing to save."),
  permission: LIBRARY,
  rateLimit: { name: "library:bulk", limit: 200, windowSeconds: 3600 },
  run: async ({ input }) => {
    const admin = await freshAdmin();
    const r = await reviseSections(
      input.actId,
      {
        // No chapter in the pasted text keeps the stored chapter.
        upsert: input.sections.map((s) => ({ sectionNo: s.sectionNo, heading: s.heading, text: s.text, chapter: s.chapter ?? undefined, sortKey: s.sortKey })),
        remove: input.remove ?? [],
      },
      { source: "admin", changedBy: admin.id, note: input.note, removalNote: `${input.note} (not in the pasted act text)` },
      {
        // The same removal limit as the India Code sync: larger removals are done one by one.
        guard: ({ removed, currentCount }) =>
          removed.length > maxSafeRemovals(currentCount)
            ? `${removed.length} sections would be removed at once; at most ${maxSafeRemovals(currentCount)} can be removed with a paste. Remove the others one by one.`
            : null,
      },
    ).catch(corpusRefusal);
    return r;
  },
  audit: (input, r) =>
    r.wrote
      ? {
          action: "admin.sections_imported",
          entityType: "act",
          entityId: input.actId,
          data: { note: input.note, added: r.counts.added, changed: r.counts.changed, removed: r.counts.removed, sections: [...r.added, ...r.changed].slice(0, 200), removedSections: r.removed.slice(0, 200) },
        }
      : null,
  revalidate: (input) => TEXT_PATHS(input.actId),
});

/** Saves one batch of sections confirmed in the "Paste full act text" preview, in one transaction. */
export async function saveSectionsBatch(input: {
  actId: string;
  note: string;
  sections: { sectionNo: string; heading: string; text: string; chapter: string | null; sortKey?: number }[];
  remove?: string[];
}): Promise<ActionResult<{ added: number; changed: number; unchanged: number; removed: number }>> {
  const r = await saveSectionsBatchAction(input);
  return r.ok ? ok({ added: r.data.counts.added, changed: r.data.counts.changed, unchanged: r.data.counts.unchanged, removed: r.data.counts.removed }) : r;
}
