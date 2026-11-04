"use client";

import { useId, useMemo, useState } from "react";
import { CalendarX2, Plus, Trash2 } from "lucide-react";
import { formatDay, formatDayLong, normaliseRanges, weekday } from "@/lib/calculators/dates";
import { computeLimitation } from "@/lib/calculators/limitation";
import {
  getLimitationArticle,
  KIND_LABEL,
  LIMITATION_ARTICLES,
  LIMITATION_RETRIEVED_ON,
  LIMITATION_SCHEDULE_URL,
  LIMITATION_SECTION_URLS,
  type ProceedingKind,
} from "@/lib/calculators/limitation-articles";
import { daysLeftText, urgencyLabel, urgencyTone } from "@/lib/calculators/status";
import { Card } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import {
  CalculatorDisclaimer,
  CheckRow,
  DateField,
  ExternalLink,
  NotesCard,
  ResultHero,
  ResultPlaceholder,
  StatusChip,
  WorkingCard,
} from "./parts";
import { useTodayInIndia } from "./use-today";

type ClosureRow = { key: number; from: string; to: string };

const KINDS: ProceedingKind[] = ["suit", "appeal", "application"];

export function LimitationCalculator() {
  const ids = useId();
  const today = useTodayInIndia();
  const [articleId, setArticleId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [copyAppliedOn, setCopyAppliedOn] = useState("");
  const [copyReadyOn, setCopyReadyOn] = useState("");
  const [sundays, setSundays] = useState(false);
  const [saturdays, setSaturdays] = useState(false);
  const [rows, setRows] = useState<ClosureRow[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const article = getLimitationArticle(articleId);
  const closures = useMemo(() => ({ sundays, saturdays, ranges: normaliseRanges(rows) }), [sundays, saturdays, rows]);
  const hasClosures = sundays || saturdays || closures.ranges.length > 0;

  const result = useMemo(() => {
    if (!articleId || !startDate) return null;
    return computeLimitation({
      articleId,
      startDate,
      copyAppliedOn: article?.copyExclusion ? copyAppliedOn : null,
      copyReadyOn: article?.copyExclusion ? copyReadyOn : null,
      closures: hasClosures ? closures : null,
      today,
    });
  }, [articleId, startDate, copyAppliedOn, copyReadyOn, closures, hasClosures, today, article]);

  const updateRow = (key: number, patch: Partial<ClosureRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
      {/* ------------------------------- Inputs ------------------------------- */}
      <Card className="space-y-6 p-4 sm:p-6">
        <Field label="Article of the Schedule" htmlFor={`${ids}-art`} hint="Choosing the article is a legal judgement. Read its text below before relying on the date." required>
          <Select id={`${ids}-art`} value={articleId} onChange={(e) => setArticleId(e.target.value)}>
            <option value="">Choose an article</option>
            {KINDS.map((k) => (
              <optgroup key={k} label={KIND_LABEL[k]}>
                {LIMITATION_ARTICLES.filter((a) => a.kind === k).map((a) => (
                  <option key={a.id} value={a.id}>
                    Art. {a.article}: {a.title} ({a.periodText.replace(".", "").toLowerCase()})
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>

        {article ? (
          <div className="rounded-lg border border-border bg-surface-2/60 p-4">
            <p className="text-[11px] font-bold tracking-[0.14em] text-accent uppercase">
              <span className="normal-case">Article {article.article}</span> · {article.part}
            </p>
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="text-xs font-semibold text-muted">Description</dt>
                <dd className="text-ink">{article.description}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted">Period of limitation</dt>
                <dd className="font-semibold text-ink">{article.periodText}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted">Time from which period begins to run</dt>
                <dd className="text-ink">{article.runsFrom}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs">
              <ExternalLink href={LIMITATION_SCHEDULE_URL}>Schedule on India Code</ExternalLink>
            </p>
          </div>
        ) : null}

        <DateField
          label={article ? article.startLabel : "Date from which time runs"}
          value={startDate}
          onChange={setStartDate}
          required
          hint="The event in the third column of the article. That day itself is excluded (s. 12(1))."
        />

        {article?.copyExclusion ? (
          <fieldset className="space-y-3">
            <legend className="text-[13px] font-semibold text-ink-2">Certified copy (s. 12(2) and (3))</legend>
            <p className="text-[13px] text-muted">Optional. The time requisite for obtaining a copy of the decree, order or judgment is excluded.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField label="Copy applied for on" value={copyAppliedOn} onChange={setCopyAppliedOn} />
              <DateField label="Copy ready on" value={copyReadyOn} onChange={setCopyReadyOn} hint="The date noted on the copy." />
            </div>
          </fieldset>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-[13px] font-semibold text-ink-2">Court closures (s. 4)</legend>
          <p className="text-[13px] text-muted">
            If the period ends on a day the court is closed, you may file on the day it reopens. Add your court&apos;s holidays and vacation near the last day.
          </p>
          <CheckRow label="Court closed on Sundays" checked={sundays} onChange={setSundays} />
          <CheckRow label="Court closed on Saturdays" checked={saturdays} onChange={setSaturdays} />
          {rows.length > 0 ? (
            <ul className="space-y-3 pt-1">
              {rows.map((r, i) => (
                <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                  <DateField label={`Closed from${rows.length > 1 ? ` (${i + 1})` : ""}`} value={r.from} onChange={(v) => updateRow(r.key, { from: v })} />
                  <DateField label="To (optional)" value={r.to} onChange={(v) => updateRow(r.key, { to: v })} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove closure ${i + 1}`}
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-9"
            onClick={() => {
              setRows((rs) => [...rs, { key: nextKey, from: "", to: "" }]);
              setNextKey((k) => k + 1);
            }}
          >
            <Plus aria-hidden /> Add a holiday or vacation
          </Button>
        </fieldset>
      </Card>

      {/* ------------------------------- Result ------------------------------- */}
      <div className="space-y-4">
        {!result || !result.ok ? (
          <ResultPlaceholder
            title="Choose an article and enter the date"
            body="You will see the last day to file, the days left, and each step of the working with the section it comes from."
            errors={result && !result.ok ? result.errors : undefined}
          />
        ) : (
          <>
            <ResultHero
              eyebrow={
                <>
                  Last day to file · <span className="normal-case">Art. {result.article.article}</span>
                </>
              }
              value={formatDayLong(result.lastDate)}
              chip={result.urgency ? <StatusChip tone={urgencyTone[result.urgency]}>{urgencyLabel(result.urgency)}</StatusChip> : null}
              caption={result.daysLeft !== null && result.today ? `${daysLeftText(result.daysLeft)} as on ${formatDay(result.today)}` : result.article.periodText}
            >
              <ul className="space-y-1">
                {result.copyDaysExcluded > 0 ? <li className="tabular">Includes {result.copyDaysExcluded} days of certified-copy time (s. 12(2)).</li> : null}
                {result.s4 ? (
                  <li className="tabular">
                    The period ends on {formatDay(result.prescribedEnd)}, a day the court is closed; filing on the reopening day is allowed (s. 4).
                  </li>
                ) : null}
                {!result.s4 && ((weekday(result.lastDate) === 0 && !sundays) || (weekday(result.lastDate) === 6 && !saturdays)) ? (
                  <li>
                    This is a {weekday(result.lastDate) === 0 ? "Sunday" : "Saturday"}. If your court is closed that day, tick it under court closures to apply
                    s. 4.
                  </li>
                ) : null}
                <li className="font-semibold text-on-brand">{result.disclaimer}</li>
              </ul>
            </ResultHero>
            <WorkingCard
              steps={result.steps}
              copyTitle={`Limitation: Article ${result.article.article}, Limitation Act, 1963. Last day: ${formatDayLong(result.lastDate)}`}
              copyFooter={result.disclaimer}
            />
            <NotesCard notes={result.notes} />
          </>
        )}
        {articleId && startDate && result?.ok ? null : (
          <p className="flex items-start gap-2 text-[13px] text-muted">
            <CalendarX2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            Dates are calendar dates in India (IST). Nothing you enter leaves this page.
          </p>
        )}
        <CalculatorDisclaimer
          extra={result?.ok ? undefined : "Special laws may prescribe different periods; verify before filing."}
          sources={
            <>
              Periods and starting points from the Schedule to the Limitation Act, 1963, on India Code (retrieved {formatDay(LIMITATION_RETRIEVED_ON)}):{" "}
              <ExternalLink href={LIMITATION_SCHEDULE_URL}>Schedule</ExternalLink>, <ExternalLink href={LIMITATION_SECTION_URLS["4"]}>s. 4</ExternalLink>,{" "}
              <ExternalLink href={LIMITATION_SECTION_URLS["5"]}>s. 5</ExternalLink>, <ExternalLink href={LIMITATION_SECTION_URLS["12"]}>s. 12</ExternalLink>,{" "}
              <ExternalLink href={LIMITATION_SECTION_URLS["29"]}>s. 29</ExternalLink>. Months and years per s. 3(35) and (66), General Clauses Act, 1897.
            </>
          }
        />
      </div>
    </div>
  );
}
