import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, ArrowRight, ChevronDown } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { Badge } from "@/components/ui/display";
import { SourceNotice } from "@/components/research/source-notice";
import { ACT_IDS, ACT_INFO, actBySlug, formatActDate, pairFor } from "@/lib/corpus/acts";
import { loadAct, type CorpusAct, type CorpusSection } from "@/lib/corpus/data";
import { breadcrumbJsonLd, legislationJsonLd } from "@/lib/corpus/seo";

type Params = { act: string };

export function generateStaticParams(): Params[] {
  return ACT_IDS.filter((id) => loadAct(id)).map((id) => ({ act: ACT_INFO[id].slug }));
}

function getAct(slug: string): CorpusAct | null {
  const info = actBySlug(slug);
  return info ? loadAct(info.id) : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { act: slug } = await params;
  const act = getAct(slug);
  if (!act) return { title: "Act not found", robots: { index: false } };
  const info = ACT_INFO[act.id];
  const status = act.repealedOn ? `Repealed on ${formatActDate(act.repealedOn)}; still governs earlier matters.` : "In force.";
  return {
    title: `${act.title}: all sections (${info.abbr})`,
    description: `Bare act text of ${act.title} (${act.actNo}), ${act.sectionCount} sections arranged by chapter. ${status} Source: India Code.`,
    alternates: { canonical: `/law/${info.slug}` },
    openGraph: { url: `/law/${info.slug}`, type: "website", title: `${act.title} (${info.abbr})` },
  };
}

function SectionLink({ slug, s }: { slug: string; s: CorpusSection }) {
  return (
    <li>
      <Link href={`/law/${slug}/${s.no}`} className="group flex min-h-10 items-baseline gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2">
        <span className="w-12 shrink-0 text-right text-sm font-semibold text-primary tabular-nums">{s.no}</span>
        <span className="text-sm leading-6 text-ink-2 group-hover:text-ink">{s.heading}</span>
      </Link>
    </li>
  );
}

export default async function ActPage({ params }: { params: Promise<Params> }) {
  const { act: slug } = await params;
  const act = getAct(slug);
  if (!act) notFound();
  const info = ACT_INFO[act.id];
  const pair = pairFor(act.id);
  const bySection = new Map(act.sections.map((s) => [s.no, s]));
  const chapters = act.chapters.filter((c) => c.sections.length > 0);
  const inChapters = new Set(chapters.flatMap((c) => c.sections));
  const loose = act.sections.filter((s) => !inChapters.has(s.no));
  const related = act.replacedBy ?? act.replaces;

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Bare acts", path: "/law" },
            { name: info.abbr, path: `/law/${info.slug}` },
          ]),
          legislationJsonLd(act, `/law/${info.slug}`, info.abbr),
        ]}
      />
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <Link href="/" className="hover:text-ink">
              Home
            </Link>{" "}
            /{" "}
            <Link href="/law" className="hover:text-ink">
              Bare acts
            </Link>{" "}
            / <span className="text-ink-2">{info.abbr}</span>
          </nav>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {act.repealedOn ? <Badge tone="warning">Repealed {formatActDate(act.repealedOn)}</Badge> : <Badge tone="success">In force</Badge>}
            <Badge tone="neutral">{act.actNo}</Badge>
          </div>
          <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-[42px] sm:leading-tight">{act.title}</h1>
          {act.longTitle ? <p className="mt-3 max-w-3xl text-ink-2">{act.longTitle}</p> : null}
          <dl className="mt-6 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">Enacted</dt>
              <dd className="font-medium text-ink">{formatActDate(act.enactedOn)}</dd>
            </div>
            <div>
              <dt className="text-muted">In force from</dt>
              <dd className="font-medium text-ink">{formatActDate(act.inForceFrom)}</dd>
            </div>
            <div>
              <dt className="text-muted">{act.repealedOn ? "Repealed" : "Sections"}</dt>
              <dd className="font-medium text-ink">{act.repealedOn ? formatActDate(act.repealedOn) : act.sectionCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Chapters</dt>
              <dd className="font-medium text-ink">{chapters.length || "—"}</dd>
            </div>
          </dl>
          {related ? (
            <div className="mt-6 flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary-soft/50 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-ink-2">
                {act.replacedBy
                  ? `Replaced by the ${ACT_INFO[act.replacedBy].title} from 1 July 2024. It still governs offences and pending proceedings from before that date.`
                  : `Replaced the ${ACT_INFO[related].title} from 1 July 2024.`}
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link href={`/law/${ACT_INFO[related].slug}`} className="inline-flex h-10 items-center gap-1 rounded-md border border-border-strong bg-surface px-3 font-medium text-ink hover:bg-surface-2">
                  {ACT_INFO[related].abbr} <ArrowRight className="size-4" aria-hidden />
                </Link>
                {pair ? (
                  <Link href="/tools/ipc-to-bns" className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-ink hover:bg-primary-hover">
                    <ArrowLeftRight className="size-4" aria-hidden /> Converter
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        {chapters.length > 0 ? (
          <nav aria-label="Chapters" className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-y-auto pr-2 scrollbar-thin">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Chapters</p>
              <ol className="space-y-0.5 text-sm">
                {chapters.map((c) => (
                  <li key={c.number}>
                    <a href={`#chapter-${c.number}`} className="block rounded-md px-2 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
                      <span className="font-medium text-ink">{c.number}.</span> {c.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        ) : (
          <div className="hidden lg:block" />
        )}

        <div className="min-w-0 space-y-4">
          {chapters.map((c, i) => (
            <details key={c.number} id={`chapter-${c.number}`} open={i < 2 || chapters.length <= 6} className="group scroll-mt-24 rounded-lg border border-border bg-surface">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <h2 className="font-serif text-lg font-semibold text-ink">
                  <span className="text-muted">Chapter {c.number}</span> · {c.title}
                </h2>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                  {c.sections.length} sections <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </span>
              </summary>
              <ol className="border-t border-border p-2">
                {c.sections.map((no) => {
                  const s = bySection.get(no);
                  return s ? <SectionLink key={no} slug={info.slug} s={s} /> : null;
                })}
              </ol>
            </details>
          ))}
          {loose.length > 0 ? (
            <section className="rounded-lg border border-border bg-surface">
              <h2 className="border-b border-border px-4 py-3 font-serif text-lg font-semibold text-ink">{chapters.length ? "Other sections" : "Sections"}</h2>
              <ol className="p-2">
                {loose.map((s) => (
                  <SectionLink key={s.no} slug={info.slug} s={s} />
                ))}
              </ol>
            </section>
          ) : null}
          <SourceNotice sourceUrl={act.source.url} retrievedOn={act.source.retrievedOn} note={act.sourceNote} className="mt-8" />
        </div>
      </div>
    </>
  );
}
