"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";
import { generateCompletion } from "@/lib/ai/gateway";
import { appendAudit } from "@/lib/audit";
import { getCurrentUser, requestIp } from "@/lib/auth/dal";
import { sha256 } from "@/lib/crypto";
import { withUser, type Tx } from "@/lib/db";
import { drafts, draftVersions, matters, templates } from "@/lib/db/schema";
import { aiActionError, completionNotes, stripCodeFence } from "@/lib/drafting/ai-errors";
import { DRAFTING_SYSTEM_PROMPT, draftTaskPrompt } from "@/lib/drafting/ai-prompts";
import { getTemplate, templateBody } from "@/lib/drafting/catalog";
import { fillTemplate, validateInputs } from "@/lib/drafting/fill";
import { TEMPLATE_INPUT_KEY } from "@/lib/drafting/queries";
import { features } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";

/** Characters; keeps a Hindi draft (3 bytes per character) under the 1 MB action limit. */
const MAX_BODY = 150_000;
/** Characters sent to the AI model (about 20k tokens). */
const MAX_AI_BODY = 60_000;

const id = z.uuid({ message: "Invalid draft." });
const language = z.enum(["en", "hi"]);
const title = z.string().trim().min(1, "Give the draft a title.").max(200, "Keep the title under 200 characters.");
const body = z.string().max(MAX_BODY, `The draft is too long (limit ${MAX_BODY.toLocaleString("en-IN")} characters).`);
const matterId = z.uuid().nullable().optional();

/** A failure whose message is safe to show the user. */
class UserError extends Error {}

function handle(err: unknown): ActionResult<never> {
  if (err instanceof UserError) return fail(err.message);
  return toActionError(err);
}

async function assertMatter(tx: Tx, mId: string | null | undefined): Promise<string | null> {
  if (!mId) return null;
  const [m] = await tx.select({ id: matters.id }).from(matters).where(eq(matters.id, mId)).limit(1);
  if (!m) throw new UserError("That matter was not found.");
  return m.id;
}

type VersionRow = { version: number; sha256: string; createdAt: Date };

/** Writes an immutable version and moves the draft to it (inside the caller's transaction). */
async function writeVersion(
  tx: Tx,
  userId: string,
  draftId: string,
  nextVersion: number,
  text: string,
  extra: Partial<{ title: string; language: "en" | "hi" }> = {},
): Promise<VersionRow> {
  const hash = sha256(text);
  const [v] = await tx
    .insert(draftVersions)
    .values({ draftId, ownerId: userId, version: nextVersion, body: text, sha256: hash })
    .returning({ version: draftVersions.version, sha256: draftVersions.sha256, createdAt: draftVersions.createdAt });
  await tx
    .update(drafts)
    .set({ body: text, version: nextVersion, updatedAt: new Date(), ...extra })
    .where(eq(drafts.id, draftId));
  return v;
}

/* --------------------------------- create -------------------------------- */

const createFromTemplateSchema = z.object({
  templateSlug: z.string().min(1).max(120),
  language,
  title,
  matterId,
  values: z.record(z.string(), z.string().max(20000)),
});

