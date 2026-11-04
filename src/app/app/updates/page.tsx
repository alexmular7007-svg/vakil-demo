import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Landmark, Newspaper } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getUpdatesAccess } from "@/lib/billing/entitlements";
import { corpusAmendments, lastSyncAt, latestTitles, listUpdates } from "@/lib/updates/queries";
import { nextScheduledSync, parseFilter, UPDATE_FILTERS } from "@/lib/updates/format";
import { SOURCES } from "@/lib/updates/sources";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { UpdatesPaywall, UpdatesTrialBanner } from "@/components/billing/updates-paywall";
import { LockedTeaser, UpdateFeed } from "@/components/updates/update-list";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Legal updates" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SOURCE_NAMES = ["India Code", ...SOURCES.filter((s) => s.enabled).map((s) => s.name)];

function Header() {
  return (
    <PageHeader
      eyebrow="AI & research"
      icon={Newspaper}
      title="Legal updates"
      description="New bills, Acts, amendments, notifications, Supreme Court judgments and legal news from official and trusted sources, checked every 6 hours."
    />
  );
}

function Attribution() {
  return (
    <p className="mt-8 flex items-start gap-2 text-[13px] leading-relaxed text-muted">
      <Landmark className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>
        Sources: {SOURCE_NAMES.join(", ")}. Each item links to its source; Vaakil shows only the headline and a short description. Bare-act text is
        updated from India Code and recorded in each section&apos;s history. Verify against the Gazette of India before relying on a change.
      </span>
    </p>
  );
}

export default async function UpdatesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser("/app/updates");
  await connection();
  const now = new Date();
  const access = await getUpdatesAccess(user);

  if (access.status === "expired") {
    // The feed is paid; bare-act amendments applied to the corpus stay free (law text is free).
    const [titles, amendments] = await Promise.all([latestTitles(3), corpusAmendments(10)]);
    return (
      <div>
        <Header />
        <UpdatesPaywall access={access} />
        <LockedTeaser titles={titles} />
        {amendments.length ? (
          <div className="mt-8">
            <h2 className="mb-1 font-serif text-xl font-semibold text-ink">Bare act changes</h2>
            <p className="mb-4 text-sm text-muted">Free for everyone: amendments applied to the bare acts in Research.</p>
            <UpdateFeed items={amendments} now={now} dayHeading="h3" />
          </div>
        ) : null}
        <Attribution />
      </div>
    );
  }

  const sp = await searchParams;
  const filter = parseFilter(sp.kind);
  const [items, lastSync] = await Promise.all([listUpdates({ filter }), lastSyncAt()]);
  const next = nextScheduledSync(now);

  return (
    <div>
      <Header />
      {access.status === "trial" ? (
        <div className="mb-6">
          <UpdatesTrialBanner access={access} />
        </div>
      ) : null}

      <nav aria-label="Filter updates" className="mb-6 flex flex-wrap gap-2">
        {UPDATE_FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <Link
              key={f.value}
              href={f.value === "all" ? "/app/updates" : `/app/updates?kind=${f.value}`}
              aria-current={active ? "page" : undefined}
              scroll={false}
              className={cn(
                "pressable inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold sm:min-h-9",
                active ? "border-primary bg-primary text-primary-ink shadow-sm" : "border-border-input/60 bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        filter === "all" ? (
          <EmptyState
            icon={Newspaper}
            title="No legal updates yet"
            description={
              <>
                Vaakil checks {SOURCE_NAMES.join(", ")} every 6 hours. {lastSync ? `Last checked ${formatDateTime(lastSync)}. ` : ""}Next check around{" "}
                <span className="tabular">{formatDateTime(next)}</span>.
                {access.status === "trial" ? " Daily updates are free during your trial." : ""}
              </>
            }
          />
        ) : (
          <EmptyState
            icon={Newspaper}
            title={`No ${UPDATE_FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} yet`}
            description={<>Try another filter, or check back after the next update around <span className="tabular">{formatDateTime(next)}</span>.</>}
            action={
              <Link href="/app/updates" className="text-sm font-semibold text-primary hover:underline">
                Show all updates
              </Link>
            }
          />
        )
      ) : (
        <>
          {lastSync ? (
            <p className="mb-4 text-xs text-muted">
              Last checked <span className="tabular">{formatDateTime(lastSync)}</span> · next around <span className="tabular">{formatDateTime(next)}</span>
            </p>
          ) : null}
          <UpdateFeed items={items} now={now} />
        </>
      )}

      <Attribution />
    </div>
  );
}
