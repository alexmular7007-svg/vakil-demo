import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, ArrowRight, BookOpenText } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { Badge } from "@/components/ui/display";
import { CorrespondenceBox } from "@/components/research/correspondence-box";
import { SourceNotice } from "@/components/research/source-notice";
import { StatuteText } from "@/components/research/statute-text";
import { ACT_IDS, ACT_INFO, actBySlug, formatActDate, pairFor } from "@/lib/corpus/acts";
import { correspondenceFor, findSection, loadAct } from "@/lib/corpus/data";
import { breadcrumbJsonLd, sectionJsonLd } from "@/lib/corpus/seo";

type Params = { act: string; section: string };

export function generateStaticParams(): Params[] {
  const out: Params[] = [];
  for (const id of ACT_IDS) {
    const act = loadAct(id);
    if (!act) continue;
    for (const s of act.sections) out.push({ act: ACT_INFO[id].slug, section: s.no });
  }
  return out;
}

function resolve(params: Params) {
  const info = actBySlug(params.act);
  const act = info ? loadAct(info.id) : null;
  if (!info || !act) return null;
  const hit = findSection(act, decodeURIComponent(params.section));
  if (!hit) return null;
  return { info, act, ...hit };
}

function plainExcerpt(text: string, n: number) {
  const flat = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, "").replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1).trimEnd()}…` : flat;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const r = resolve(await params);
  if (!r) return { title: "Section not found", robots: { index: false } };
  const { info, act, section } = r;
  const path = `/law/${info.slug}/${section.no}`;
  const title = `${info.abbr} Section ${section.no}: ${section.heading}`;
  return {
    title,
    description: plainExcerpt(`${act.title}, section ${section.no}. ${section.text}`, 158),
    alternates: { canonical: path },
    openGraph: { url: path, type: "article", title },
  };
}

export default async function SectionPage({ params }: { params: Promise<Params> }) {
  const r = resolve(await params);
  if (!r) notFound();
  const { info, act, section, index } = r;
  const prev = index > 0 ? act.sections[index - 1] : null;
  const next = index < act.sections.length - 1 ? act.sections[index + 1] : null;
  const corr = pairFor(act.id) ? correspondenceFor(act.id, section.no) : null;
  const path = `/law/${info.slug}/${section.no}`;
  const chapter = section.chapterNo ? act.chapters.find((c) => c.number === section.chapterNo) : null;

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Bare acts", path: "/law" },
            { name: info.abbr, path: `/law/${info.slug}` },
            { name: `Section ${section.no}`, path },
          ]),
          sectionJsonLd({ act, actPath: `/law/${info.slug}`, path, abbr: info.abbr, sectionNo: section.no, heading: section.heading }),
        ]}
      />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/law" className="hover:text-ink">
                Bare acts
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href={`/law/${info.slug}`} className="hover:text-ink">
                {info.abbr}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-ink-2" aria-current="page">
              Section {section.no}
            </li>
          </ol>
        </nav>

        <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="min-w-0">
            <header>
              <div className="flex flex-wrap items-center gap-2">
                {act.repealedOn ? <Badge tone="warning">Repealed {formatActDate(act.repealedOn)}</Badge> : <Badge tone="success">In force</Badge>}
                {chapter ? (
                  <span className="text-sm text-muted">
                    Chapter {chapter.number}: {chapter.title}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-3 font-serif text-[28px] leading-tight font-semibold tracking-tight text-ink sm:text-4xl">
                {info.abbr} Section {section.no}: {section.heading}
              </h1>
              <p className="mt-2 text-sm text-muted">
                <Link href={`/law/${info.slug}`} className="hover:text-primary">
                  {act.title}
                </Link>{" "}
                · {act.actNo}
              </p>
            </header>

            <div className="mt-8 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-8">
              <p className="mb-4 font-serif text-lg font-semibold text-ink">
                {section.no}. {section.heading}.
              </p>
              <StatuteText paragraphs={section.paragraphs} footnotes={section.footnotes} idPrefix={`s${section.no}`} />
            </div>

            <nav aria-label="Previous and next sections" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {prev ? (
                <Link href={`/law/${info.slug}/${prev.no}`} className="group flex min-h-16 min-w-0 items-center gap-3 rounded-lg border border-border bg-surface p-4 hover:border-primary/40">
                  <ArrowLeft className="size-4 shrink-0 text-muted group-hover:text-primary" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-xs text-muted">Previous · Section {prev.no}</span>
                    <span className="block truncate text-sm font-medium text-ink">{prev.heading}</span>
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={`/law/${info.slug}/${next.no}`} className="group flex min-h-16 min-w-0 items-center justify-end gap-3 rounded-lg border border-border bg-surface p-4 text-right hover:border-primary/40">
                  <span className="min-w-0">
                    <span className="block text-xs text-muted">Next · Section {next.no}</span>
                    <span className="block truncate text-sm font-medium text-ink">{next.heading}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted group-hover:text-primary" aria-hidden />
                </Link>
              ) : null}
            </nav>
          </article>

          <aside className="space-y-5">
            {corr ? (
              <CorrespondenceBox
                fromAct={act.id}
                sectionNo={section.no}
                matches={corr.matches}
                isNew={corr.isNew}
                omitted={corr.omitted}
                sourceUrl={corr.sourceUrl}
                hrefFor={(a, no) => `/law/${ACT_INFO[a].slug}/${no}`}
              />
            ) : null}
            {corr ? (
              <Link
                href="/tools/ipc-to-bns"
                className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-sm font-medium text-ink shadow-sm hover:border-primary/40"
              >
                <ArrowLeftRight className="size-4 text-primary" aria-hidden />
                <span className="flex-1">Convert another section, by date</span>
                <ArrowRight className="size-4 text-muted" aria-hidden />
              </Link>
            ) : null}
            <div className="rounded-lg border border-border bg-surface p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <BookOpenText className="size-4 text-primary" aria-hidden /> About this Act
              </p>
              <dl className="mt-3 space-y-2 text-ink-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Act</dt>
                  <dd className="text-right">{act.actNo}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">In force from</dt>
                  <dd className="text-right">{formatActDate(act.inForceFrom)}</dd>
                </div>
                {act.repealedOn ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Repealed</dt>
                    <dd className="text-right">{formatActDate(act.repealedOn)}</dd>
                  </div>
                ) : null}
              </dl>
              <Link href={`/law/${info.slug}`} className="mt-3 inline-flex items-center gap-1 font-medium text-primary hover:underline">
                All {act.sectionCount} sections <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            <SourceNotice sourceUrl={act.source.url} retrievedOn={act.source.retrievedOn} note={act.sourceNote} />
          </aside>
        </div>
      </div>
    </>
  );
}