export async function createDraftFromTemplate(input: z.input<typeof createFromTemplateSchema>): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const data = createFromTemplateSchema.parse(input);
    const tpl = getTemplate(data.templateSlug);
    if (!tpl) return fail("That template was not found.");
    const check = validateInputs(tpl.fields, data.values);
    if (!check.ok) return fail("Please check the highlighted fields.", check.errors);
    const lang = data.language === "hi" && tpl.bodyHi ? "hi" : "en";
    const text = fillTemplate(templateBody(tpl, lang), tpl.fields, check.clean, lang);
    await enforceRateLimit(`drafts:create:${user.id}`, 60, 3600);

    const created = await withUser(user.id, async (tx) => {
      const mId = await assertMatter(tx, data.matterId);
      // The FK needs the seeded row; without it, remember the slug in inputs.
      const [seeded] = await tx.select({ slug: templates.slug }).from(templates).where(eq(templates.slug, tpl.slug)).limit(1);
      const inputs: Record<string, string> = { ...check.clean };
      if (!seeded) inputs[TEMPLATE_INPUT_KEY] = tpl.slug;
      const [d] = await tx
        .insert(drafts)
        .values({
          ownerId: user.id,
          matterId: mId,
          templateSlug: seeded ? tpl.slug : null,
          title: data.title,
          language: lang,
          inputs,
          body: text,
          status: "draft",
          version: 1,
        })
        .returning({ id: drafts.id });
      await tx.insert(draftVersions).values({ draftId: d.id, ownerId: user.id, version: 1, body: text, sha256: sha256(text) });
      return d;
    });

    await appendAudit({
      action: "draft.created",
      actorId: user.id,
      actorRole: user.role,
      entityType: "draft",
      entityId: created.id,
      ip: await requestIp(),
      data: { template: tpl.slug, language: lang, sha256: sha256(text) },
    });
    revalidatePath("/app/drafts");
    return ok({ id: created.id });
  } catch (err) {
    return handle(err);
  }
}

const createBlankSchema = z.object({ title, language, matterId });

export async function createBlankDraft(input: z.input<typeof createBlankSchema>): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const data = createBlankSchema.parse(input);
    await enforceRateLimit(`drafts:create:${user.id}`, 60, 3600);
    const created = await withUser(user.id, async (tx) => {
      const mId = await assertMatter(tx, data.matterId);
      const [d] = await tx
        .insert(drafts)
        .values({ ownerId: user.id, matterId: mId, title: data.title, language: data.language, body: "", status: "draft", version: 1 })
        .returning({ id: drafts.id });
      await tx.insert(draftVersions).values({ draftId: d.id, ownerId: user.id, version: 1, body: "", sha256: sha256("") });
      return d;
    });
    await appendAudit({
      action: "draft.created",
      actorId: user.id,
      actorRole: user.role,
      entityType: "draft",
      entityId: created.id,
      ip: await requestIp(),
      data: { template: null, language: data.language },
    });
    revalidatePath("/app/drafts");
    return ok({ id: created.id });
  } catch (err) {
    return handle(err);
  }
}

/* ---------------------------------- save --------------------------------- */

const saveSchema = z.object({ draftId: id, title, body, language, expectedVersion: z.number().int().positive() });

export type SaveResult = { version: number; created: VersionRow | null; updatedAt: Date };

/** Saves the editor contents as a new immutable version (or just the title if the text is unchanged). */
export async function saveDraft(input: z.input<typeof saveSchema>): Promise<ActionResult<SaveResult>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const data = saveSchema.parse(input);
    await enforceRateLimit(`drafts:save:${user.id}`, 120, 300);
    const result = await withUser(user.id, async (tx) => {
      const [d] = await tx
        .select({ body: drafts.body, title: drafts.title, language: drafts.language, status: drafts.status, version: drafts.version })
        .from(drafts)
        .where(eq(drafts.id, data.draftId))
        .for("update")
        .limit(1);
      if (!d) throw new UserError("This draft was not found.");
      if (d.status === "final") throw new UserError("This draft is marked final. Reopen it before making changes.");
      if (d.version !== data.expectedVersion) {
        throw new UserError("This draft was saved from another tab or device. Reload the page to see the latest version before saving.");
      }
      if (d.body === data.body) {
        if (d.title !== data.title || d.language !== data.language) {
          const now = new Date();
          await tx.update(drafts).set({ title: data.title, language: data.language, updatedAt: now }).where(eq(drafts.id, data.draftId));
          return { version: d.version, created: null, updatedAt: now };
        }
        throw new UserError("There are no changes to save.");
      }
      const created = await writeVersion(tx, user.id, data.draftId, d.version + 1, data.body, {
        title: data.title,
        language: data.language,
      });
      return { version: created.version, created, updatedAt: created.createdAt };
    });
    if (result.created) {
      await appendAudit({
        action: "draft.version_saved",
        actorId: user.id,
        actorRole: user.role,
        entityType: "draft",
        entityId: data.draftId,
        data: { version: result.created.version, sha256: result.created.sha256 },
      });
    }
    revalidatePath("/app/drafts");
    return ok(result);
  } catch (err) {
    return handle(err);
  }
}

