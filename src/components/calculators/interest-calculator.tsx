"use client";

import { useId, useMemo, useState } from "react";
import { formatDay } from "@/lib/calculators/dates";
import { COMPOUNDING_LABEL, COMPOUNDING_REST, computeInterest, formatRupees, type Compounding, type InterestMethod } from "@/lib/calculators/interest";
import { Card, Table, Td, Th } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { CalculatorDisclaimer, ChoiceChips, DateField, ExternalLink, NotesCard, ResultHero, ResultPlaceholder, WorkingCard } from "./parts";

const ROW_PREVIEW = 36;
const CPC_34_URL = "https://indiacode.gov.in/handle/123456789/527391";

export function InterestCalculator() {
  const ids = useId();
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [method, setMethod] = useState<InterestMethod>("simple");
  const [compounding, setCompounding] = useState<Compounding>("annually");
  const [showAll, setShowAll] = useState(false);

  const result = useMemo(() => {
    if (!principal || !rate || !from || !to) return null;
    return computeInterest({ principal, ratePercent: rate, from, to, method, compounding });
  }, [principal, rate, from, to, method, compounding]);

  const rows = result?.ok ? (showAll ? result.rows : result.rows.slice(0, ROW_PREVIEW)) : [];
  const hidden = result?.ok ? result.rows.length - rows.length : 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
      <Card className="space-y-5 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Principal (₹)" htmlFor={`${ids}-p`} required>
            <Input
              id={`${ids}-p`}
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 2,50,000"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              className="tabular"
            />
          </Field>
          <Field label="Rate (% per year)" htmlFor={`${ids}-r`} hint="As the contract, decree or statute states." required>
            <Input id={`${ids}-r`} inputMode="decimal" autoComplete="off" placeholder="e.g. 9" value={rate} onChange={(e) => setRate(e.target.value)} className="tabular" />
          </Field>
          <DateField label="From" value={from} onChange={setFrom} required hint="This day is not counted." />
          <DateField label="To" value={to} onChange={setTo} required hint="This day is counted." />
        </div>
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-ink-2" aria-hidden>
            Interest type
          </p>
          <ChoiceChips
            label="Interest type"
            value={method}
            onChange={setMethod}
            options={[
              { value: "simple", label: "Simple" },
              { value: "compound", label: "Compound" },
            ]}
          />
        </div>
        {method === "compound" ? (
          <Field label="Compounded" htmlFor={`${ids}-c`}>
            <Select id={`${ids}-c`} value={compounding} onChange={(e) => setCompounding(e.target.value as Compounding)}>
              {(Object.keys(COMPOUNDING_LABEL) as Compounding[]).map((c) => (
                <option key={c} value={c}>
                  {COMPOUNDING_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </Card>

      <div className="space-y-4">
        {!result || !result.ok ? (
          <ResultPlaceholder
            title="Enter the principal, rate and dates"
            body="You will see the interest, the total due and a period-by-period breakdown you can copy into a plaint or execution application."
            errors={result && !result.ok ? result.errors : undefined}
          />
        ) : (
          <>
            <ResultHero
              eyebrow={result.method === "simple" ? "Simple interest" : `Compound interest · ${COMPOUNDING_REST[result.compounding!]} rests`}
              value={formatRupees(result.interest)}
              caption={`${result.days.toLocaleString("en-IN")} days at ${result.ratePercent}% a year`}
            >
              <dl className="grid grid-cols-2 gap-3 tabular">
                <div>
                  <dt className="text-xs">Principal</dt>
                  <dd className="font-semibold text-on-brand">{formatRupees(result.principal)}</dd>
                </div>
                <div>
                  <dt className="text-xs">Principal + interest</dt>
                  <dd className="font-semibold text-on-brand">{formatRupees(result.amount)}</dd>
                </div>
                {result.perDay !== null ? (
                  <div>
                    <dt className="text-xs">Per day</dt>
                    <dd className="font-semibold text-on-brand">{formatRupees(result.perDay)}</dd>
                  </div>
                ) : null}
                {result.effectiveRate !== null ? (
                  <div>
                    <dt className="text-xs">Effective annual rate</dt>
                    <dd className="font-semibold text-on-brand">{result.effectiveRate.toFixed(4)}%</dd>
                  </div>
                ) : null}
              </dl>
            </ResultHero>

            <section aria-labelledby={`${ids}-bd`} className="space-y-3">
              <h2 id={`${ids}-bd`} className="text-[15px] font-bold tracking-tight text-ink">
                Breakdown
              </h2>
              {/* Phones: stacked rows, no horizontal scrolling. */}
              <Card className="sm:hidden">
                <ol className="divide-y divide-border">
                  {rows.map((r) => (
                    <li key={r.index} className="flex min-h-14 items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink tabular">
                          {formatDay(r.from)} to {formatDay(r.to)}
                        </p>
                        <p className="text-[13px] text-muted tabular">
                          {r.days} days{r.part ? " · part period" : ""} · on {formatRupees(r.opening)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-ink tabular">{formatRupees(r.interest)}</p>
                        <p className="text-[13px] text-muted tabular">{formatRupees(r.closing)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
              <div className="hidden sm:block">
                <Table>
                  <thead>
                    <tr>
                      <Th>Period</Th>
                      <Th className="text-right">Days</Th>
                      <Th className="text-right">{result.method === "simple" ? "On principal" : "Opening"}</Th>
                      <Th className="text-right">Interest</Th>
                      <Th className="text-right">{result.method === "simple" ? "Total due" : "Closing"}</Th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {rows.map((r) => (
                      <tr key={r.index}>
                        <Td>
                          {formatDay(r.from)} to {formatDay(r.to)}
                          {r.part ? <span className="block text-xs text-muted">Part period, by days</span> : null}
                        </Td>
                        <Td className="text-right">{r.days}</Td>
                        <Td className="text-right">{formatRupees(r.opening)}</Td>
                        <Td className="text-right font-semibold text-ink">{formatRupees(r.interest)}</Td>
                        <Td className="text-right">{formatRupees(r.closing)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              {hidden > 0 ? (
                <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setShowAll(true)}>
                  Show all {result.rows.length} periods
                </Button>
              ) : null}
            </section>

            <WorkingCard
              steps={result.steps}
              copyTitle={`Interest on ${formatRupees(result.principal)} at ${result.ratePercent}% a year from ${formatDay(result.from)} to ${formatDay(result.to)}`}
            />
            <NotesCard notes={result.notes} title="Notes" />
          </>
        )}
        <CalculatorDisclaimer
          sources={
            <>
              Arithmetic only: no rate is suggested. Days run from the start date (excluded) to the end date (included); simple interest uses a 365-day year.
              Section 34 text: <ExternalLink href={CPC_34_URL}>Code of Civil Procedure, 1908 on India Code</ExternalLink>.
            </>
          }
        />
      </div>
    </div>
  );
}
