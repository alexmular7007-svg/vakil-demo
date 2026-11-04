import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Newspaper } from "lucide-react";
import { requireAdminPage } from "@/lib/admin/guard";
import { features } from "@/lib/env";
import { adminItems, importanceCounts, parseImportanceFilter, recentRuns, runningRuns, sourceStatuses } from "@/lib/updates/admin";
import { healthLevel, isStaleRun, type SourceHealth } from "@/lib/updates/health";
import { trackedActs } from "@/lib/updates/india-code";
import { actLabel, kindMeta } from "@/lib/updates/format";
import { parseVersion } from "@/lib/updates/india-code-parse";
import { INITIAL_IMPORT_TAG } from "@/lib/updates/types";
import { Alert, Badge, Card, EmptyState, IconTile, PageHeader, SectionHeader } from "@/components/ui/display";
import { ImportanceSelect, SyncNowButtons } from "@/components/updates/admin-controls";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Legal updates" };
// "Sync now" runs the whole job inside the server action.
export const maxDuration = 300;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const runTone = { ok: "success", partial: "warning", failed: "danger", running: "info" } as const;
const tabs = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "hidden", label: "Hidden" },
] as const;

const healthTone = { ok: "success", degraded: "warning", down: "danger", unknown: "neutral" } as const;

/** "2 failures in a row · last success 3 Nov, 14:00" (or the first success). */
function healthLine(h: SourceHealth | null) {
  if (!h) return null;
  const parts: string[] = [];
  if (h.consecutiveFailures) parts.push(`${h.consecutiveFailures} failure${h.consecutiveFailures === 1 ? "" : "s"} in a row`);
  parts.push(h.lastSuccessAt ? `last success ${formatDateTime(new Date(h.lastSuccessAt))}` : "no successful read recorded");
  return parts.join(" · ");
}