/* ------------------------------- versions -------------------------------- */

const versionSchema = z.object({ draftId: id, version: z.number().int().positive() });

export async function getDraftVersion(
  input: z.input<typeof versionSchema>,
): Promise<ActionResult<{ version: number; body: string; sha256: string; createdAt: Date }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const data = versionSchema.parse(input);
    const row = await withUser(user.id, async (tx) => {
      const [v] = await tx
        .select({ version: draftVersions.version, body: draftVersions.body, sha256: draftVersions.sha256, createdAt: draftVersions.createdAt })
        .from(draftVersions)
        .where(and(eq(draftVersions.draftId, data.draftId), eq(draftVersions.version, data.version)))
        .limit(1);
      return v;
    });
    if (!row) return fail("That version was not found.");
    return ok(row);
  } catch (err) {
    return handle(err);
  }
}

const restoreSchema = versionSchema.extend({ expectedVersion: z.number().int().positive() });

/** Restoring never rewrites history: it saves the old text as a new version. */
export async function restoreDraftVersion(
  input: z.input<typeof restoreSchema>,
): Promise<ActionResult<{ body: string; version: number; created: VersionRow }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const data = restoreSchema.parse(input);
    const result = await withUser(user.id, async (tx) => {
      const [d] = await tx
        .select({ body: drafts.body, status: drafts.status, version: drafts.version })
        .from(drafts)
        .where(eq(drafts.id, data.draftId))
        .for("update")
        .limit(1);
      if (!d) throw new UserError("This draft was not found.");
      if (d.status === "final") throw new UserError("This draft is marked final. Reopen it before restoring a version.");
      if (d.version !== data.expectedVersion) throw new UserError("This draft changed in another tab. Reload the page first.");
      const [old] = await tx
        .select({ body: draftVersions.body })
        .from(draftVersions)
        .where(and(eq(draftVersions.draftId, data.draftId), eq(draftVersions.version, data.version)))
        .limit(1);
      if (!old) throw new UserError("That version was not found.");
      if (old.body === d.body) throw new UserError("That version is the same as the current text.");
      const created = await writeVersion(tx, user.id, data.draftId, d.version + 1, old.body);
      return { body: old.body, version: created.version, created };
    });
    await appendAudit({
      action: "draft.version_restored",
      actorId: user.id,
      actorRole: user.role,
      entityType: "draft",
      entityId: data.draftId,
      data: { from: data.version, version: result.version, sha256: result.created.sha256 },
    });
    revalidatePath("/app/drafts");
    return ok(result);
  } catch (err) {
    return handle(err);
  }
}

/* ------------------------------ status, link ------------------------------ */

const statusSchema = z.object({ draftId: id, status: z.enum(["draft", "final"]) });

export async function setDraftStatus(input: z.input<typeof statusSchema>): Promise<ActionResult<{ status: "draft" | "final" }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const data = statusSchema.parse(input);
    const updated = await withUser(user.id, (tx) =>
      tx
        .update(drafts)
        .set({ status: data.status, updatedAt: new Date() })
        .where(eq(drafts.id, data.draftId))
        .returning({ version: drafts.version, body: drafts.body }),
    );
    if (updated.length === 0) return fail("This draft was not found.");
    await appendAudit({
      action: data.status === "final" ? "draft.marked_final" : "draft.reopened",
      actorId: user.id,
      actorRole: user.role,
      entityType: "draft",
      entityId: data.draftId,
      data: { version: updated[0].version, sha256: sha256(updated[0].body) },
    });
    revalidatePath("/app/drafts");
    return ok({ status: data.status });
  } catch (err) {
    return handle(err);
  }
}

const linkSchema = z.object({ draftId: id, matterId: z.uuid().nullable() });

