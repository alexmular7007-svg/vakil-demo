import { Landmark } from "lucide-react";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Provenance + disclaimer shown with every bare-act page. */
export function SourceNotice({
  sourceUrl,
  retrievedOn,
  note,
  className,
  compact,
}: {
  sourceUrl?: string | null;
  retrievedOn?: string | null;
  note?: string | null;
  className?: string;
  compact?: boolean;
}) {
  return (
    <aside aria-label="Source and disclaimer" className={cn("rounded-lg border border-border bg-surface-2/60 p-4 text-[13px] leading-relaxed text-muted", className)}>
      <p className="flex items-start gap-2 text-ink-2">
        <Landmark className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          <strong className="font-semibold text-ink">Source: India Code (official).</strong> Bare act text; verify against the Gazette for legal use.
          {sourceUrl ? (
            <>
              {" "}
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
                View on India Code
              </a>
              {retrievedOn ? <span> (retrieved {retrievedOn})</span> : null}.
            </>
          ) : null}
        </span>
      </p>
      {note && !compact ? <p className="mt-2">{note}</p> : null}
      <p className="mt-2">{site.disclaimer}</p>
    </aside>
  );
}
