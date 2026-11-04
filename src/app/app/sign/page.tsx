import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import {
  ChevronRight,
  FileSignature,
  Plus,
  Signature,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/display";
import { EnvelopeStatusBadge } from "@/components/esign/status-badge";
import { requireUser } from "@/lib/auth/dal";
import { LIST_FILTERS, listEnvelopes, parseFilter, type ListFilter } from "@/lib/esign/queries";
import { formatDate, truncate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "E-Sign" };

const filterLabels: Record<ListFilter, string> = {
  all: "All",
  draft: "Drafts",
  active: "Out for signature",
  completed: "Completed",
  closed: "Declined, expired or voided",
};

export default async function SignListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/app/sign");
  await connection();
  const filter = parseFilter((await searchParams).status);
  // listEnvelopes applies expiry first.
  const { rows, counts } = await listEnvelopes(user.id, filter);
  const countFor = (f: ListFilter) => {
    const statuses = LIST_FILTERS[f];
    if (!statuses) return Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
    return statuses.reduce((a, s) => a + (counts[s] ?? 0), 0);
  };

  return (
    <div>
      <PageHeader eyebrow="Drafting & signing" icon={Signature}
        title="E-Sign"
        description="Send a document for lawyer review and Tier-2 electronic signature. Every step is recorded in a hash-chained audit trail."
        actions={
          <Button asChild>
            <Link href="/app/sign/new">
              <Plus aria-hidden /> New envelope
            </Link>
          </Button>
        }
      />

      <nav aria-label="Filter envelopes" className="-mx-4 mb-5 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1 rounded-lg bg-surface-2 p-1">
          {(Object.keys(LIST_FILTERS) as ListFilter[]).map((f) => (
            <li key={f}>
              <Link
                href={f === "all" ? "/app/sign" : `/app/sign?status=${f}`}
                aria-current={f === filter ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  f === filter ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {filterLabels[f]}
                <span className="text-xs tabular-nums text-muted">{countFor(f)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title={filter === "all" ? "Nothing sent for signature yet" : `No envelopes under “${filterLabels[filter]}”`}
          description={
            filter === "all"
              ? "Upload a PDF or start from one of your drafts. The default routing is lawyer review, then both parties sign in parallel."
              : "Try another filter, or create a new envelope."
          }
          action={
            <Button asChild>
              <Link href="/app/sign/new">
                <Plus aria-hidden /> New envelope
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/sign/${r.id}`}
                  className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/60 sm:px-5"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 truncate font-medium text-ink group-hover:text-primary">{r.title}</span>
                      <EnvelopeStatusBadge status={r.status} />
                    </div>
                    <p className="truncate text-[13px] text-muted">
                      {r.names.length ? truncate(r.names.join(", "), 90) : "No recipients"}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    {r.status !== "DRAFT" ? (
                      <p className="text-sm tabular-nums text-ink-2">
                        {r.done}/{r.total} done
                      </p>
                    ) : null}
                    <p className="text-xs text-muted">
                      {r.status === "COMPLETED" ? `Completed ${formatDate(r.completedAt)}` : `Updated ${formatDate(r.updatedAt)}`}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