export async function linkDraftMatter(input: z.input<typeof linkSchema>): Promise<ActionResult<{ matterId: string | null }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const data = linkSchema.parse(input);
    const done = await withUser(user.id, async (tx) => {
      const mId = await assertMatter(tx, data.matterId);
      return tx.update(drafts).set({ matterId: mId, updatedAt: new Date() }).where(eq(drafts.id, data.draftId)).returning({ id: drafts.id });
    });
    if (done.length === 0) return fail("This draft was not found.");
    revalidatePath("/app/drafts");
    return ok({ matterId: data.matterId });
  } catch (err) {
    return handle(err);
  }
}

/* --------------------------------- delete -------------------------------- */

export async function deleteDraft(input: { draftId: string }): Promise<ActionResult<undefined>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  try {
    const { draftId } = z.object({ draftId: id }).parse(input);
    const removed = await withUser(user.id, (tx) =>
      tx.delete(drafts).where(eq(drafts.id, draftId)).returning({ id: drafts.id, title: drafts.title, version: drafts.version }),
    );
    if (removed.length === 0) return fail("This draft was not found.");
    await appendAudit({
      action: "draft.deleted",
      actorId: user.id,
      actorRole: user.role,
      entityType: "draft",
      entityId: draftId,
      ip: await requestIp(),
      data: { versions: removed[0].version },
    });
    revalidatePath("/app/drafts");
    return ok(undefined);
  } catch (err) {
    return handle(err);
  }
}

/* ------------------------------- AI assist -------------------------------- */

const aiSchema = z.object({
  draftId: id,
  action: z.enum(["improve", "translate", "expand", "check"]),
  body: z.string().min(1, "The draft is empty.").max(MAX_AI_BODY, `AI assist works on drafts up to ${MAX_AI_BODY.toLocaleString("en-IN")} characters.`),
  language,
  targetLanguage: language.optional(),
  facts: z.string().trim().max(20000, "Keep the facts under 20,000 characters.").optional(),
});

export type DraftAiResult = {
  kind: "document" | "report";
  text: string;
  notes: string[];
  /** Language of the returned document (translations change it). */
  language: "en" | "hi";
};

/** Returns an AI suggestion for the user to accept or discard. Nothing is saved here. */
export async function aiAssistDraft(input: z.input<typeof aiSchema>): Promise<ActionResult<DraftAiResult>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  if (!features.ai) return fail("AI drafting is not switched on for this workspace yet.");
  try {
    const data = aiSchema.parse(input);
    if (data.action === "expand" && !data.facts) return fail("Add the facts to expand from.");
    const draft = await withUser(user.id, async (tx) => {
      const [d] = await tx.select({ title: drafts.title, status: drafts.status }).from(drafts).where(eq(drafts.id, data.draftId)).limit(1);
      return d;
    });
    if (!draft) return fail("This draft was not found.");
    if (draft.status === "final" && data.action !== "check") return fail("This draft is marked final. Reopen it to change the text.");
    await enforceRateLimit(`ai:drafting:${user.id}`, 12, 300);

    const targetLanguage = data.action === "translate" ? (data.targetLanguage ?? (data.language === "hi" ? "en" : "hi")) : data.language;
    const { prompt, returnsDocument } = draftTaskPrompt(data.action, {
      body: data.body,
      title: draft.title,
      language: data.language,
      targetLanguage,
      facts: data.facts,
    });
    const result = await generateCompletion({
      userId: user.id,
      tier: "pro",
      system: DRAFTING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      maxTokens: returnsDocument ? 16000 : 4000,
    });
    if (result.refused) return fail("The AI declined this request. Try rephrasing the facts or editing the draft yourself.");
    const text = returnsDocument ? stripCodeFence(result.text) : result.text.trim();
    if (!text) return fail("The AI returned an empty answer. Please try again.");
    return ok({ kind: returnsDocument ? "document" : "report", text, notes: completionNotes(result), language: targetLanguage });
  } catch (err) {
    if (err instanceof UserError) return fail(err.message);
    return aiActionError(err);
  }
}
