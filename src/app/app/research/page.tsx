import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenText, CalendarClock, Gavel, Library, SearchX } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { ACT_IDS, ACT_INFO, CODE_PAIRS, formatActDate, isActId, normaliseActId, type ActId } from "@/lib/corpus/acts";
import { correspondenceFor } from "@/lib/corpus/data";
import { convertWithDate, listActs, searchStatutesMarked } from "@/lib/corpus/search";
import { formatDecided } from "@/lib/judgments/cite";
import { libraryCourts, recentJudgments, searchCaseLaw, type CaseLawHit } from "@/lib/judgments/queries";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";
import { Alert, Badge, Card, EmptyState, IconTile, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { CorrespondenceBox } from "@/components/research/correspondence-box";
import { MarkedSnippet } from "@/components/research/marked-snippet";
import { ResearchTabs, type ResearchTab } from "@/components/research/research-tabs";

export const metadata: Metadata = { title: "Research" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

const EXAMPLES = ["s. 103 BNS", "anticipatory bail", "electronic record certificate", "dishonour of cheque", "498A", "mutual consent divorce"];

const sectionHref = (actId: string, no: string) => `/app/research/${isActId(actId) ? ACT_INFO[actId].slug : actId.toLowerCase()}/${no}`;

export default async function ResearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("/app/research");
  const sp = await searchParams;
  const tabParam = one(sp.tab);
  const tab: ResearchTab = tabParam === "convert" || tabParam === "browse" || tabParam === "case" ? tabParam : "search";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="AI & research" icon={BookOpenText}
        title="Research"
        description="Search the bare text of Indian statutes and the library of decided cases, convert between the old and new criminal codes, and browse acts. Text from India Code; correspondence from the NCRB."
      />
      <ResearchTabs active={tab} />
      {tab === "search" ? <SearchView userId={user.id} q={one(sp.q)} act={one(sp.act)} /> : null}
      {tab === "case" ? <CaseLawView userId={user.id} q={one(sp.q)} court={one(sp.court)} year={one(sp.year)} /> : null}
      {tab === "convert" ? <ConvertView from={one(sp.from)} section={one(sp.s)} date={one(sp.date)} /> : null}
      {tab === "browse" ? <BrowseView /> : null}
    </div>
  );
}

/* --------------------------------- Search --------------------------------- */

