import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { actDisplay, listSections } from "@/lib/corpus/search";
import { Alert, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Research" };

export default async function ResearchActPage({ params }: { params: Promise<{ act: string }> }) {
  await requireUser("/app/research");
  const { act: slug } = await params;
  // Built-in acts and acts added in the admin law library.
  const info = await actDisplay(decodeURIComponent(slug)).catch(() => null);
  if (!info) notFound();
  const id = info.id;

  let rows: Awaited<ReturnType<typeof listSections>> = [];
  let failed = false;
  try {
    rows = await listSections(id);
  } catch (e) {
    console.error("[research] listSections failed", e);
    failed = true;
  }

  const groups: { chapter: string; items: typeof rows }[] = [];
  for (const r of rows) {
    const key = r.chapter ?? "Sections";
    const last = groups[groups.length - 1];
    if (last && last.chapter === key) last.items.push(r);
    else groups.push({ chapter: key, items: [r] });
  }

  return (
    <div>
      <Link href="/app/research?tab=browse" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All acts
      </Link>
      <PageHeader
        title={info.title}
        description={`${rows.length} sections. Open a section for its full text and old ↔ new correspondence.`}
        actions={
          info.known ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/law/${info.slug}`} target="_blank">
                Public page <ExternalLink />
              </Link>
            </Button>
          ) : null
        }
      />
      {failed ? <Alert tone="danger" title="Sections could not be loaded">The corpus tables could not be read. Try again shortly.</Alert> : null}
      {!failed && rows.length === 0 ? (
        <Alert tone="warning" title="This act is not loaded yet">
          The bare-act corpus has not been seeded into the database. An administrator can run <code>npm run db:seed</code>.
        </Alert>
      ) : null}
      <div className="space-y-4">
        {groups.map((g) => (
          <section key={g.chapter} className="rounded-lg border border-border bg-surface">
            <h2 className="border-b border-border px-4 py-3 font-serif text-base font-semibold text-ink">{g.chapter}</h2>
            <ol className="grid p-2 md:grid-cols-2">
              {g.items.map((s) => (
                <li key={s.sectionNo}>
                  <Link href={`/app/research/${info.slug}/${s.sectionNo}`} className="flex min-h-10 items-baseline gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2">
                    <span className="w-11 shrink-0 text-right text-sm font-semibold text-primary tabular-nums">{s.sectionNo}</span>
                    <span className="text-sm text-ink-2">{s.heading}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
