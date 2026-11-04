import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Landmark, MessageSquareText } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { formatDecided } from "@/lib/judgments/cite";
import { getJudgment } from "@/lib/judgments/queries";
import { sourceFor } from "@/lib/judgments/sources";
import { site } from "@/lib/site";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { CopyCitation } from "@/components/research/copy-citation";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Judgment" };

export default async function JudgmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("/app/research?tab=case");
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getJudgment>> = null;
  try {
    data = await getJudgment(id);
  } catch (e) {
    console.error("[research] judgment load failed", e);
    return (
      <Alert tone="danger" title="This judgment could not be loaded">
        The judgments library could not be read. Try again shortly.
      </Alert>
    );
  }
  if (!data) notFound();
  const { judgment: j, paras } = data;
  const head = paras.find((p) => p.paraNo === 0);
  const body = paras.filter((p) => p.paraNo > 0);
  const decided = formatDecided(j.decidedOn);
  const cites = j.citation ? j.citation.split(/;\s*/).filter(Boolean) : [];
  const citation = `${j.title}${cites[0] ? `, ${cites[0]}` : ""} (${j.court}${decided ? `, decided ${decided}` : ""})`;
  const src = sourceFor(j.sourceKey);
  const ask = `Using ${j.title}${cites[0] ? ` (${cites[0]})` : ""}, explain what the court held and the key paragraphs I should rely on.`;

  return (
    <div>
      <Link href="/app/research?tab=case" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Case law
      </Link>
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <article className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{j.court}</Badge>
            {decided ? (
              <Badge tone="neutral" className="tabular">
                Decided {decided}
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-2 font-serif text-2xl leading-tight font-semibold tracking-tight text-ink sm:text-3xl">{j.title}</h1>
          <dl className="mt-3 grid gap-1 text-sm">
            {cites.length ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted">Citation</dt>
                <dd className="text-ink tabular">{cites.join(" · ")}</dd>
              </div>
            ) : null}
            {j.caseNo ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted">Case no.</dt>
                <dd className="text-ink tabular">{j.caseNo}</dd>
              </div>
            ) : null}
            {j.bench ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted">Bench</dt>
                <dd className="text-ink">{j.bench}</dd>
              </div>
            ) : null}
            {j.parties && j.parties !== j.title ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted">Parties</dt>
                <dd className="text-ink">{j.parties}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <CopyCitation citation={citation} />
            <Button asChild variant="secondary" size="sm">
              <Link href={`/app/chat?q=${encodeURIComponent(ask)}`}>
                <MessageSquareText /> Ask AI about this judgment
              </Link>
            </Button>
          </div>

          {j.summary ? (
            <Card className="mt-6 p-4 sm:p-5">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Summary</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{j.summary}</p>
            </Card>
          ) : null}

          {head ? (
            <details className="group mt-6 rounded-lg border border-border bg-surface-2/50">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                Cause title and headnote
                <span className="text-xs font-normal text-muted group-open:hidden">Show</span>
                <span className="hidden text-xs font-normal text-muted group-open:inline">Hide</span>
              </summary>
              <p className="border-t border-border px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-ink-2">{head.text}</p>
            </details>
          ) : null}

          <ol className="mt-6 space-y-1 rounded-lg border border-border bg-surface p-3 shadow-sm sm:p-6" aria-label="Judgment paragraphs">
            {body.map((p) => (
              <li key={p.paraNo} id={`para-${p.paraNo}`} className="grid scroll-mt-24 grid-cols-[2.25rem_minmax(0,1fr)] gap-2 rounded-md px-1 py-2 target:bg-accent-soft sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-3">
                <a href={`#para-${p.paraNo}`} className="pt-0.5 text-right font-mono text-xs font-semibold text-primary tabular hover:underline" aria-label={`Paragraph ${p.paraNo}`}>
                  {p.paraNo}.
                </a>
                <p className="text-[15px] leading-7 whitespace-pre-line text-ink-2 sm:text-base sm:leading-8">{p.text}</p>
              </li>
            ))}
            {body.length === 0 ? <li className="p-2 text-sm text-muted">This judgment has no numbered paragraphs.</li> : null}
          </ol>
        </article>

        <aside className="space-y-5">
          <aside aria-label="Source and licence" className="rounded-lg border border-border bg-surface-2/60 p-4 text-[13px] leading-relaxed text-muted">
            <p className="flex items-start gap-2 text-ink-2">
              <Landmark className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                {src ? (
                  <>
                    <strong className="font-semibold text-ink">Source: {src.name}</strong> ({src.publisher}).{" "}
                    {src.attribution(formatDate(j.createdAt, { day: "numeric", month: "long", year: "numeric" }))}{" "}
                    <a href={src.licenceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                      Licence
                    </a>
                  </>
                ) : (
                  <>
                    <strong className="font-semibold text-ink">Added to the Vaakil library</strong> on {formatDate(j.createdAt)}. Basis for reuse: {j.licence}.
                  </>
                )}
              </span>
            </p>
            {j.sourceUrl ? (
              <a href={j.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-medium text-primary hover:underline sm:min-h-0">
                Original copy <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
            <p className="mt-2">Text extracted from the court&apos;s copy; paragraph numbers follow the judgment where it numbers them. Verify against the certified copy before relying on it.</p>
            <p className="mt-2">{site.disclaimer}</p>
          </aside>
        </aside>
      </div>
    </div>
  );
}
