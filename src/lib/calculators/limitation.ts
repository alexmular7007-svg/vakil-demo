// Limitation Act, 1963: last date for a suit, appeal or application.
//
// What is computed (all from the Act's text, India Code):
//   s. 12(1)  the day from which the period is reckoned is excluded;
//   s. 12(2)  for appeals, leave to appeal, revision and review: the day of the
//             judgment and the time requisite for obtaining a certified copy are
//             excluded (s. 12(3): copy of the judgment too);
//   s. 4      if the period expires on a day the court is closed, the filing may
//             be made on the day it reopens (closures are entered by the user).
// What is only flagged, never computed: s. 5 (condonation), s. 14 (time in a
// court without jurisdiction), s. 18 (acknowledgment), s. 19 (part payment) and
// s. 29(2) (special and local laws).

import {
  addDays,
  addPeriod,
  closureReason,
  describePeriod,
  diffDays,
  formatDay,
  formatDayLong,
  isSupportedDate,
  maxDate,
  nextOpenDay,
  parseIsoDate,
  plural,
  weekdayName,
  type CourtClosures,
  type IsoDate,
} from "./dates";
import { getLimitationArticle, type LimitationArticle } from "./limitation-articles";
import { daysLeftText, urgencyOf, type Urgency } from "./status";

export const SPECIAL_LAW_DISCLAIMER = "Special laws may prescribe different periods; verify before filing.";

/** Longest certified-copy wait we accept, to catch typing mistakes. */
const MAX_COPY_DAYS = 3660;

export type WorkingStep = { title: string; detail?: string; cite?: string };
export type CalcNote = { tone: "info" | "warning" | "danger"; title: string; body: string; cite?: string };

export type LimitationInput = {
  articleId: string;
  /** The date in column 3 of the Schedule ("time from which period begins to run"). */
  startDate: string;
  copyAppliedOn?: string | null;
  copyReadyOn?: string | null;
  closures?: CourtClosures | null;
  /** Today's date in IST; omit to skip the days-left figure. */
  today?: string | null;
};

export type LimitationResult =
  | { ok: false; errors: string[] }
  | {
      ok: true;
      article: LimitationArticle;
      startDate: IsoDate;
      /** First day counted (start + 1, s. 12(1)). */
      countFrom: IsoDate;
      /** End of the period before any exclusion. */
      periodEnd: IsoDate;
      /** Copy days excluded under s. 12(2)/(3) (0 when none or when applied too late). */
      copyDaysExcluded: number;
      /** End of the prescribed period after exclusions, before s. 4. */
      prescribedEnd: IsoDate;
      /** Last date to file, after s. 4 if the court is closed on prescribedEnd. */
      lastDate: IsoDate;
      s4: { closedOn: { date: IsoDate; reason: string }[]; reopensOn: IsoDate } | null;
      today: IsoDate | null;
      daysLeft: number | null;
      urgency: Urgency | null;
      steps: WorkingStep[];
      notes: CalcNote[];
      disclaimer: string;
    };

const sec = (n: string) => `s. ${n}, Limitation Act, 1963`;

