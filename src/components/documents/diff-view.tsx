import { Badge } from "@/components/ui/display";
import type { DiffHunk, DiffStats } from "@/lib/documents/diff";
import { cn } from "@/lib/utils";

export function DiffStatsRow({ stats }: { stats: DiffStats }) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <Badge tone="success">+{stats.added.toLocaleString("en-IN")} added</Badge>
      <Badge tone="danger">−{stats.removed.toLocaleString("en-IN")} removed</Badge>
      <Badge>{stats.unchanged.toLocaleString("en-IN")} unchanged</Badge>
    </div>
  );
}

/** Unified line diff: removed lines from this document, added lines from the other. */
export function DiffView({ hunks, leftName, rightName }: { hunks: DiffHunk[]; leftName: string; rightName: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border bg-surface-2 px-3 py-2 text-xs text-muted">
        <span>
          <span className="font-semibold text-danger">−</span> only in <span className="text-ink">{leftName}</span>
        </span>
        <span>
          <span className="font-semibold text-success">+</span> only in <span className="text-ink">{rightName}</span>
        </span>
      </div>
      <div className="max-h-[65vh] overflow-y-auto scrollbar-thin text-sm">
        {hunks.map((h, i) =>
          h.kind === "skip" ? (
            <div key={i} className="border-y border-border bg-surface-2/60 px-3 py-1 text-center text-xs text-muted">
              ⋯ {h.count.toLocaleString("en-IN")} unchanged line{h.count === 1 ? "" : "s"}
            </div>
          ) : (
            <div key={i}>
              {h.lines.map((l, j) => (
                <div
                  key={j}
                  className={cn(
                    "grid grid-cols-[2.75rem_2.75rem_1rem_minmax(0,1fr)] gap-1 px-2 py-0.5 leading-relaxed",
                    l.op === "add" && "bg-success-soft",
                    l.op === "remove" && "bg-danger-soft",
                  )}
                >
                  <span className="text-right text-xs text-muted tabular-nums select-none">{l.a ?? ""}</span>
                  <span className="text-right text-xs text-muted tabular-nums select-none">{l.b ?? ""}</span>
                  <span
                    aria-hidden
                    className={cn("text-center font-semibold select-none", l.op === "add" ? "text-success" : l.op === "remove" ? "text-danger" : "text-muted")}
                  >
                    {l.op === "add" ? "+" : l.op === "remove" ? "−" : ""}
                  </span>
                  <span className={cn("break-words whitespace-pre-wrap", l.op === "equal" ? "text-ink-2" : "text-ink")}>
                    {l.op === "add" ? <span className="sr-only">Added: </span> : l.op === "remove" ? <span className="sr-only">Removed: </span> : null}
                    {l.text}
                  </span>
                </div>
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
