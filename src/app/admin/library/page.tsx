import type { Metadata } from "next";
import Link from "next/link";
import { asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { ArrowRight, BookOpenText, ChevronLeft, ChevronRight, DatabaseZap, Gavel, History, Landmark, Plus, Search, Upload } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/guard";
import { db } from "@/lib/db";
import { acts, judgments, sections, syncRuns, user as userTable } from "@/lib/db/schema";
import { recentRevisions } from "@/lib/corpus/revise";
import { formatDecided } from "@/lib/judgments/cite";
import { libraryCourts, listJudgmentsAdmin } from "@/lib/judgments/queries";
import { sourceFor, UPLOAD_SOURCE_KEY } from "@/lib/judgments/sources";
import { Alert, Badge, Card, EmptyState, IconTile, PageHeader, SectionHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { LibraryTabs, type LibraryTab } from "@/components/library/library-tabs";
import { DeleteJudgmentButton } from "@/components/library/delete-judgment-button";
import { ActDialog } from "@/components/library/act-dialog";
import { TrackedSwitch } from "@/components/library/tracked-switch";
import { RevisionList } from "@/components/library/revision-list";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Law library" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const PAGE = 25;

function one(v: string | string[] | undefined, max = 200) {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim().slice(0, max);
}

export default async function AdminLibraryPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const t = one(sp.tab);
  const tab: LibraryTab = t === "acts" || t === "history" ? t : "judgments";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        icon={Landmark}
        title="Law library"
        description="Decided cases the AI answers from, the bare acts, and every change made to statute text."
      />
      <LibraryTabs active={tab} />
      {tab === "judgments" ? <JudgmentsTab q={one(sp.q)} court={one(sp.court)} page={Math.max(1, Number.parseInt(one(sp.page, 6), 10) || 1)} /> : null}
      {tab === "acts" ? <ActsTab /> : null}
      {tab === "history" ? <HistoryTab before={one(sp.before, 40)} /> : null}
    </div>
  );
}

/* -------------------------------- Judgments -------------------------------- */

