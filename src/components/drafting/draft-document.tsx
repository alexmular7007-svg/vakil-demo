import { humanizePlaceholder } from "@/lib/drafting/fill";
import { isShortLineBlock, parseDraft, type Block, type Line } from "@/lib/drafting/markup";
import { cn } from "@/lib/utils";

/**
 * Renders draft markup as a formatted legal document. No hooks, so it works in
 * server components (print view, public pages) and client components (editor).
 */
export function DraftDocument({
  body,
  language = "en",
  variant = "preview",
  labels,
  blocks: given,
  className,
}: {
  body?: string;
  language?: "en" | "hi";
  variant?: "preview" | "print";
  /** Show placeholders by these labels instead of their token names. */
  labels?: Record<string, string>;
  /** Pre-parsed blocks (e.g. an excerpt). */
  blocks?: Block[];
  className?: string;
}) {
  const blocks = given ?? parseDraft(body ?? "");
  const print = variant === "print";
  if (blocks.length === 0) {
    return <p className="text-sm text-muted italic">Nothing to preview yet. Start typing in the editor.</p>;
  }
  return (
    <div
      lang={language === "hi" ? "hi" : "en-IN"}
      className={cn(
        "draft-document font-serif break-words text-ink",
        print ? "text-[12pt] leading-[1.6]" : "text-[15px] leading-[1.75]",
        language === "hi" && "leading-[1.9]",
        className,
      )}
    >
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} labels={labels} print={print} />
      ))}
    </div>
  );
}

function BlockView({ block, labels, print }: { block: Block; labels?: Record<string, string>; print: boolean }) {
  switch (block.kind) {
    case "separator":
      return <div aria-hidden className="h-[1em]" />;
    case "pagebreak":
      return (
        <div className="draft-pagebreak my-6 flex items-center gap-3 text-xs text-muted" role="separator" aria-label="Page break">
          <span className="h-px flex-1 border-t border-dashed border-border-strong" />
          <span className="no-print font-sans">Page break</span>
          <span className="h-px flex-1 border-t border-dashed border-border-strong" />
        </div>
      );
    case "title":
      return (
        <p className={cn("my-4 text-center font-bold tracking-wide", print ? "text-[13pt]" : "text-[1.05em]")}>
          <Lines lines={block.lines} labels={labels} />
        </p>
      );
    case "heading":
      return (
        <p className="mt-5 mb-3 text-center font-bold underline decoration-1 underline-offset-4">
          <Lines lines={block.lines} labels={labels} />
        </p>
      );
    case "subheading":
      return (
        <p className="mt-4 mb-2 font-bold">
          <Lines lines={block.lines} labels={labels} />
        </p>
      );
    case "center":
      return (
        <p className="my-2 text-center">
          <Lines lines={block.lines} labels={labels} />
        </p>
      );
    case "right":
      return (
        <p className="my-3 ml-auto w-fit max-w-full text-right">
          <Lines lines={block.lines} labels={labels} />
        </p>
      );
    case "para":
      return (
        <p className={cn("my-3", isShortLineBlock(block.lines) ? "text-left" : "text-justify [hyphens:auto]")}>
          <Lines lines={block.lines} labels={labels} />
        </p>
      );
  }
}

function Lines({ lines, labels }: { lines: Line[]; labels?: Record<string, string> }) {
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          {line.map((run, j) => {
            if (run.placeholder) {
              const label = labels?.[run.placeholder] ?? humanizePlaceholder(run.placeholder);
              return (
                <mark
                  key={j}
                  title={`To fill: ${label}`}
                  className={cn(
                    "draft-placeholder rounded-sm bg-warning-soft px-1 font-sans text-[0.85em] font-medium text-warning",
                    run.bold && "font-bold",
                  )}
                >
                  [{label}]
                </mark>
              );
            }
            return run.bold ? (
              <strong key={j} className="font-bold">
                {run.text}
              </strong>
            ) : (
              <span key={j}>{run.text}</span>
            );
          })}
        </span>
      ))}
    </>
  );
}
