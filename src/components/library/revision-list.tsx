import Link from "next/link";
import { ChevronDown, FilePen, FilePlus2, FileX2 } from "lucide-react";
import { revisionLines } from "@/lib/corpus/act-text";
import { diffLines, toHunks } from "@/lib/documents/diff";
import { Badge, Card, IconTile } from "@/components/ui/display";
import { DiffStatsRow, DiffView } from "@/components/documents/diff-view";
import { formatDateTime } from "@/lib/utils";

export type RevisionItem = {
  id: string;
  actId: string;
  sectionNo: string;
  beforeHeading: string | null;
  beforeText: string | null;
  afterHeading: string | null;
  afterText: string | null;
  source: string;
  sourceRef: string | null;
  who: string;
  note: string | null;
  createdAt: Date;
};

function lines(heading: string | null, text: string | null) {
  if (heading === null && text === null) return [];
  return [`Heading: ${heading ?? ""}`, ...revisionLines(text)];
}

/** Statute text changes, newest first, each with a collapsible before/after diff. */
export function RevisionList({ items, showAct = true }: { items: RevisionItem[]; showAct?: boolean }) {
  return (
    <Card>
      <ol className="divide-y divide-border">
        {items.map((r) => {
          const kind = r.beforeText === null ? "added" : r.afterText === null ? "removed" : "changed";
          const diff = diffLines(lines(r.beforeHeading, r.beforeText), lines(r.afterHeading, r.afterText));
          const heading = r.afterHeading ?? r.beforeHeading ?? "";
          return (
            <li key={r.id} className="px-3 py-3 sm:px-4">
              <div className="flex items-start gap-3">
                <IconTile
                  icon={kind === "added" ? FilePlus2 : kind === "removed" ? FileX2 : FilePen}
                  size="sm"
                  tone={kind === "added" ? "green" : kind === "removed" ? "maroon" : "gold"}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-ink">
                    {showAct ? (
                      <Link href={`/admin/library/acts/${r.actId}`} className="hover:text-primary">
                        <span className="font-mono">{r.actId}</span> s. <span className="tabular">{r.sectionNo}</span>
                      </Link>
                    ) : (
                      <>
                        s. <span className="tabular">{r.sectionNo}</span>
                      </>
                    )}
                    <span className="font-normal text-ink-2"> {heading}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                    <Badge tone={kind === "added" ? "success" : kind === "removed" ? "danger" : "warning"} dot>
                      {kind === "added" ? "Added" : kind === "removed" ? "Removed" : "Changed"}
                    </Badge>
                    <Badge tone={r.source === "india_code" ? "info" : "accent"}>{r.source === "india_code" ? "India Code sync" : "Admin edit"}</Badge>
                    <span>{r.who}</span>
                    <span className="tabular">{formatDateTime(r.createdAt)}</span>
                  </div>
                  {r.note ? <p className="mt-1.5 text-sm text-ink-2">{r.note}</p> : null}
                  {r.sourceRef ? (
                    /^https?:\/\//.test(r.sourceRef) ? (
                      <a href={r.sourceRef} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block max-w-full truncate text-[13px] text-primary hover:underline">
                        {r.sourceRef}
                      </a>
                    ) : (
                      <p className="mt-1 truncate text-[13px] text-muted">{r.sourceRef}</p>
                    )
                  ) : null}
                  <details className="group mt-2">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-primary sm:min-h-9 [&::-webkit-details-marker]:hidden">
                      <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                      <span className="group-open:hidden">Show before and after</span>
                      <span className="hidden group-open:inline">Hide before and after</span>
                    </summary>
                    <div className="mt-2 space-y-2">
                      <DiffStatsRow stats={diff.stats} />
                      {diff.ok ? (
                        <DiffView hunks={toHunks(diff.lines, 2)} leftName="before" rightName="after" />
                      ) : (
                        <p className="text-sm text-muted">The two versions are too different to compare line by line.</p>
                      )}
                    </div>
                  </details>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
