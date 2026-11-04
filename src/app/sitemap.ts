import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { ACT_INFO } from "@/lib/corpus/acts";
import { loadActs } from "@/lib/corpus/data";
import { site } from "@/lib/site";

const LEGAL_UPDATED = "2026-11-02";

const url = (path: string) => new URL(path, site.url).toString();

/** Published drafting templates (seeded by the drafting module). Empty if the database is unavailable. */
async function publishedTemplates(): Promise<{ slug: string; updatedAt: string }[]> {
  "use cache";
  cacheLife("hours");
  try {
    // Imported lazily so a missing or locked database never breaks the sitemap.
    const [{ db }, { templates }, { eq }] = await Promise.all([import("@/lib/db"), import("@/lib/db/schema"), import("drizzle-orm")]);
    const rows = await db
      .select({ slug: templates.slug, updatedAt: templates.updatedAt })
      .from(templates)
      .where(eq(templates.isPublished, true));
    return rows.map((r) => ({ slug: r.slug, updatedAt: new Date(r.updatedAt).toISOString() }));
  } catch (err) {
    console.warn("[sitemap] templates unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    { url: url("/pricing"), changeFrequency: "monthly", priority: 0.8 },
    { url: url("/tools/ipc-to-bns"), changeFrequency: "monthly", priority: 0.9 },
    { url: url("/tools/limitation-calculator"), changeFrequency: "monthly", priority: 0.9 },
    { url: url("/tools/cheque-bounce-timeline"), changeFrequency: "monthly", priority: 0.9 },
    { url: url("/law"), changeFrequency: "monthly", priority: 0.9 },
    { url: url("/templates"), changeFrequency: "weekly", priority: 0.8 },
    { url: url("/advocates"), changeFrequency: "weekly", priority: 0.6 },
    { url: url("/security"), lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.5 },
    { url: url("/legal/terms"), lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: url("/legal/privacy"), lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: url("/legal/disclaimer"), lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: url("/legal/grievance"), lastModified: LEGAL_UPDATED, changeFrequency: "yearly", priority: 0.3 },
  ];

  for (const act of loadActs()) {
    const slug = ACT_INFO[act.id].slug;
    const lastModified = act.source.retrievedOn;
    entries.push({ url: url(`/law/${slug}`), lastModified, changeFrequency: "monthly", priority: 0.8 });
    for (const s of act.sections) {
      entries.push({ url: url(`/law/${slug}/${s.no}`), lastModified, changeFrequency: "yearly", priority: act.repealedOn ? 0.5 : 0.6 });
    }
  }

  for (const t of await publishedTemplates()) {
    entries.push({ url: url(`/templates/${t.slug}`), lastModified: t.updatedAt, changeFrequency: "monthly", priority: 0.7 });
  }
  return entries;
}
