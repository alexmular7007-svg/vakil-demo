import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { ACT_INFO, formatActDate, isActId, pairFor, type ActId } from "@/lib/corpus/acts";
import { correspondenceFor } from "@/lib/corpus/data";
import { actDisplay, convertWithDate, getSectionDetail } from "@/lib/corpus/search";
import { Alert, Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { CopyCitation } from "@/components/research/copy-citation";
import { CorrespondenceBox } from "@/components/research/correspondence-box";
import { SourceNotice } from "@/components/research/source-notice";
import { StatuteText, splitStoredText } from "@/components/research/statute-text";

export const metadata: Metadata = { title: "Research" };

export default async function ResearchSectionPage({ params }: { params: Promise<{ act: string; section: string }> }) {
  await requireUser("/app/research");
  const { act: slug, section: rawNo } = await params;
  const no = decodeURIComponent(rawNo).toUpperCase();

  let info: Awaited<ReturnType<typeof actDisplay>> = null;
  let detail: Awaited<ReturnType<typeof getSectionDetail>> = null;
  let conversion: Awaited<ReturnType<typeof convertWithDate>> = null;
  try {
    // Built-in acts and acts added in the admin law library.
    info = await actDisplay(decodeURIComponent(slug));
    if (info) detail = await getSectionDetail(info.id, no);
    if (info && detail && pairFor(info.id)) conversion = await convertWithDate({ fromAct: info.id, section: no });
  } catch (e) {
    console.error("[research] section load failed", e);
    return (
      <Alert tone="danger" title="This section could not be loaded">
        The corpus tables could not be read. Try again shortly.
      </Alert>
    );
  }
  if (!detail || !info) notFound();
  const id = info.id;
  const knownId: ActId | null = isActId(id) ? id : null;

  const { section, act, prev, next } = detail;
  const { paragraphs, footnotes } = splitStoredText(section.text);
  const flags = conversion && knownId && conversion.mappings.length === 0 ? correspondenceFor(knownId, no) : null;
  const citation = `Section ${section.sectionNo}, ${act?.title ?? info.title}`;
  const sourceUrl = conversion?.mappings[0]?.source.match(/https?:\/\/\S+$/)?.[0] ?? flags?.sourceUrl ?? null;

  return (
    <div>
      <Link href={`/app/research/${info.slug}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {info.abbr}: all sections
      </Link>
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <article className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {act?.repealedOn ? <Badge tone="warning">Repealed {formatActDate(act.repealedOn)}</Badge> : <Badge tone="success">In force</Badge>}
            {section.chapter ? <span className="text-sm text-muted">{section.chapter}</span> : null}
          </div>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {info.abbr} s. {section.sectionNo}: {section.heading}
          </h1>
          <p className="mt-1 text-sm text-muted">{act?.title ?? info.title}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <CopyCitation citation={citation} text={paragraphs.map((p) => p.text).join("\n\n")} />
            {info.known ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/law/${info.slug}/${section.sectionNo}`} target="_blank">
                  Public page <ExternalLink />
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="mt-6 rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-7">
            <StatuteText paragraphs={paragraphs} footnotes={footnotes} idPrefix={`r${section.sectionNo}`} />
          </div>
          <nav aria-label="Previous and next sections" className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-between">
            {prev ? (
              <Link href={`/app/research/${info.slug}/${prev.sectionNo}`} className="group flex min-h-12 items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:border-primary/40 sm:max-w-[48%]">
                <ArrowLeft className="size-4 shrink-0 text-muted group-hover:text-primary" aria-hidden />
                <span className="truncate">
                  <span className="text-muted">s. {prev.sectionNo}</span> {prev.heading}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/app/research/${info.slug}/${next.sectionNo}`} className="group flex min-h-12 items-center justify-end gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:border-primary/40 sm:max-w-[48%]">
                <span className="truncate">
                  <span className="text-muted">s. {next.sectionNo}</span> {next.heading}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted group-hover:text-primary" aria-hidden />
              </Link>
            ) : null}
          </nav>
        </article>
        <aside className="space-y-5">
          {conversion && knownId ? (
            <CorrespondenceBox
              fromAct={knownId}
              sectionNo={section.sectionNo}
              matches={conversion.mappings.map((m) => {
                const isOld = m.oldAct === id;
                return {
                  actId: (isOld ? m.newAct : m.oldAct) as ActId,
                  sectionNo: isOld ? m.newSection : m.oldSection,
                  heading: m.otherHeading,
                  details: (m.note ?? "").split(/;\s*/).filter(Boolean).map((d) => d.replace(/\.\s*NCRB marks.*$/, "")),
                  changed: /NCRB marks the new provision as changed/.test(m.note ?? ""),
                };
              })}
              isNew={flags?.isNew}
              omitted={flags?.omitted}
              sourceUrl={sourceUrl}
              hrefFor={(a, n) => `/app/research/${ACT_INFO[a].slug}/${n}`}
            />
          ) : null}
          {pairFor(id) ? (
            <Link href={`/app/research?tab=convert&from=${id}&s=${encodeURIComponent(section.sectionNo)}`} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-4 text-sm font-medium text-ink hover:border-primary/40">
              Check which code governs on a date <ArrowRight className="size-4 text-muted" aria-hidden />
            </Link>
          ) : null}
          <SourceNotice sourceUrl={act?.sourceUrl} note={act?.sourceNote} compact />
        </aside>
      </div>
    </div>
  );
}
