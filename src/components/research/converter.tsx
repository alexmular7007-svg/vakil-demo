"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Info, Scale, Search } from "lucide-react";
import { ACT_INFO, CODE_PAIRS, type ActId, type CodeFamily } from "@/lib/corpus/acts";
import { dateQuestion, governingCode, parseIndianDate } from "@/lib/corpus/rules";
import type { ConverterData } from "@/lib/corpus/data";
import { Badge } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type Direction = { from: ActId; to: ActId; family: CodeFamily; label: string };

const DIRECTIONS: Direction[] = CODE_PAIRS.flatMap((p) => [
  { from: p.old, to: p.new, family: p.family, label: `${ACT_INFO[p.old].abbr} → ${ACT_INFO[p.new].abbr}` },
  { from: p.new, to: p.old, family: p.family, label: `${ACT_INFO[p.new].abbr} → ${ACT_INFO[p.old].abbr}` },
]);

const QUICK: Partial<Record<ActId, string[]>> = {
  IPC: ["302", "304B", "307", "376", "420", "498A", "120B", "506"],
  BNS: ["103", "80", "109", "64", "318", "85", "61", "351"],
  CRPC: ["41A", "125", "154", "161", "164", "438", "439", "482"],
  BNSS: ["35", "144", "173", "180", "183", "482", "483", "528"],
  IEA: ["3", "25", "27", "32", "45", "65B", "114A"],
  BSA: ["2", "23", "26", "39", "63", "120"],
};