export function computeLimitation(input: LimitationInput): LimitationResult {
  const errors: string[] = [];
  const article = getLimitationArticle(input.articleId);
  if (!article) errors.push("Choose an article of the Schedule.");
  const start = input.startDate?.trim() ?? "";
  if (!start) errors.push(article ? `Enter the ${article.startLabel.toLowerCase()}.` : "Enter the date from which time runs.");
  else if (!isSupportedDate(start)) errors.push("Enter a valid date between 1900 and 2200.");

  const applied = input.copyAppliedOn?.trim() || "";
  const ready = input.copyReadyOn?.trim() || "";
  const useCopy = Boolean(article?.copyExclusion && (applied || ready));
  if (useCopy) {
    if (!applied || !ready) errors.push("Enter both copy dates: when the certified copy was applied for and when it was ready.");
    else if (!isSupportedDate(applied) || !isSupportedDate(ready)) errors.push("Enter valid certified-copy dates.");
    else {
      if (isSupportedDate(start) && applied < start) errors.push("The copy cannot have been applied for before the date the period runs from.");
      if (ready < applied) errors.push("The copy cannot be ready before it was applied for.");
      else if (diffDays(applied, ready) > MAX_COPY_DAYS) errors.push("The certified-copy dates are more than ten years apart. Check them.");
    }
  }
  const today = input.today && isSupportedDate(input.today) ? input.today : null;
  if (errors.length || !article) return { ok: false, errors };

  const steps: WorkingStep[] = [];
  const notes: CalcNote[] = [];

  // 1. The article.
  steps.push({
    title: `Article ${article.article} of the Schedule applies`,
    detail: `${article.description} Period: ${article.periodText} Time runs from: ${article.runsFrom}`,
    cite: "Schedule, Limitation Act, 1963",
  });

  // 2. s. 12(1): exclude the first day.
  const countFrom = addDays(start, 1);
  steps.push({
    title: `Time runs from ${formatDay(start)}; that day is excluded`,
    detail:
      `The day from which the period is reckoned is excluded, so counting begins on ${formatDay(countFrom)}.` +
      (article.copyExclusion ? " For an appeal, leave to appeal, revision or review, the day the judgment was pronounced is also excluded." : ""),
    cite: article.copyExclusion ? `${sec("12(1)")}, and s. 12(2)` : sec("12(1)"),
  });

  // 3. The period itself.
  const end = addPeriod(start, article.period);
  const periodEnd = end.date;
  if (article.period.unit === "days") {
    steps.push({
      title: `${describePeriod(article.period)} end on ${formatDay(periodEnd)}`,
      detail: `Counting ${describePeriod(article.period)} from ${formatDay(countFrom)} (both that day and the last day counted) ends on ${formatDayLong(periodEnd)}.`,
    });
  } else {
    const p = parseIsoDate(start)!;
    steps.push({
      title: `${describePeriod(article.period)} end on ${formatDay(periodEnd)}`,
      detail:
        `Years and months follow the British calendar, so the period ends on the corresponding date: ${formatDayLong(periodEnd)}.` +
        (end.clamped ? ` That month has no day ${p.d}, so the period ends on the last day of the month.` : ""),
      cite: "s. 3(35) and (66), General Clauses Act, 1897",
    });
    if (end.clamped) {
      notes.push({
        tone: "warning",
        title: "Month-end date",
        body: `The period starts on day ${p.d} of a month and ends in a month without that day, so the last day is taken as the month's last day. File earlier if you can.`,
      });
    }
  }

  // 4. s. 12(2)/(3): certified-copy time.
  let copyDaysExcluded = 0;
  let prescribedEnd = periodEnd;
  if (useCopy) {
    // The judgment day is already excluded, so copy time is counted from the next day at the earliest.
    const from = maxDate(applied, countFrom);
    const days = ready >= from ? diffDays(from, ready) + 1 : 0;
    if (applied > periodEnd) {
      steps.push({
        title: "Copy time does not extend this period",
        detail: `The certified copy was applied for on ${formatDay(applied)}, after the period had already ended on ${formatDay(periodEnd)}. Time that runs after the period has ended cannot be excluded.`,
        cite: sec("12(2)"),
      });
      notes.push({
        tone: "danger",
        title: "Copy applied for after the period ended",
        body: "The copy application came after the period had run out, so no copy time is excluded. If the filing is late, an application for condonation of delay will be needed where s. 5 applies.",
        cite: sec("12(2)"),
      });
    } else {
      copyDaysExcluded = days;
      prescribedEnd = addDays(periodEnd, days);
      steps.push({
        title: `${plural(days, "day")} of copy time excluded`,
        detail:
          `Certified copy applied for on ${formatDay(applied)} and ready on ${formatDay(ready)}: ${plural(days, "day")} ` +
          `(from ${formatDay(from)} to ${formatDay(ready)}, both days counted${applied < from ? "; the judgment day was already excluded" : ""}). ` +
          `The period now ends on ${formatDayLong(prescribedEnd)}.`,
        cite: `${sec("12(2)")} and (3)`,
      });
      notes.push({
        tone: "info",
        title: "How copy time is counted here",
        body:
          "Copy time is counted from the day the copy was applied for to the day it was ready, both days included. Time the court took to prepare the decree or order before you applied for the copy is not excluded (Explanation to s. 12). Courts have differed on the end days; if the margin is a day or two, check your court's practice.",
        cite: sec("12"),
      });
    }
  }

  // 5. s. 4: court closed on the last day.
  const closures = input.closures ?? null;
  let s4: { closedOn: { date: IsoDate; reason: string }[]; reopensOn: IsoDate } | null = null;
  let lastDate = prescribedEnd;
  const reason = closures ? closureReason(prescribedEnd, closures) : null;
  if (closures && reason) {
    const open = nextOpenDay(prescribedEnd, closures);
    if (open) {
      s4 = { closedOn: open.skipped, reopensOn: open.date };
      lastDate = open.date;
      steps.push({
        title: `Court closed on the last day: file on ${formatDay(open.date)}`,
        detail:
          `${formatDayLong(prescribedEnd)} falls on a ${reason}. ` +
          (open.skipped.length > 1 ? `The court stays closed for ${plural(open.skipped.length, "day")} in a row. ` : "") +
          `Where the period expires on a day the court is closed, the filing may be made on the day it reopens: ${formatDayLong(open.date)}.`,
        cite: sec("4"),
      });
    } else {
      notes.push({ tone: "warning", title: "Closures too long", body: "The closure dates you entered cover more than two years in a row. Check them." });
    }
  } else {
    steps.push({
      title: `Last day: ${formatDayLong(prescribedEnd)}`,
      detail:
        `${formatDay(prescribedEnd)} is a ${weekdayName(prescribedEnd)}` +
        (closures ? " and not a closure you entered" : "") +
        ". If the court is closed on the last day, you may file on the day it reopens. A court counts as closed if it is closed during any part of its normal working hours that day.",
      cite: `${sec("4")} and Explanation`,
    });
  }

  // 6. Where things stand today.
  let daysLeft: number | null = null;
  let urgency: Urgency | null = null;
  if (today) {
    ({ daysLeft, urgency } = urgencyOf(lastDate, today));
    steps.push({
      title: `As on ${formatDay(today)}: ${daysLeftText(daysLeft).toLowerCase()}`,
      detail:
        daysLeft < 0
          ? `The last day was ${formatDay(lastDate)}. Unless another exclusion applies, a filing now is out of time and must be dismissed even if limitation is not raised as a defence.`
          : `The last day to file is ${formatDayLong(lastDate)}.`,
      cite: daysLeft < 0 ? sec("3") : undefined,
    });
  }

  // Notes the advocate must weigh; none of these is computed.
  if (article.kind === "suit") {
    notes.push({
      tone: daysLeft !== null && daysLeft < 0 ? "danger" : "warning",
      title: "No condonation for suits",
      body: "Section 5 lets a court admit a late appeal or application for sufficient cause. It does not apply to suits: a suit filed after the prescribed period must be dismissed.",
      cite: `${sec("5")}, s. 3`,
    });
  } else if (article.orderXxi) {
    notes.push({
      tone: "warning",
      title: "Condonation not available under Order XXI",
      body: "Section 5 does not cover applications under any of the provisions of Order XXI of the Code of Civil Procedure, 1908. This application is ordinarily made under Order XXI; check the provision you are filing under.",
      cite: sec("5"),
    });
  } else {
    notes.push({
      tone: daysLeft !== null && daysLeft < 0 ? "danger" : "info",
      title: "Condonation of delay",
      body: `A late ${article.kind} may be admitted if the court is satisfied there was sufficient cause for the delay. Condonation is discretionary; file an application explaining each day of delay.`,
      cite: sec("5"),
    });
  }
  if (article.copyExclusion && !useCopy) {
    notes.push({
      tone: "info",
      title: "Certified-copy time",
      body: "If a certified copy of the decree, order or judgment was applied for, add the dates: the time requisite for obtaining it is excluded.",
      cite: `${sec("12(2)")} and (3)`,
    });
  }
  if (article.kind !== "appeal") {
    notes.push({
      tone: "info",
      title: "Time in a court without jurisdiction",
      body: `Time spent prosecuting another civil proceeding with due diligence and in good faith, in a court unable to entertain it for defect of jurisdiction or a like cause, is excluded. Not computed here: add those days yourself if s. 14 applies.`,
      cite: sec("14"),
    });
  }
  if (article.kind === "suit") {
    notes.push({
      tone: "info",
      title: "Acknowledgment in writing",
      body: "A written acknowledgment of liability, signed by the party against whom the right is claimed before the period expires, starts a fresh period from the date it was signed. Not computed here.",
      cite: sec("18"),
    });
  }
  if (article.debt) {
    notes.push({
      tone: "info",
      title: "Part payment",
      body: "A payment on account of the debt made before the period expires, by the debtor or an authorised agent, starts a fresh period from the date of payment, provided the payment is acknowledged in the handwriting of, or in a writing signed by, the person making it. Not computed here.",
      cite: sec("19"),
    });
  }
  for (const n of article.notes ?? []) notes.push({ tone: "info", title: `About Article ${article.article}`, body: n });
  notes.push({
    tone: "warning",
    title: "Special and local laws",
    body: "Where a special or local law prescribes a different period, that period applies, and ss. 4 to 24 apply only so far as that law does not expressly exclude them.",
    cite: sec("29(2)"),
  });

  return {
    ok: true,
    article,
    startDate: start,
    countFrom,
    periodEnd,
    copyDaysExcluded,
    prescribedEnd,
    lastDate,
    s4,
    today,
    daysLeft,
    urgency,
    steps,
    notes,
    disclaimer: SPECIAL_LAW_DISCLAIMER,
  };
}