function duration(a: Date, b: Date | null) {
  if (!b) return "running";
  const s = Math.round((b.getTime() - a.getTime()) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export default async function AdminUpdatesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const filter = parseImportanceFilter(sp.importance);
  const [sources, runs, items, counts, actsRows, running] = await Promise.all([
    sourceStatuses(),
    recentRuns(15),
    adminItems(filter, 100),
    importanceCounts(),
    trackedActs(),
    runningRuns(),
  ]);
  const now = new Date();
  const live = running.filter((r) => !isStaleRun(r, now));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Legal updates"
        description="Bills, acts, notifications, Supreme Court judgments and legal news, checked every 6 hours. Amendments to tracked acts are applied to the bare-act corpus through the revision log."
        actions={<SyncNowButtons />}
      />

      {!features.updatesCron ? (
        <Alert tone="warning" title="Scheduled sync is not configured">
          Set <code>CRON_SECRET</code> so Vercel Cron can call <code>/api/cron/updates</code> every 6 hours. Locally, <code>npm run local</code> runs the sync in
          the background.
        </Alert>
      ) : null}

      {live.length ? (
        <Alert tone="info" title="A sync is running">
          {live.map((r) => (r.kind === "india_code" ? "India Code check" : "Feeds")).join(" and ")} started {formatDateTime(live[live.length - 1].startedAt)}
          {(live[0].summary as { trigger?: string } | null)?.trigger ? ` (${(live[0].summary as { trigger?: string }).trigger})` : ""}. Only one sync runs at a time;
          Sync now waits until it has finished.
        </Alert>
      ) : null}

      <section aria-labelledby="sources-h">
        <SectionHeader title={<span id="sources-h">Sources</span>} />
        <Card>
          <ul className="divide-y divide-border">
            {sources.map((s) => (
              <li key={s.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-ink hover:text-primary">
                      {s.name} <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                    {!s.enabled ? (
                      <Badge tone="neutral">{s.disabledBy === "env" ? "Off (DISABLED_UPDATE_SOURCES)" : "Off"}</Badge>
                    ) : s.last ? (
                      <Badge tone={s.last.ok ? healthTone[healthLevel(s.health)] : s.health && s.health.consecutiveFailures >= 3 ? "danger" : "warning"} dot>
                        {s.last.ok ? "OK" : s.health && s.health.consecutiveFailures >= 3 ? "Down" : "Failed"}
                      </Badge>
                    ) : (
                      <Badge tone="info" dot>
                        Not run yet
                      </Badge>
                    )}
                    <span className="font-mono text-xs text-muted">{s.key}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{s.note}</p>
                  {s.health ? (
                    <p className={cn("mt-1 text-xs tabular", s.health.consecutiveFailures ? "text-warning" : "text-ink-2")}>{healthLine(s.health)}</p>
                  ) : null}
                  {s.last?.error ? <p className="mt-1 text-xs break-words text-danger">{s.last.error}</p> : null}
                </div>
                <dl className="grid shrink-0 grid-cols-3 gap-4 text-xs sm:w-72">
                  <div>
                    <dt className="text-muted">Items</dt>
                    <dd className="tabular font-semibold text-ink">{s.total}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Last run</dt>
                    <dd className="tabular font-semibold text-ink">
                      {s.last ? `${s.last.fetched} read, ${s.last.new} new` : "—"}
                      {s.last?.attempts && s.last.attempts > 1 ? <span className="block font-normal text-muted">{s.last.attempts} attempts</span> : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">When</dt>
                    <dd className="tabular text-ink-2">{s.last ? formatDateTime(s.last.at) : "—"}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section aria-labelledby="acts-h">
        <SectionHeader title={<span id="acts-h">India Code: tracked acts</span>} />
        <Card>
          <ul className="divide-y divide-border">
            {actsRows.map((a) => {
              const v = parseVersion(a.sourceVersion);
              return (
                <li key={a.id} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <span className="w-14 font-semibold text-ink">{actLabel(a.id)}</span>
                  <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-ink-2 hover:text-primary">
                    {a.title}
                  </a>
                  <span className="tabular text-xs text-muted">
                    {a.lastSyncedAt ? `checked ${formatDateTime(a.lastSyncedAt)}` : "not checked yet"}
                    {v.fp ? ` · version ${v.fp.slice(0, 8)}` : ""}
                    {a.updatedAt ? ` · text changed ${formatDateTime(a.updatedAt)}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <section aria-labelledby="runs-h">
        <SectionHeader title={<span id="runs-h">Recent runs</span>} />
        {runs.length === 0 ? (
          <EmptyState icon={Newspaper} title="No runs yet" description="Press Sync now, or wait for the scheduled run." />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {runs.map((r) => {
                const sum = (r.summary ?? {}) as { trigger?: string; new?: number; sources?: Record<string, { new: number }>; requests?: number };
                const newCount = sum.sources ? Object.values(sum.sources).reduce((a, s) => a + (s.new ?? 0), 0) : (sum.new ?? 0);
                return (
                  <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-4">
                    <span className="flex items-center gap-2">
                      <Badge tone={runTone[r.status as keyof typeof runTone] ?? "neutral"} dot>
                        {r.status}
                      </Badge>
                      <span className="font-semibold text-ink">{r.kind === "india_code" ? "India Code" : "Feeds"}</span>
                    </span>
                    <span className="tabular text-muted">
                      {formatDateTime(r.startedAt)} · {duration(r.startedAt, r.finishedAt)} · {sum.trigger ?? "?"} · {newCount} new
                      {sum.requests ? ` · ${sum.requests} requests` : ""}
                    </span>
                    {r.error ? <span className="min-w-0 flex-1 truncate text-xs text-danger sm:text-right" title={r.error}>{r.error}</span> : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="items-h">
        <SectionHeader title={<span id="items-h">Items</span>} />
        <nav aria-label="Importance" className="mb-3 flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1 sm:w-fit">
          {tabs.map((t) => (
            <Link
              key={t.value}
              href={t.value === "all" ? "/admin/updates" : `/admin/updates?importance=${t.value}`}
              aria-current={filter === t.value ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium sm:min-h-9",
                filter === t.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {t.label}
              <span className="tabular rounded-full bg-surface-2 px-1.5 text-xs">{counts[t.value] ?? 0}</span>
            </Link>
          ))}
        </nav>
        {items.length === 0 ? (
          <EmptyState icon={Newspaper} title="No items" description="Nothing stored with this importance yet." />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {items.map((u) => {
                const k = kindMeta(u.kind);
                return (
                  <li key={u.id} className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center", u.importance === "hidden" && "opacity-60")}>
                    <IconTile icon={k.icon} tone={k.tile} size="sm" className="hidden sm:inline-flex" />
                    <div className="min-w-0 flex-1">
                      <a href={u.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 font-semibold text-ink hover:text-primary">
                        {u.title}
                      </a>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <Badge tone={k.badge}>{k.label}</Badge>
                        <span>{u.sourceName}</span>
                        <span className="tabular">{formatDateTime(u.publishedAt ?? u.createdAt)}</span>
                        {u.acts.map((a) => (
                          <Badge key={a} tone="outline">
                            {actLabel(a)}
                          </Badge>
                        ))}
                        {u.tags.includes(INITIAL_IMPORT_TAG) ? <span>first import</span> : null}
                      </p>
                    </div>
                    <ImportanceSelect id={u.id} value={u.importance} title={u.title} />
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