const SECTION_RE = /^(?:s(?:ec(?:tion)?)?\.?\s*)?(\d{1,3}[A-Za-z]{0,3})(?:\s*\(.*)?$/i;

export function Converter({ data, defaultFrom = "IPC", linkBase = "/law" }: { data: ConverterData; defaultFrom?: ActId; linkBase?: string }) {
  const ids = useId();
  const [dirIdx, setDirIdx] = useState(() => Math.max(0, DIRECTIONS.findIndex((d) => d.from === defaultFrom)));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const dir = DIRECTIONS[dirIdx];
  const headings = useMemo(() => data.headings[dir.from] ?? {}, [data.headings, dir.from]);
  const toHeadings = useMemo(() => data.headings[dir.to] ?? {}, [data.headings, dir.to]);
  const table = data.pairs.find((p) => p.oldAct === (dir.family === "substantive" ? "IPC" : dir.family === "procedure" ? "CRPC" : "IEA"));
  const isOldSide = table?.oldAct === dir.from;

  const parsedNo = useMemo(() => {
    const m = query.trim().match(SECTION_RE);
    return m ? m[1].toUpperCase().replace(/^0+/, "") : null;
  }, [query]);

  const sectionNo = selected ?? (parsedNo && headings[parsedNo] ? parsedNo : null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || parsedNo || q.length < 3) return [];
    return Object.entries(headings)
      .filter(([, h]) => h.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, parsedNo, headings]);

  const result = useMemo(() => {
    if (!sectionNo || !table) return null;
    const rows = table.rows.filter((r) => (isOldSide ? r[0] === sectionNo : r[1] === sectionNo));
    const matches = rows.map((r) => {
      const no = isOldSide ? r[1] : r[0];
      return { no, heading: toHeadings[no] ?? null, changed: r[2] === 1, details: r[3] };
    });
    const isNew = !isOldSide && table.newProvisions.some((p) => p.split("(")[0] === sectionNo);
    const omitted = isOldSide && table.deleted.includes(sectionNo);
    return { matches, isNew, omitted };
  }, [sectionNo, table, isOldSide, toHeadings]);

  const gov = useMemo(() => {
    const d = parseIndianDate(date);
    return d ? governingCode(dir.family, d) : null;
  }, [date, dir.family]);

  const href = (act: ActId, no: string) => `${linkBase}/${ACT_INFO[act].slug}/${no}`;
  const notFound = query.trim() && parsedNo && !headings[parsedNo];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="space-y-5 rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <Field label="Convert" htmlFor={`${ids}-dir`}>
          <Select
            id={`${ids}-dir`}
            value={dirIdx}
            onChange={(e) => {
              setDirIdx(Number(e.target.value));
              setSelected(null);
              setQuery("");
            }}
          >
            {DIRECTIONS.map((d, i) => (
              <option key={d.label} value={i}>
                {d.label} ({ACT_INFO[d.from].shortTitle} to {ACT_INFO[d.to].shortTitle})
              </option>
            ))}
          </Select>
        </Field>

        <Field label={`${ACT_INFO[dir.from].abbr} section`} htmlFor={`${ids}-q`} hint="A number such as 302 or 498A, or words from the heading such as “cheating”.">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              id={`${ids}-q`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder={dir.from === "IPC" ? "e.g. 302" : dir.from === "BNS" ? "e.g. 103" : "Section number or heading"}
              autoComplete="off"
              inputMode="text"
              className="pl-9"
            />
          </div>
        </Field>

        {suggestions.length > 0 ? (
          <ul className="-mt-2 overflow-hidden rounded-lg border border-border" aria-label="Matching sections">
            {suggestions.map(([no, h]) => (
              <li key={no}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(no);
                    setQuery(no);
                  }}
                  className="flex min-h-11 w-full items-start gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-2"
                >
                  <span className="shrink-0 font-semibold text-primary">s. {no}</span>
                  <span className="text-ink-2">{h}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Common sections</p>
          <div className="flex flex-wrap gap-2">
            {(QUICK[dir.from] ?? []).filter((n) => headings[n]).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setSelected(n);
                  setQuery(n);
                }}
                className={cn(
                  "min-h-10 rounded-full border px-3 text-sm font-medium transition-colors",
                  sectionNo === n ? "border-primary bg-primary text-primary-ink" : "border-border-strong bg-surface text-ink-2 hover:border-primary hover:text-primary",
                )}
                aria-pressed={sectionNo === n}
              >
                {ACT_INFO[dir.from].abbr} {n}
              </button>
            ))}
          </div>
        </div>

        <Field label={dateQuestion(dir.family)} htmlFor={`${ids}-date`} hint="Optional. Tells you which code governs on that date.">
          <Input id={`${ids}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} max="2100-12-31" min="1860-01-01" />
        </Field>
      </div>

      <div aria-live="polite" className="space-y-4">
        {gov ? (
          <div className={cn("rounded-xl border p-4 sm:p-5", gov.isOldCode ? "border-warning/30 bg-warning-soft" : "border-primary/25 bg-primary-soft/60")}>
            <p className="flex items-center gap-2 font-semibold text-ink">
              <CalendarClock className={cn("size-4", gov.isOldCode ? "text-warning" : "text-primary")} aria-hidden />
              {gov.headline}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{gov.reason}</p>
            <Link href={href(gov.authority.actId, gov.authority.sectionNo)} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Read {gov.authority.label} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        ) : null}

        {!sectionNo ? (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface/60 p-6 text-center">
            <span className="mb-3 inline-flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Scale className="size-5" aria-hidden />
            </span>
            <p className="font-medium text-ink">{notFound ? `${ACT_INFO[dir.from].abbr} s. ${parsedNo} is not in the corpus` : "Pick a section to see its counterpart"}</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              {notFound ? "Check the number, including any letter (for example 304A or 376D)." : "Correspondence comes from the official NCRB table. Each result links to the full bare-act text."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">{ACT_INFO[dir.from].title}</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-ink">
              <Link href={href(dir.from, sectionNo)} className="hover:text-primary">
                Section {sectionNo}: {headings[sectionNo]}
              </Link>
            </h2>

            <div className="mt-5">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Corresponds to ({ACT_INFO[dir.to].shortTitle})</p>
              {result && result.matches.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {result.matches.map((m) => (
                    <li key={m.no}>
                      <Link
                        href={href(dir.to, m.no)}
                        className="group flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary hover:bg-primary-soft/40"
                      >
                        <span className="shrink-0 rounded-md bg-primary px-2 py-1 text-sm font-semibold text-primary-ink">
                          {ACT_INFO[dir.to].abbr} {m.no}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink">{m.heading ?? "Heading not in corpus"}</span>
                          <span className="mt-0.5 block text-xs text-muted">{m.details}</span>
                        </span>
                        {m.changed ? <Badge tone="warning" className="shrink-0">Changed</Badge> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 rounded-lg bg-surface-2 p-3 text-sm text-ink-2">
                  {result?.isNew
                    ? `New provision. The NCRB table lists no counterpart in the ${ACT_INFO[dir.to].abbr}.`
                    : result?.omitted
                      ? `The NCRB table marks this provision as not carried into the ${ACT_INFO[dir.to].abbr} (wholly or in part).`
                      : `The NCRB table lists no counterpart for this section.`}
                </p>
              )}
            </div>

            <p className="mt-5 flex gap-2 text-xs leading-relaxed text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Suggested by the official NCRB SANKALAN correspondence table
                {table ? (
                  <>
                    {" "}
                    (
                    <a href={table.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      source
                    </a>
                    )
                  </>
                ) : null}
                . A correspondence is a starting point, not equivalence: read both provisions before relying on it.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
