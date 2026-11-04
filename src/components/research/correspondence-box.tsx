import Link from "next/link";
import { ArrowLeftRight, ArrowRight, CalendarClock } from "lucide-react";
import { ACT_INFO, pairFor, type ActId } from "@/lib/corpus/acts";
import { Badge } from "@/components/ui/display";
import { cn } from "@/lib/utils";

export type CorrespondenceMatch = {
  actId: ActId;
  sectionNo: string;
  heading: string | null;
  details: string[];
  changed: boolean;
};

const DATE_RULE: Record<string, string> = {
  IPC: "Governs offences committed before 1 July 2024.",
  BNS: "Governs offences committed on or after 1 July 2024.",
  CRPC: "Governs proceedings already pending on 1 July 2024 (BNSS s. 531).",
  BNSS: "Governs proceedings begun on or after 1 July 2024.",
  IEA: "Governs proceedings already pending on 1 July 2024 (BSA s. 170).",
  BSA: "Governs proceedings begun on or after 1 July 2024.",
};

/** "Corresponding old/new provision" box, from the official NCRB correspondence table. */
export function CorrespondenceBox({
  fromAct,
  sectionNo,
  matches,
  isNew,
  omitted,
  sourceUrl,
  hrefFor,
  className,
}: {
  fromAct: ActId;
  sectionNo: string;
  matches: CorrespondenceMatch[];
  isNew?: boolean;
  omitted?: { ref: string; text: string }[];
  sourceUrl?: string | null;
  hrefFor: (actId: ActId, sectionNo: string) => string;
  className?: string;
}) {
  const pair = pairFor(fromAct);
  if (!pair) return null;
  const isOld = pair.old === fromAct;
  const other = ACT_INFO[isOld ? pair.new : pair.old];
  const from = ACT_INFO[fromAct];

  return (
    <section aria-labelledby="corr-heading" className={cn("rounded-lg border border-primary/25 bg-primary-soft/50 p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="corr-heading" className="flex items-center gap-2 font-serif text-lg font-semibold text-ink">
          <ArrowLeftRight className="size-4 text-primary" aria-hidden />
          {isOld ? `Corresponding provision in the ${other.abbr}` : `Corresponding provision in the old ${other.abbr}`}
        </h2>
        {DATE_RULE[fromAct] ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <CalendarClock className="size-3.5" aria-hidden /> {from.abbr}: {DATE_RULE[fromAct]}
          </span>
        ) : null}
      </div>

      {matches.length > 0 ? (
        <ul className="mt-3 divide-y divide-primary/15">
          {matches.map((m) => (
            <li key={`${m.actId}-${m.sectionNo}`} className="py-2.5">
              <Link href={hrefFor(m.actId, m.sectionNo)} className="group flex items-start gap-2 rounded-md text-ink hover:text-primary">
                <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-sm font-semibold text-primary shadow-sm">
                  {ACT_INFO[m.actId].abbr} s. {m.sectionNo}
                </span>
                <span className="min-w-0 flex-1 text-sm leading-6">{m.heading ?? "Heading not in corpus"}</span>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted group-hover:text-primary" aria-hidden />
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2 pl-0.5 text-xs text-muted">
                {m.details.slice(0, 3).map((d) => (
                  <span key={d}>{d}</span>
                ))}
                {m.changed ? <Badge tone="warning">Changed in the new code</Badge> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-2">
          {isNew
            ? `New provision: the NCRB table lists no counterpart in the ${other.abbr}.`
            : omitted && omitted.length
              ? `Not carried into the ${other.abbr}: the NCRB table marks ${from.abbr} s. ${sectionNo}${omitted.some((o) => o.ref !== sectionNo) ? " (in part)" : ""} as deleted.`
              : `The NCRB table lists no counterpart for ${from.abbr} s. ${sectionNo}. Check the bare act and the chapter on either side.`}
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted">
        Source: NCRB SANKALAN correspondence table (National Crime Records Bureau, Ministry of Home Affairs).{" "}
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
            Official table
          </a>
        ) : null}
        {sourceUrl ? ". " : ""}A correspondence is a starting point, not equivalence: wording and punishments often changed.
      </p>
    </section>
  );
}
