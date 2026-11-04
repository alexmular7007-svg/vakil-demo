import { inArray, notInArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { canonicalJson, sha256 } from "@/lib/crypto";
import { templateCatalog } from "./catalog";

function contentHash(t: { bodyEn: string; bodyHi?: string | null; fields: unknown }) {
  return sha256(canonicalJson({ bodyEn: t.bodyEn, bodyHi: t.bodyHi ?? null, fields: t.fields }));
}

/**
 * Idempotently upserts the drafting catalogue (src/lib/drafting/catalog.ts) into
 * app.templates. An advocate's review recorded in the database is kept while the
 * reviewed text is unchanged, and cleared when the template text changes, so a
 * review never vouches for wording the reviewer has not seen. Templates removed
 * from the catalogue are unpublished, not deleted (drafts reference them).
 */
export async function seedTemplates(db: Db): Promise<void> {
  const slugs = templateCatalog.map((t) => t.slug);
  const existing = await db
    .select({
      slug: templates.slug,
      bodyEn: templates.bodyEn,
      bodyHi: templates.bodyHi,
      fields: templates.fields,
      reviewedBy: templates.reviewedBy,
      reviewedAt: templates.reviewedAt,
    })
    .from(templates)
    .where(inArray(templates.slug, slugs));
  const prevBySlug = new Map(existing.map((r) => [r.slug, r]));

  let changed = 0;
  for (const t of templateCatalog) {
    const prev = prevBySlug.get(t.slug);
    const contentChanged = !prev || contentHash(prev) !== contentHash(t);
    if (contentChanged) changed++;
    const reviewedBy = t.reviewedBy ?? (contentChanged ? null : (prev?.reviewedBy ?? null));
    const reviewedAt = t.reviewedAt ? new Date(t.reviewedAt) : contentChanged ? null : (prev?.reviewedAt ?? null);
    const row = {
      slug: t.slug,
      title: t.title,
      titleHi: t.titleHi,
      category: t.category,
      summary: t.summary,
      fields: t.fields,
      bodyEn: t.bodyEn,
      bodyHi: t.bodyHi ?? null,
      lawRefs: t.lawRefs,
      esignAllowed: t.esignAllowed,
      reviewedBy,
      reviewedAt,
      isPublished: true,
    };
    await db
      .insert(templates)
      .values(row)
      .onConflictDoUpdate({ target: templates.slug, set: { ...row, updatedAt: new Date() } });
  }

  await db.update(templates).set({ isPublished: false, updatedAt: new Date() }).where(notInArray(templates.slug, slugs));

  console.log(`✓ ${templateCatalog.length} drafting templates (${changed} new or changed)`);
}
