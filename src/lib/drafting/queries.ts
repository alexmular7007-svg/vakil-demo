import "server-only";
import { desc, eq } from "drizzle-orm";
import { withUser, type Tx } from "@/lib/db";
import { drafts, draftVersions, matters, templates } from "@/lib/db/schema";
import { getTemplate } from "./catalog";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string | null | undefined): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Key in drafts.inputs that records the catalogue slug when the templates table was not seeded. */
export const TEMPLATE_INPUT_KEY = "__template";

export function draftTemplateSlug(d: { templateSlug: string | null; inputs: unknown }): string | null {
  if (d.templateSlug) return d.templateSlug;
  const inputs = d.inputs as Record<string, unknown> | null;
  const s = inputs?.[TEMPLATE_INPUT_KEY];
  return typeof s === "string" ? s : null;
}

export type MatterOption = { id: string; title: string; status: string };

export async function listMatterOptions(tx: Tx): Promise<MatterOption[]> {
  return tx
    .select({ id: matters.id, title: matters.title, status: matters.status })
    .from(matters)
    .orderBy(desc(matters.updatedAt))
    .limit(200);
}

/** Review status recorded in the database for catalogue templates (seeded rows only). */
export async function templateReviewMap(tx: Tx): Promise<Map<string, string | null>> {
  const rows = await tx.select({ slug: templates.slug, reviewedBy: templates.reviewedBy }).from(templates);
  return new Map(rows.map((r) => [r.slug, r.reviewedBy]));
}

export type DraftBundle = Awaited<ReturnType<typeof loadDraftBundle>>;

/** Everything the editor, print view and exports need, read under row-level security. */
export async function loadDraftBundle(userId: string, id: string, opts: { versions?: boolean; matters?: boolean } = {}) {
  if (!isUuid(id)) return null;
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .select({
        id: drafts.id,
        title: drafts.title,
        body: drafts.body,
        language: drafts.language,
        status: drafts.status,
        version: drafts.version,
        inputs: drafts.inputs,
        templateSlug: drafts.templateSlug,
        matterId: drafts.matterId,
        createdAt: drafts.createdAt,
        updatedAt: drafts.updatedAt,
        matterTitle: matters.title,
        tplEsign: templates.esignAllowed,
        tplReviewedBy: templates.reviewedBy,
      })
      .from(drafts)
      .leftJoin(matters, eq(drafts.matterId, matters.id))
      .leftJoin(templates, eq(drafts.templateSlug, templates.slug))
      .where(eq(drafts.id, id))
      .limit(1);
    if (!row) return null;

    const slug = draftTemplateSlug(row);
    const tpl = getTemplate(slug);
    const template = slug
      ? {
          slug,
          title: tpl?.title ?? slug,
          esignAllowed: row.tplEsign ?? tpl?.esignAllowed ?? true,
          esignNote: tpl?.esignNote ?? null,
          reviewedBy: row.tplReviewedBy ?? tpl?.reviewedBy ?? null,
        }
      : null;

    const versions = opts.versions
      ? await tx
          .select({ version: draftVersions.version, sha256: draftVersions.sha256, createdAt: draftVersions.createdAt })
          .from(draftVersions)
          .where(eq(draftVersions.draftId, id))
          .orderBy(desc(draftVersions.version))
      : [];
    const matterOptions = opts.matters ? await listMatterOptions(tx) : [];

    return {
      draft: {
        id: row.id,
        title: row.title,
        body: row.body,
        language: (row.language === "hi" ? "hi" : "en") as "en" | "hi",
        status: (row.status === "final" ? "final" : "draft") as "draft" | "final",
        version: row.version,
        matterId: row.matterId,
        matterTitle: row.matterTitle,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      template,
      versions,
      matters: matterOptions,
    };
  });
}

/**
 * For the e-sign module: the saved draft text to freeze into an envelope, and
 * whether its template may be e-signed at all. Wills, powers of attorney and
 * affidavits return esignAllowed: false and must be refused server-side, not
 * only hidden in the UI. Returns null when the draft is not the user's.
 */
export async function getDraftForSigning(userId: string, draftId: string) {
  const bundle = await loadDraftBundle(userId, draftId);
  if (!bundle) return null;
  const { draft, template } = bundle;
  return {
    id: draft.id,
    title: draft.title,
    body: draft.body,
    language: draft.language,
    version: draft.version,
    status: draft.status,
    esignAllowed: template ? template.esignAllowed : true,
    esignNote: template?.esignNote ?? null,
  };
}