async function SearchView({ userId, q, act }: { userId: string; q: string; act: string }) {
  const actId = act ? normaliseActId(act) : null;
  let hits: Awaited<ReturnType<typeof searchStatutesMarked>> = [];
  let error: string | null = null;
  let empty = false;
  if (q) {
    try {
      await enforceRateLimit(`research:${userId}`, 60, 60);
      hits = await searchStatutesMarked(q, { acts: actId ? [actId] : undefined, limit: 25 });
      if (hits.length === 0) empty = (await listActs()).length === 0;
    } catch (e) {
      error = e instanceof RateLimitError ? e.message : "Search is unavailable right now. The corpus tables could not be read.";
      if (!(e instanceof RateLimitError)) console.error("[research] search failed", e);
    }
  }

  return (
    <div className="space-y-5">
      <form action="/app/research" method="get" role="search" className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
        <input type="hidden" name="tab" value="search" />
        <Field label="Search" htmlFor="q">
          <Input id="q" name="q" type="search" defaultValue={q} placeholder="Words, or a section like “s. 103 BNS” or “CrPC 438”" maxLength={300} autoComplete="off" />
        </Field>
        <Field label="Act" htmlFor="act">
          <Select id="act" name="act" defaultValue={actId ?? ""}>
            <option value="">All acts</option>
            {ACT_IDS.map((id) => (
              <option key={id} value={id}>
                {ACT_INFO[id].abbr} · {ACT_INFO[id].shortTitle}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" className="w-full sm:w-auto">
          Search
        </Button>
      </form>

      {error ? <Alert tone="danger" title="Search failed">{error}</Alert> : null}
      {empty ? (
        <Alert tone="warning" title="The bare-act corpus is not loaded yet">
          The statute tables are empty. An administrator can load them with <code>npm run db:seed</code> after generating the data.
        </Alert>
      ) : null}

      {!q ? (
        <Card className="p-5">
          <p className="text-sm font-medium text-ink">Try</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <Link
                key={ex}
                href={`/app/research?tab=search&q=${encodeURIComponent(ex)}`}
                className="inline-flex min-h-10 items-center rounded-full border border-border-strong px-3 text-sm text-ink-2 hover:border-primary hover:text-primary"
              >
                {ex}
              </Link>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Section references go straight to the section. Other words are searched across headings and text with English stemming, so
            “cheat” also finds “cheating”.
          </p>
        </Card>
      ) : !error && hits.length === 0 && !empty ? (
        <EmptyState icon={SearchX} title="No sections matched" description="Try fewer or different words, remove the act filter, or search by section number." />
      ) : hits.length > 0 ? (
        <section aria-label="Search results">
          <p className="mb-3 text-sm text-muted">
            {hits.length} {hits.length === 1 ? "section" : "sections"}
            {actId ? ` in the ${ACT_INFO[actId].shortTitle}` : ""}
          </p>
          <ol className="space-y-3">
            {hits.map((h) => (
              <li key={`${h.actId}-${h.sectionNo}`}>
                <Link
                  href={sectionHref(h.actId, h.sectionNo)}
                  className="group block rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="primary">
                      {isActId(h.actId) ? ACT_INFO[h.actId].abbr : h.actId} s. {h.sectionNo}
                    </Badge>
                    {h.exact ? <Badge tone="success">Exact section</Badge> : null}
                    <span className="text-xs text-muted">{h.actTitle}</span>
                  </div>
                  <h2 className="mt-2 font-medium text-ink group-hover:text-primary">{h.heading}</h2>
                  <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-2">
                    <MarkedSnippet text={h.snippetMarked} />
                  </p>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/* -------------------------------- Case law -------------------------------- */

const CASE_EXAMPLES = ["anticipatory bail", "circumstantial evidence", "reversal of acquittal", "dowry death", "498A arrest"];

function caseHref(id: string, paraNo: number | null) {
  return `/app/research/case/${id}${paraNo && paraNo > 0 ? `#para-${paraNo}` : ""}`;
}

function CaseMeta({ j }: { j: { court: string; decidedOn: string | null; citation: string | null } }) {
  return (
    <span className="text-[13px] text-muted">
      {j.court}
      {j.decidedOn ? <span className="tabular"> · {formatDecided(j.decidedOn)}</span> : null}
      {j.citation ? <span className="tabular"> · {j.citation.split(/;\s*/)[0]}</span> : null}
    </span>
  );
}

async function CaseLawView({ userId, q, court, year }: { userId: string; q: string; court: string; year: string }) {
  const y = /^\d{4}$/.test(year) ? Number(year) : null;
  let courts: Awaited<ReturnType<typeof libraryCourts>> = [];
  let hits: CaseLawHit[] = [];
  let recent: Awaited<ReturnType<typeof recentJudgments>> = [];
  let error: string | null = null;
  try {
    courts = await libraryCourts();
    const courtFilter = courts.some((c) => c.court === court) ? court : null;
    if (q) {
      await enforceRateLimit(`research:${userId}`, 60, 60);
      hits = await searchCaseLaw(q, { court: courtFilter, year: y, limit: 25 });
    } else if (courts.length) {
      recent = await recentJudgments({ court: courtFilter, year: y, limit: 12 });
    }
  } catch (e) {
    error = e instanceof RateLimitError ? e.message : "Case-law search is unavailable right now. The judgments library could not be read.";
    if (!(e instanceof RateLimitError)) console.error("[research] case law failed", e);
  }
  const total = courts.reduce((a, c) => a + Number(c.n), 0);

  return (
    <div className="space-y-5">
      <form action="/app/research" method="get" role="search" className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_220px_110px_auto] sm:items-end">
        <input type="hidden" name="tab" value="case" />
        <Field label="Search judgments" htmlFor="cq">
          <Input id="cq" name="q" type="search" defaultValue={q} placeholder="Words, a case name or a citation" maxLength={300} autoComplete="off" />
        </Field>
        <Field label="Court" htmlFor="ccourt">
          <Select id="ccourt" name="court" defaultValue={court}>
            <option value="">All courts</option>
            {courts.map((c) => (
              <option key={c.court} value={c.court}>
                {c.court}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Year" htmlFor="cyear">
          <Input id="cyear" name="year" type="number" inputMode="numeric" min={1950} max={2100} defaultValue={y ?? ""} placeholder="Any" className="tabular" />
        </Field>
        <Button type="submit" className="w-full sm:w-auto">
          Search
        </Button>
      </form>

      {error ? <Alert tone="danger" title="Search failed">{error}</Alert> : null}

      {!error && total === 0 ? (
        <EmptyState
          icon={Gavel}
          title="No judgments in the library yet"
          description="Decided cases appear here once an administrator adds them. Until then, AI answers say that no precedent was found instead of citing cases from memory."
        />
      ) : !q ? (
        <div className="space-y-5">
          <Card className="p-5">
            <p className="text-sm text-ink-2">
              <span className="font-semibold text-ink tabular">{total.toLocaleString("en-IN")}</span> {total === 1 ? "judgment" : "judgments"} from{" "}
              <span className="tabular">{courts.length}</span> {courts.length === 1 ? "court" : "courts"}. Search by words (with stemming), a case name (“Arnesh Kumar v. State of Bihar”) or a citation (“2024 INSC 735”).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CASE_EXAMPLES.map((ex) => (
                <Link
                  key={ex}
                  href={`/app/research?tab=case&q=${encodeURIComponent(ex)}`}
                  className="inline-flex min-h-10 items-center rounded-full border border-border-strong px-3 text-sm text-ink-2 hover:border-primary hover:text-primary"
                >
                  {ex}
                </Link>
              ))}
            </div>
          </Card>
          {recent.length ? (
            <section aria-labelledby="recent-cases">
              <h2 id="recent-cases" className="mb-3 text-[15px] font-bold tracking-tight text-ink">
                {y || court ? "Judgments" : "Latest decisions"}
              </h2>
              <Card>
                <ul className="divide-y divide-border">
                  {recent.map((j) => (
                    <li key={j.id}>
                      <Link href={caseHref(j.id, null)} className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                        <IconTile icon={Gavel} size="sm" tone="navy" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-ink">{j.title}</span>
                          <span className="block truncate">
                            <CaseMeta j={j} />
                          </span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : (
            <p className="text-sm text-muted">No judgments match these filters.</p>
          )}
        </div>
      ) : !error && hits.length === 0 ? (
        <EmptyState icon={SearchX} title="No judgments matched" description="Try fewer or different words, or clear the court and year filters." />
      ) : hits.length > 0 ? (
        <section aria-label="Case-law results">
          <p className="mb-3 text-sm text-muted">
            {hits.length} {hits.length === 1 ? "judgment" : "judgments"}
          </p>
          <ol className="space-y-3">
            {hits.map((h) => (
              <li key={h.id}>
                <Link href={caseHref(h.id, h.paraNo)} className="group block rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary/40">
                  <div className="flex flex-wrap items-center gap-2">
                    {h.exact ? <Badge tone="success" dot>Named case</Badge> : null}
                    <CaseMeta j={h} />
                  </div>
                  <h2 className="mt-1.5 font-serif text-[17px] font-semibold text-ink group-hover:text-primary">{h.title}</h2>
                  {h.snippetMarked ? (
                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-2">
                      {h.paraNo !== null && h.paraNo > 0 ? <span className="mr-1 font-semibold text-primary tabular">¶ {h.paraNo}</span> : null}
                      <MarkedSnippet text={h.snippetMarked} />
                    </p>
                  ) : null}
                  {h.hits > 1 ? <p className="mt-1.5 text-xs text-muted tabular">{h.hits} matching paragraphs</p> : null}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/* --------------------------------- Convert -------------------------------- */

async function ConvertView({ from, section, date }: { from: string; section: string; date: string }) {
  const fromAct = (normaliseActId(from) ?? "IPC") as ActId;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  let result: Awaited<ReturnType<typeof convertWithDate>> = null;
  let error: string | null = null;
  if (section) {
    try {
      result = await convertWithDate({ fromAct, section, date: validDate || null });
    } catch (e) {
      console.error("[research] convert failed", e);
      error = "The converter is unavailable right now. The corpus tables could not be read.";
    }
  }
  const flags = result && result.mappings.length === 0 ? correspondenceFor(fromAct, result.section) : null;
  const directions: { from: ActId; to: ActId }[] = CODE_PAIRS.flatMap((p) => [
    { from: p.old, to: p.new },
    { from: p.new, to: p.old },
  ]);

  return (
    <div className="space-y-5">
      <form action="/app/research" method="get" className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm md:grid-cols-[220px_minmax(0,1fr)_200px_auto] md:items-end">
        <input type="hidden" name="tab" value="convert" />
        <Field label="From" htmlFor="from">
          <Select id="from" name="from" defaultValue={fromAct}>
            {directions.map((d) => (
              <option key={d.from} value={d.from}>
                {ACT_INFO[d.from].abbr} → {ACT_INFO[d.to].abbr}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Section" htmlFor="s">
          <Input id="s" name="s" defaultValue={section} placeholder="e.g. 302 or 498A" maxLength={12} autoComplete="off" required />
        </Field>
        <Field label="Date of offence or proceeding" htmlFor="date">
          <Input id="date" name="date" type="date" defaultValue={validDate} />
        </Field>
        <Button type="submit" className="w-full md:w-auto">
          Convert
        </Button>
      </form>
      <p className="text-sm text-muted">
        For the IPC and BNS, enter the date of the offence. For the CrPC, BNSS, Evidence Act and BSA, enter the date the proceeding began.
      </p>

      {error ? <Alert tone="danger" title="Conversion failed">{error}</Alert> : null}

      {result?.governing ? (
        <div className={`rounded-lg border p-4 sm:p-5 ${result.governing.isOldCode ? "border-warning/30 bg-warning-soft" : "border-primary/25 bg-primary-soft/60"}`}>
          <p className="flex items-center gap-2 font-semibold text-ink">
            <CalendarClock className="size-4 text-primary" aria-hidden /> {result.governing.headline}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{result.governing.reason}</p>
          <Link href={sectionHref(result.governing.authority.actId, result.governing.authority.sectionNo)} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Read {result.governing.authority.label} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : null}

      {section && result && !error ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">{ACT_INFO[result.fromAct].title}</p>
            {result.fromHeading ? (
              <Link href={sectionHref(result.fromAct, result.section)} className="mt-1 block font-serif text-xl font-semibold text-ink hover:text-primary">
                Section {result.section}: {result.fromHeading}
              </Link>
            ) : (
              <p className="mt-1 font-serif text-xl font-semibold text-ink">
                {ACT_INFO[result.fromAct].abbr} s. {result.section} is not in the corpus
              </p>
            )}
            <p className="mt-3 text-sm text-muted">Correspondence comes from the official NCRB SANKALAN table and is stored with its source on every row.</p>
          </Card>
          <CorrespondenceBox
            fromAct={result.fromAct}
            sectionNo={result.section}
            matches={result.mappings.map((m) => {
              const isOld = m.oldAct === fromAct;
              const actId = (isOld ? m.newAct : m.oldAct) as ActId;
              return {
                actId,
                sectionNo: isOld ? m.newSection : m.oldSection,
                heading: m.otherHeading,
                details: (m.note ?? "").split(/;\s*/).filter((d) => d && !d.startsWith("NCRB marks")).map((d) => d.replace(/\.\s*NCRB marks.*$/, "")),
                changed: /NCRB marks the new provision as changed/.test(m.note ?? ""),
              };
            })}
            isNew={flags?.isNew}
            omitted={flags?.omitted}
            sourceUrl={result.mappings[0]?.source.match(/https?:\/\/\S+$/)?.[0] ?? flags?.sourceUrl}
            hrefFor={(a, no) => sectionHref(a, no)}
          />
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------- Browse --------------------------------- */

async function BrowseView() {
  let rows: Awaited<ReturnType<typeof listActs>> = [];
  let error = false;
  try {
    rows = await listActs();
  } catch (e) {
    console.error("[research] listActs failed", e);
    error = true;
  }
  if (error) return <Alert tone="danger" title="Acts could not be loaded">The corpus tables could not be read. Try again shortly.</Alert>;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={Library}
        title="No acts loaded yet"
        description="The bare-act corpus has not been seeded into the database. An administrator can run npm run db:seed."
      />
    );
  const order = new Map(ACT_IDS.map((id, i) => [id as string, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((a) => (
        <Link
          key={a.id}
          href={`/app/research/${isActId(a.id) ? ACT_INFO[a.id].slug : a.id.toLowerCase()}`}
          className="group flex flex-col rounded-lg border border-border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <BookOpenText className="size-5" aria-hidden />
            </span>
            {a.repealedOn ? <Badge tone="warning">Repealed {formatActDate(a.repealedOn)}</Badge> : <Badge tone="success">In force</Badge>}
          </div>
          <h2 className="mt-3 font-medium text-ink group-hover:text-primary">{a.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {a.sectionCount} sections{a.inForceFrom ? ` · in force from ${formatActDate(a.inForceFrom)}` : ""}
          </p>
        </Link>
      ))}
    </div>
  );
}
