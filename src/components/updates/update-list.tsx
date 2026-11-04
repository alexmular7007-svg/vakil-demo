import Link from "next/link";
import { ChevronRight, ExternalLink, Lock } from "lucide-react";
import { Badge, Card, IconTile } from "@/components/ui/display";
import { actLabel, actResearchHref, dayLabel, istDay, kindMeta, timeLabel } from "@/lib/updates/format";
import { CORPUS_UPDATED_TAG } from "@/lib/updates/types";
import { INITIAL_IMPORT_TAG } from "@/lib/updates/types";
import type { UpdateRow } from "@/lib/updates/queries";

/** Undated back-catalogue items (a source's first import) carry no date of their own. */
const undated = (u: Pick<UpdateRow, "publishedAt" | "tags">) => !u.publishedAt && u.tags.includes(INITIAL_IMPORT_TAG);

// Server components for the /app/updates feed: rows grouped by day (IST), each opening
// its source in a new tab; amendments that changed a bare act open it in Research.

const isMidnightIst = (d: Date) => timeLabel(d).replace(/\s/g, "").toLowerCase() === "12:00am";

function UpdateItem({ u }: { u: UpdateRow }) {
  const k = kindMeta(u.kind);
  const corpus = u.kind === "amendment" && u.tags.includes(CORPUS_UPDATED_TAG);
  const research = corpus ? u.acts.map(actResearchHref).find(Boolean) ?? null : null;
  const at = u.publishedAt ?? u.createdAt;
  const showTime = !undated(u) && (!u.publishedAt || !isMidnightIst(u.publishedAt));
  return (
    <li className="group relative flex min-h-14 items-start gap-3 px-4 py-3.5 transition-colors focus-within:bg-surface-2/60 hover:bg-surface-2/60 sm:px-5">
      <IconTile icon={k.icon} tone={k.tile} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {research ? (
          <Link href={research} className="line-clamp-2 font-semibold text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {u.title}
          </Link>
        ) : (
          <a
            href={u.url}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 font-semibold text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {u.title}
            <span className="sr-only"> (opens {u.sourceName} in a new tab)</span>
          </a>
        )}
        {u.summary ? <p className="mt-0.5 line-clamp-2 text-sm text-muted">{u.summary}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Badge tone={k.badge}>{k.label}</Badge>
          {corpus ? (
            <Badge tone="success" dot>
              Bare act updated
            </Badge>
          ) : u.importance === "high" ? (
            <Badge tone="warning" dot>
              Important
            </Badge>
          ) : null}
          {u.acts.map((a) => (
            <Badge key={a} tone="outline">
              {actLabel(a)}
            </Badge>
          ))}
          <span className="ml-0.5">{u.sourceName}</span>
          {showTime ? (
            <>
              <span aria-hidden>·</span>
              <time dateTime={at.toISOString()} className="tabular">
                {timeLabel(at)}
              </time>
            </>
          ) : null}
          {corpus ? (
            <a
              href={u.url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 ml-1 inline-flex min-h-11 items-center gap-1 font-semibold text-primary hover:underline sm:min-h-8"
            >
              India Code <ExternalLink className="size-3" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      </div>
      {research ? (
        <ChevronRight className="mt-2.5 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
      ) : (
        <ExternalLink className="mt-2.5 size-4 shrink-0 text-muted" aria-hidden />
      )}
    </li>
  );
}

/** Items grouped by calendar day in India time, newest first. */
export function UpdateFeed({ items, now, dayHeading: Day = "h2" }: { items: UpdateRow[]; now: Date; dayHeading?: "h2" | "h3" }) {
  const groups: { day: string; items: UpdateRow[] }[] = [];
  for (const u of items) {
    const day = undated(u) ? "earlier" : istDay(u.publishedAt ?? u.createdAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(u);
    else groups.push({ day, items: [u] });
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.day} aria-labelledby={`day-${g.day}`}>
          <Day id={`day-${g.day}`} className="mb-2 px-1 text-[11px] font-bold tracking-[0.12em] text-muted uppercase">
            {g.day === "earlier" ? "Earlier (no date from the source)" : <span className="tabular">{dayLabel(g.day, now)}</span>}
          </Day>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {g.items.map((u) => (
                <UpdateItem key={u.id} u={u} />
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}

/** After the trial: a few titles only, no links, so the user sees what they are missing. */
export function LockedTeaser({ titles }: { titles: { id: string; title: string; kind: string }[] }) {
  if (!titles.length) return null;
  return (
    <section aria-labelledby="locked-h" className="mt-6">
      <h2 id="locked-h" className="mb-2 px-1 text-[11px] font-bold tracking-[0.12em] text-muted uppercase">
        Latest in the feed
      </h2>
      <Card aria-label="Locked updates">
        <ul className="divide-y divide-border">
          {titles.map((t) => (
            <li key={t.id} className="flex min-h-14 items-center gap-3 px-4 py-3 text-muted select-none sm:px-5">
              <IconTile icon={Lock} tone="slate" size="sm" />
              <span className="line-clamp-2 min-w-0 flex-1 text-sm">{t.title}</span>
              <span className="sr-only">Locked: subscribe to read.</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
