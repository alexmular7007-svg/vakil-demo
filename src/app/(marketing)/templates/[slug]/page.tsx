import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpenText, CheckCircle2, FileSignature, Languages, ListChecks, ShieldOff } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { DraftDocument } from "@/components/drafting/draft-document";
import { ReviewBadge } from "@/components/drafting/review-badge";
import { getTemplate, templateCatalog } from "@/lib/drafting/catalog";
import { parseDraft, type Block } from "@/lib/drafting/markup";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return templateCatalog.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = getTemplate(slug);
  if (!t) return { title: "Template not found", robots: { index: false } };
  const title = `${t.title}: format and template`;
  return {
    title,
    description: t.summary,
    alternates: { canonical: `/templates/${t.slug}` },
    openGraph: { title: `${title} · ${site.name}`, description: t.summary, url: `/templates/${t.slug}`, type: "article" },
  };
}

function blockLength(b: Block) {
  return "lines" in b ? b.lines.reduce((n, l) => n + l.reduce((m, r) => m + r.text.length, 0), 0) : 0;
}

/** The opening blocks of a template, up to about `budget` characters. */
function excerpt(body: string, budget = 1500): { blocks: Block[]; more: boolean } {
  const all = parseDraft(body);
  const out: Block[] = [];
  let used = 0;
  for (const b of all) {
    if (b.kind === "pagebreak") break;
    out.push(b);
    used += blockLength(b);
    if (used >= budget && out.length >= 6) break;
  }
  return { blocks: out, more: out.length < all.length };
}

export default async function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getTemplate(slug);
  if (!t) notFound();

  const labels = Object.fromEntries(t.fields.map((f) => [f.name, f.label]));
  const { blocks, more } = excerpt(t.bodyEn);
  const related = templateCatalog.filter((x) => x.slug !== t.slug && x.category === t.category).concat(
    templateCatalog.filter((x) => x.slug !== t.slug && x.category !== t.category),
  ).slice(0, 4);
  const useHref = `/app/drafts/new?template=${encodeURIComponent(t.slug)}`;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: site.url },
            { "@type": "ListItem", position: 2, name: "Templates", item: `${site.url}/templates` },
            { "@type": "ListItem", position: 3, name: t.title, item: `${site.url}/templates/${t.slug}` },
          ],
        }}
      />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-ink">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href="/templates" className="hover:text-ink">
                Templates
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="min-w-0 truncate text-ink">
              {t.title}
            </li>
          </ol>
        </nav>

        <header className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{t.category}</Badge>
            {t.bodyHi ? (
              <Badge tone="accent">
                <Languages aria-hidden /> English and <span lang="hi">हिन्दी</span>
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-4 font-serif text-3xl leading-tight font-semibold tracking-tight text-ink sm:text-4xl">{t.title}</h1>
          <p lang="hi" className="mt-2 text-lg text-muted">
            {t.titleHi}
          </p>
          <div className="mt-4">
            <ReviewBadge reviewedBy={t.reviewedBy} />
          </div>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">{t.summary}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink">When it is used: </span>
            {t.useWhen}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={useHref}>
                Use this template <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/signup">Create a free account</Link>
            </Button>
          </div>
        </header>

        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-labelledby="excerpt-heading" className="min-w-0">
            <h2 id="excerpt-heading" className="mb-3 font-serif text-xl font-semibold text-ink">
              Template excerpt
            </h2>
            <div className="relative overflow-hidden rounded-xl border border-border bg-surface px-5 py-6 shadow-sm sm:px-10 sm:py-10">
              <DraftDocument blocks={blocks} labels={labels} />
              {more ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-surface to-transparent" aria-hidden />
              ) : null}
            </div>
            {more ? (
              <p className="mt-3 text-sm text-muted">
                The full template continues with the remaining paragraphs{t.bodyEn.includes("## PRAYER") ? ", prayer" : ""}
                {t.bodyEn.includes("VERIFICATION") ? " and verification" : ""}.{" "}
                <Link href={useHref} className="text-primary hover:underline">
                  Fill it in the drafting studio
                </Link>
                .
              </p>
            ) : null}
          </section>

          <aside className="space-y-6">
            <section aria-labelledby="fields-heading" className="rounded-xl border border-border bg-surface p-5">
              <h2 id="fields-heading" className="flex items-center gap-2 font-semibold text-ink">
                <ListChecks className="size-4 text-primary" aria-hidden /> Information you will need
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {t.fields.map((f) => (
                  <li key={f.name} className="flex gap-2 text-ink-2">
                    <CheckCircle2 className={f.required ? "mt-0.5 size-4 shrink-0 text-primary" : "mt-0.5 size-4 shrink-0 text-muted"} aria-hidden />
                    <span>
                      {f.label}
                      {f.required ? null : <span className="text-muted"> (optional)</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="law-heading" className="rounded-xl border border-border bg-surface p-5">
              <h2 id="law-heading" className="flex items-center gap-2 font-semibold text-ink">
                <BookOpenText className="size-4 text-primary" aria-hidden /> Legal basis
              </h2>
              {t.lawRefs.length ? (
                <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
                  {t.lawRefs.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-2">General law of contract and notice; no specific statutory provision.</p>
              )}
              <p className="mt-4 flex items-start gap-2 text-sm text-ink-2">
                {t.esignAllowed ? (
                  <>
                    <FileSignature className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> Can be sent for electronic signature.
                  </>
                ) : (
                  <>
                    <ShieldOff className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {t.esignNote ?? "Cannot be e-signed."}
                  </>
                )}
              </p>
            </section>

            <section aria-labelledby="checks-heading" className="rounded-xl border border-warning/30 bg-warning-soft p-5">
              <h2 id="checks-heading" className="font-semibold text-ink">
                Check before use
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-2">
                {t.checks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
          </aside>
        </div>

        {related.length ? (
          <section aria-labelledby="related-heading" className="mt-14">
            <h2 id="related-heading" className="mb-4 font-serif text-xl font-semibold text-ink">
              Other templates
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/templates/${r.slug}`}
                    className="flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-sm shadow-sm hover:border-border-strong"
                  >
                    <span className="text-xs text-muted">{r.category}</span>
                    <span className="font-medium text-ink">{r.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-12 text-xs leading-relaxed text-muted">{site.disclaimer}</p>
      </div>
    </>
  );
}