async function JudgmentsTab({ q, court, page }: { q: string; court: string; page: number }) {
  const [{ rows, total }, courts, bySource, runs] = await Promise.all([
    listJudgmentsAdmin({ q, court: court || undefined, page, pageSize: PAGE }),
    libraryCourts(),
    db.select({ key: judgments.sourceKey, n: count() }).from(judgments).groupBy(judgments.sourceKey),
    db.select().from(syncRuns).where(eq(syncRuns.kind, "judgments")).orderBy(desc(syncRuns.startedAt)).limit(5),
  ]);
  const all = bySource.reduce((a, r) => a + Number(r.n), 0);
  const uploaded = Number(bySource.find((r) => r.key === UPLOAD_SOURCE_KEY)?.n ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (p: number) => `/admin/library?${new URLSearchParams({ tab: "judgments", ...(q ? { q } : {}), ...(court ? { court } : {}), page: String(p) })}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Judgments", value: all },
          { label: "Uploaded", value: uploaded },
          { label: "Open datasets", value: all - uploaded },
        ].map((s) => (
          <Card key={s.label} className="p-3 sm:p-4">
            <p className="text-xs text-muted sm:text-sm">{s.label}</p>
            <p className="mt-0.5 font-serif text-2xl font-semibold text-ink tabular">{s.value.toLocaleString("en-IN")}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <form method="get" role="search" aria-label="Search judgments" className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
          <input type="hidden" name="tab" value="judgments" />
          <label htmlFor="lib-q" className="sr-only">
            Title, citation, case number or parties
          </label>
          <Input id="lib-q" name="q" type="search" defaultValue={q} placeholder="Title, citation or case number" maxLength={200} />
          <label htmlFor="lib-court" className="sr-only">
            Court
          </label>
          <Select id="lib-court" name="court" defaultValue={court}>
            <option value="">All courts</option>
            {courts.map((c) => (
              <option key={c.court} value={c.court}>
                {c.court} ({Number(c.n).toLocaleString("en-IN")})
              </option>
            ))}
          </Select>
          <Button type="submit" variant="outline">
            <Search /> Search
          </Button>
        </form>
        <Button asChild>
          <Link href="/admin/library/judgments/new">
            <Plus /> Add judgment
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title={q || court ? "No judgments match" : "No judgments yet"}
          description={
            q || court
              ? "Try other words or clear the court filter."
              : "Upload a judgment (PDF, Word or text) or run the open-dataset importer below. The AI answers case-law questions only from judgments in this library."
          }
          action={
            q || court ? null : (
              <Button asChild>
                <Link href="/admin/library/judgments/new">
                  <Upload /> Add the first judgment
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <section aria-labelledby="jl-heading">
          <SectionHeader title={<span id="jl-heading">{total.toLocaleString("en-IN")} {total === 1 ? "judgment" : "judgments"}</span>} />
          <Card>
            <ul className="divide-y divide-border">
              {rows.map((j) => {
                const src = sourceFor(j.sourceKey);
                return (
                  <li key={j.id} className="flex min-h-16 items-center gap-3 px-3 py-2.5 sm:px-4">
                    <IconTile icon={Gavel} size="sm" tone={j.sourceKey === UPLOAD_SOURCE_KEY ? "gold" : "navy"} />
                    <Link href={`/app/research/case/${j.id}`} className="min-w-0 flex-1 rounded-md py-1 hover:text-primary">
                      <p className="truncate text-[15px] font-semibold text-ink">{j.title}</p>
                      <p className="truncate text-[13px] text-muted">
                        {j.court}
                        {j.decidedOn ? <span className="tabular"> · {formatDecided(j.decidedOn)}</span> : null}
                        {j.citation ? <span className="tabular"> · {j.citation.split(/;\s*/)[0]}</span> : null}
                        <span className="tabular"> · {j.paraCount} paras</span>
                      </p>
                    </Link>
                    <Badge tone={src ? "info" : "accent"} dot className="hidden sm:inline-flex">
                      {src ? "Open dataset" : "Uploaded"}
                    </Badge>
                    <DeleteJudgmentButton id={j.id} title={j.title} />
                  </li>
                );
              })}
            </ul>
          </Card>
          {pages > 1 ? (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={link(page - 1)}>
                    <ChevronLeft /> Previous
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted tabular">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={link(page + 1)}>
                    Next <ChevronRight />
                  </Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      )}

      <section aria-labelledby="imp-heading">
        <SectionHeader title={<span id="imp-heading">Open-dataset importer</span>} />
        <Card className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <IconTile icon={DatabaseZap} size="sm" tone="teal" />
            <div className="min-w-0 flex-1 space-y-2 text-sm text-ink-2">
              <p>
                Imports Supreme Court and High Court judgments from the{" "}
                <a href="https://registry.opendata.aws/indian-supreme-court-judgments/" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                  Indian Supreme Court
                </a>{" "}
                and{" "}
                <a href="https://registry.opendata.aws/indian-high-court-judgments/" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                  High Court
                </a>{" "}
                judgments datasets (Dattam Labs, CC BY 4.0) on the Registry of Open Data on AWS. Already imported judgments are skipped. Run it on the
                server:
              </p>
              <code className="block rounded-md bg-surface-2 px-3 py-2 font-mono text-[13px] break-all text-ink">
                npx tsx --conditions=react-server scripts/judgments/import.ts --court sc --year 2024 --limit 50
              </code>
              <p className="text-muted">
                For a High Court add <code className="font-mono">--court hc --bench-court 27_1</code> (eCourts court code; 27_1 is Bombay).
              </p>
            </div>
          </div>
          {runs.length ? (
            <ul className="mt-4 divide-y divide-border border-t border-border">
              {runs.map((r) => {
                const s = (r.summary ?? {}) as Record<string, unknown>;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                    <Badge tone={r.status === "ok" ? "success" : r.status === "running" ? "info" : r.status === "partial" ? "warning" : "danger"} dot>
                      {r.status}
                    </Badge>
                    <span className="text-ink tabular">{formatDateTime(r.startedAt)}</span>
                    <span className="text-muted tabular">
                      {s.court === "sc" ? "Supreme Court" : s.court === "hc" ? `High Court${s.benchCourt ? ` ${String(s.benchCourt)}` : ""}` : "Import"}
                      {s.year ? ` ${String(s.year)}` : ""} · {Number(s.imported ?? 0)} imported · {Number(s.skipped ?? 0)} skipped
                      {Number(s.failed ?? 0) ? ` · ${Number(s.failed)} failed` : ""}
                    </span>
                    {r.error ? <span className="w-full truncate text-xs text-danger">{r.error}</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 border-t border-border pt-3 text-sm text-muted">No imports have run yet.</p>
          )}
        </Card>
      </section>
    </div>
  );
}

/* ---------------------------------- Acts ---------------------------------- */

async function ActsTab() {
  const rows = await db
    .select({
      id: acts.id,
      title: acts.title,
      shortTitle: acts.shortTitle,
      year: acts.year,
      tracked: acts.tracked,
      updatedAt: acts.updatedAt,
      lastSyncedAt: acts.lastSyncedAt,
      sectionCount: sql<number>`(select count(*)::int from ${sections} where ${sections.actId} = "acts"."id")`,
    })
    .from(acts)
    .orderBy(asc(acts.year), asc(acts.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Tracked acts are checked against India Code by the updates job. Section edits here are recorded in History.
        </p>
        <ActDialog mode="create" />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={BookOpenText} title="No acts yet" description="Seed the bare-act corpus or add an act." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((a) => (
              <li key={a.id} className="flex min-h-16 items-center gap-3 px-3 py-2.5 sm:px-4">
                <IconTile icon={BookOpenText} size="sm" tone="navy" />
                <Link href={`/admin/library/acts/${a.id}`} className="group min-w-0 flex-1 py-1">
                  <p className="truncate text-[15px] font-semibold text-ink group-hover:text-primary">{a.title}</p>
                  <p className="truncate text-[13px] text-muted">
                    <span className="font-mono">{a.id}</span>
                    <span className="tabular"> · {a.sectionCount} sections</span>
                    <span className="tabular"> · updated {a.updatedAt ? formatDate(a.updatedAt) : "never"}</span>
                    <span className="tabular"> · synced {a.lastSyncedAt ? formatDate(a.lastSyncedAt) : "never"}</span>
                  </p>
                </Link>
                <TrackedSwitch actId={a.id} title={a.shortTitle} tracked={a.tracked} />
                <Link href={`/admin/library/acts/${a.id}`} aria-label={`Open ${a.shortTitle}`} className="hidden size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink sm:inline-flex">
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* --------------------------------- History --------------------------------- */

async function HistoryTab({ before }: { before: string }) {
  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined;
  let revs: Awaited<ReturnType<typeof recentRevisions>> = [];
  try {
    revs = await recentRevisions(30, beforeDate);
  } catch (e) {
    console.error("[library] revisions failed", e);
    return <Alert tone="danger" title="History could not be loaded">Try again shortly.</Alert>;
  }
  const ids = [...new Set(revs.map((r) => r.changedBy).filter((v) => v && v !== "system"))];
  const people = ids.length ? await db.select({ id: userTable.id, email: userTable.email, name: userTable.name }).from(userTable).where(inArray(userTable.id, ids)) : [];
  const who = Object.fromEntries(people.map((p) => [p.id, p.name || p.email]));
  const last = revs[revs.length - 1];

  if (revs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={beforeDate ? "No older changes" : "No changes yet"}
        description="Every change to statute text, from an India Code sync or an admin edit, appears here with its before and after."
      />
    );
  }
  return (
    <div className="space-y-4">
      <RevisionList
        items={revs.map((r) => ({
          id: r.id,
          actId: r.actId,
          sectionNo: r.sectionNo,
          beforeHeading: r.beforeHeading,
          beforeText: r.beforeText,
          afterHeading: r.afterHeading,
          afterText: r.afterText,
          source: r.source,
          sourceRef: r.sourceRef,
          who: r.changedBy === "system" ? "Sync job" : (who[r.changedBy] ?? r.changedBy),
          note: r.note,
          createdAt: r.createdAt,
        }))}
      />
      {revs.length === 30 && last ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/admin/library?tab=history&before=${encodeURIComponent(last.createdAt.toISOString())}`}>
              Older changes <ChevronRight />
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
