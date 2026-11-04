"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { ArrowRight, FilePen } from "lucide-react";
import { computeChequeBounce, NI_ACT_URL, RBI_CIRCULAR_URL, type ChequeStage, type StageState } from "@/lib/calculators/cheque-bounce";
import { formatDay, formatDayLong } from "@/lib/calculators/dates";
import { daysLeftText, SOON_WITHIN_DAYS } from "@/lib/calculators/status";
import { Card, IconTile } from "@/components/ui/display";
import { Field, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import {
  CalculatorDisclaimer,
  DateField,
  ExternalLink,
  NotesCard,
  ResultHero,
  ResultPlaceholder,
  StatusChip,
  WorkingCard,
  type ChipTone,
} from "./parts";
import { useTodayInIndia } from "./use-today";

function toneFor(state: StageState, daysLeft: number | null): ChipTone {
  switch (state) {
    case "ok":
      return "success";
    case "boundary":
      return "warning";
    case "late":
    case "premature":
      return "danger";
    case "waiting":
      return "info";
    case "pending":
      if (daysLeft === null) return "neutral";
      return daysLeft < 0 ? "danger" : daysLeft <= SOON_WITHIN_DAYS ? "warning" : "success";
    default:
      return "neutral";
  }
}

function heroLabel(state: StageState, daysLeft: number | null) {
  if (state === "ok") return "Within time";
  if (state === "boundary") return "Check the date";
  if (state === "late") return daysLeft !== null && daysLeft < 0 ? "Deadline passed" : "Out of time";
  if (state === "premature") return "Too early";
  if (daysLeft === null) return null;
  return daysLeft === 0 ? "Last day today" : daysLeft <= SOON_WITHIN_DAYS ? "Due soon" : "Within time";
}

export function ChequeBounceCalculator({ noticeTemplateHref }: { noticeTemplateHref?: string | null }) {
  const ids = useId();
  const today = useTodayInIndia();
  const [chequeDate, setChequeDate] = useState("");
  const [presentedOn, setPresentedOn] = useState("");
  const [infoReceivedOn, setInfoReceivedOn] = useState("");
  const [noticeSentOn, setNoticeSentOn] = useState("");
  const [noticeServedOn, setNoticeServedOn] = useState("");
  const [complaintFiledOn, setComplaintFiledOn] = useState("");
  const [validity, setValidity] = useState("");

  const result = useMemo(() => {
    if (!chequeDate) return null;
    return computeChequeBounce({
      chequeDate,
      presentedOn,
      infoReceivedOn,
      noticeSentOn,
      noticeServedOn,
      complaintFiledOn,
      validityMonths: validity ? Number(validity) : null,
      today,
    });
  }, [chequeDate, presentedOn, infoReceivedOn, noticeSentOn, noticeServedOn, complaintFiledOn, validity, today]);

  const headline = result?.ok ? result.headline : null;
  const headTone = headline ? toneFor(headline.state, headline.daysLeft) : "neutral";
  const headChip = headline ? heroLabel(headline.state, headline.daysLeft) : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
      <Card className="space-y-5 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField label="Date on the cheque" value={chequeDate} onChange={setChequeDate} required />
          <Field label="Validity" htmlFor={`${ids}-validity`} hint="Change only if a shorter validity is printed on the cheque.">
            <Select id={`${ids}-validity`} value={validity} onChange={(e) => setValidity(e.target.value)}>
              <option value="">RBI rule (3 months)</option>
              {[1, 2, 3, 4, 5, 6].map((m) => (
                <option key={m} value={m}>
                  Printed: {m} {m === 1 ? "month" : "months"}
                </option>
              ))}
            </Select>
          </Field>
          <DateField label="Presented to the bank on" value={presentedOn} onChange={setPresentedOn} />
          <DateField
            label="Dishonour information received on"
            value={infoReceivedOn}
            onChange={setInfoReceivedOn}
            hint="When your client received the bank's return memo or intimation."
          />
          <DateField label="Demand notice sent on" value={noticeSentOn} onChange={setNoticeSentOn} />
          <DateField label="Notice received by the drawer on" value={noticeServedOn} onChange={setNoticeServedOn} hint="The date of service you will rely on." />
          <DateField
            label="Complaint filed on"
            value={complaintFiledOn}
            onChange={setComplaintFiledOn}
            hint="Optional. To check a complaint already filed."
            className="sm:col-span-2"
          />
        </div>
        <p className="text-[13px] text-muted">Fill in what has happened so far. Each later step needs the date before it. Nothing you enter leaves this page.</p>
      </Card>

      <div className="space-y-4">
        {!result || !result.ok || !headline ? (
          <ResultPlaceholder
            title="Enter the date on the cheque to start"
            body="Then add each event as it happens: presentation, the bank's return memo, the notice and its service. You will see every deadline up to the complaint."
            errors={result && !result.ok ? result.errors : undefined}
          />
        ) : (
          <>
            <ResultHero
              eyebrow={headline.label}
              value={formatDayLong(headline.date)}
              chip={headChip ? <StatusChip tone={headTone}>{headChip}</StatusChip> : null}
              caption={headline.daysLeft !== null && today ? `${daysLeftText(headline.daysLeft)} as on ${formatDay(today)}` : undefined}
            >
              {headline.sub}
            </ResultHero>

            <Card className="p-5">
              <h2 className="mb-1 text-[15px] font-bold tracking-tight text-ink">Timeline</h2>
              <ol className="divide-y divide-border">
                {result.stages.map((s, i) => (
                  <StageRow key={s.key} stage={s} n={i + 1} />
                ))}
              </ol>
            </Card>

            {noticeTemplateHref ? (
              <Link
                href={noticeTemplateHref}
                className="group flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary/40"
              >
                <IconTile icon={FilePen} tone="teal" size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">Draft the Section 138 demand notice</span>
                  <span className="block text-[13px] text-muted">Bilingual template with the cheque and dishonour details</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            ) : null}

            <WorkingCard
              steps={result.steps}
              copyTitle="Cheque dishonour timeline (s. 138 and s. 142, Negotiable Instruments Act, 1881)"
              copyFooter="Check service of notice, holidays and the latest case law before filing."
            />
            <NotesCard notes={result.notes} />
          </>
        )}
        <CalculatorDisclaimer
          sources={
            <>
              Statute text: <ExternalLink href={NI_ACT_URL}>Negotiable Instruments Act, 1881 on India Code</ExternalLink> (s. 138 proviso, s. 142). Cheque validity:{" "}
              <ExternalLink href={RBI_CIRCULAR_URL}>RBI circular DBOD.AML BC.No.47/14.01.001/2011-12 of 4 November 2011</ExternalLink>. Counting: s. 3(35) and
              s. 9, General Clauses Act, 1897; Saketh India Ltd v India Securities Ltd (Supreme Court, 1999).
            </>
          }
        />
      </div>
    </div>
  );
}

function StageRow({ stage, n }: { stage: ChequeStage; n: number }) {
  const tone = toneFor(stage.state, stage.daysLeft);
  return (
    <li className="flex gap-3 py-4">
      <span
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular",
          stage.state === "unknown" ? "bg-surface-2 text-muted" : "bg-primary-soft text-primary",
        )}
        aria-hidden
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-ink">{stage.title}</p>
          <StatusChip tone={tone}>{stage.label}</StatusChip>
        </div>
        {stage.deadline || stage.actual ? (
          <p className="mt-0.5 text-[13px] text-muted tabular">
            {stage.deadline ? <>Last day {formatDay(stage.deadline)}</> : null}
            {stage.deadline && stage.actual ? " · " : null}
            {stage.actual ? <>Done {formatDay(stage.actual)}</> : null}
          </p>
        ) : null}
        <p className="mt-1 text-sm leading-relaxed text-ink-2 tabular">{stage.detail}</p>
        <p className="mt-1 text-xs font-medium text-accent">{stage.cite}</p>
      </div>
    </li>
  );
}
