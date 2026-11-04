// Negotiable Instruments Act, 1881: the s. 138 / s. 142 timeline.
//
// Statute (India Code, NI Act s. 138 proviso and s. 142(1)(b)):
//   (a) cheque presented within six months from the date on which it is drawn
//       or within the period of its validity, whichever is earlier;
//   (b) written demand notice within thirty days of receipt of information from
//       the bank regarding the return of the cheque as unpaid;
//   (c) drawer fails to pay within fifteen days of receipt of the notice;
//   s. 142(1)(b): complaint within one month of the date on which the cause of
//       action arises under clause (c); proviso: the court may take cognizance
//       later if the complainant shows sufficient cause.
// Validity: RBI circular DBOD.AML BC.No.47/14.01.001/2011-12 (4 Nov 2011): from
// 1 April 2012 banks should not pay cheques presented beyond three months from
// the date of the instrument.
// Counting: the first day is excluded and a month is a British-calendar month
// ending on the corresponding date (s. 9 and s. 3(35), General Clauses Act;
// Saketh India Ltd v India Securities Ltd, SC 1999: notice served 29.9.1995,
// cause of action 15.10.1995, complaint on 15.11.1995 within time).

import { addDays, addMonths, formatDay, formatDayLong, isSupportedDate, minDate, plural, type IsoDate } from "./dates";
import type { CalcNote, WorkingStep } from "./limitation";
import { daysLeftText, urgencyOf } from "./status";

export const RBI_THREE_MONTH_RULE_FROM = "2012-04-01";
export const RBI_CIRCULAR_URL = "https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=6805&Mode=0";
export const NI_ACT_URL = "https://indiacode.gov.in/handle/123456789/496318";
export const NOTICE_DAYS = 30;
export const PAYMENT_DAYS = 15;

export type ChequeInput = {
  chequeDate: string;
  presentedOn?: string | null;
  /** Date the payee received information from the bank that the cheque was returned unpaid. */
  infoReceivedOn?: string | null;
  noticeSentOn?: string | null;
  /** Date the drawer received the notice. */
  noticeServedOn?: string | null;
  complaintFiledOn?: string | null;
  /** A shorter validity printed on the cheque, in months (1 to 6). Default: the RBI period. */
  validityMonths?: number | null;
  today?: string | null;
};

/** ok = done in time, boundary = done on a day that needs a second look, late = outside the period, premature = too early. */
export type StageState = "ok" | "boundary" | "late" | "premature" | "pending" | "waiting" | "unknown";

export type ChequeStage = {
  key: "presentation" | "notice" | "payment" | "complaint";
  title: string;
  /** The statutory last date for this step (null when it cannot be computed yet). */
  deadline: IsoDate | null;
  /** What actually happened, if entered. */
  actual: IsoDate | null;
  state: StageState;
  label: string;
  detail: string;
  cite: string;
  daysLeft: number | null;
};

export type ChequeResult =
  | { ok: false; errors: string[] }
  | {
      ok: true;
      validity: { months: number; source: "rbi" | "pre-2012" | "cheque"; validityEnd: IsoDate; sixMonthEnd: IsoDate; lastPresentation: IsoDate };
      noticeDeadline: IsoDate | null;
      paymentDeadline: IsoDate | null;
      causeOfAction: IsoDate | null;
      complaintDeadline: IsoDate | null;
      complaintClamped: boolean;
      stages: ChequeStage[];
      headline: { label: string; date: IsoDate; state: StageState; daysLeft: number | null; sub: string } | null;
      steps: WorkingStep[];
      notes: CalcNote[];
    };

const ni = (s: string) => `s. ${s}, NI Act, 1881`;

function clean(v: string | null | undefined) {
  return v?.trim() || "";
}

export function computeChequeBounce(input: ChequeInput): ChequeResult {
  const errors: string[] = [];
  const cheque = clean(input.chequeDate);
  const presented = clean(input.presentedOn);
  const info = clean(input.infoReceivedOn);
  const sent = clean(input.noticeSentOn);
  const served = clean(input.noticeServedOn);
  const filed = clean(input.complaintFiledOn);
  const today = input.today && isSupportedDate(input.today) ? input.today : null;

  const fields: [string, string][] = [
    [cheque, "date on the cheque"],
    [presented, "presentation date"],
    [info, "date the dishonour information was received"],
    [sent, "date the notice was sent"],
    [served, "date the notice was served"],
    [filed, "complaint date"],
  ];
  if (!cheque) errors.push("Enter the date on the cheque.");
  for (const [v, label] of fields) if (v && !isSupportedDate(v)) errors.push(`Enter a valid ${label}.`);
  const vm = input.validityMonths;
  if (vm != null && (!Number.isInteger(vm) || vm < 1 || vm > 6)) errors.push("Validity printed on the cheque must be between 1 and 6 months.");
  if (errors.length) return { ok: false, errors };

  // Order checks: each event must follow the one before it.
  const order: [string, string, string][] = [
    [presented, cheque, "The cheque cannot be presented before the date on it."],
    [info, presented, "The dishonour information cannot come before the cheque was presented."],
    [info, cheque, "The dishonour information cannot come before the date on the cheque."],
    [sent, info, "The notice cannot be sent before the dishonour information was received."],
    [served, sent, "The notice cannot be served before it was sent."],
    [served, info, "The notice cannot be served before the dishonour information was received."],
  ];
  for (const [later, earlier, msg] of order) if (later && earlier && later < earlier) errors.push(msg);
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };

  const steps: WorkingStep[] = [];
  const notes: CalcNote[] = [];
  const stages: ChequeStage[] = [];
  const left = (d: IsoDate | null) => (today && d ? urgencyOf(d, today).daysLeft : null);

  /* ------------------------------ (a) presentation ------------------------------ */
  const sixMonth = addMonths(cheque, 6).date;
  const source: "rbi" | "pre-2012" | "cheque" = vm ? "cheque" : cheque >= RBI_THREE_MONTH_RULE_FROM ? "rbi" : "pre-2012";
  const months = vm ?? (source === "rbi" ? 3 : 6);
  const validityEnd = addMonths(cheque, months).date;
  const lastPresentation = minDate(sixMonth, validityEnd);
  steps.push({
    title: `Present the cheque by ${formatDay(lastPresentation)}`,
    detail:
      `Six months from ${formatDay(cheque)} ends on ${formatDay(sixMonth)}. ` +
      (source === "rbi"
        ? `Cheques dated on or after 1 April 2012 are valid for three months from their date (RBI), ending on ${formatDay(validityEnd)}. `
        : source === "pre-2012"
          ? `This cheque is dated before 1 April 2012, when cheques were valid for six months. `
          : `The validity printed on the cheque, ${plural(months, "month")}, ends on ${formatDay(validityEnd)}. `) +
      `The earlier date governs.`,
    cite: `${ni("138")}, proviso (a); RBI circular of 4 Nov 2011`,
  });
  if (presented) {
    const state: StageState = presented < lastPresentation ? "ok" : presented === lastPresentation ? "boundary" : "late";
    stages.push({
      key: "presentation",
      title: "Cheque presented",
      deadline: lastPresentation,
      actual: presented,
      state,
      label: state === "ok" ? "Within validity" : state === "boundary" ? "Last day: check" : "After validity",
      detail:
        state === "ok"
          ? `Presented on ${formatDay(presented)}, within the period ending ${formatDay(lastPresentation)}.`
          : state === "boundary"
            ? `Presented on ${formatDay(lastPresentation)}, the last day counted by excluding the cheque date. Banks sometimes treat the day before as the last day of validity, so confirm the cheque was returned for want of funds and not as out of date.`
            : `Presented on ${formatDay(presented)}, after the period ended on ${formatDay(lastPresentation)}. Proviso (a) is not met, so s. 138 does not apply to this dishonour.`,
      cite: `${ni("138")}, proviso (a)`,
      daysLeft: null,
    });
  } else if (info || sent || served) {
    // Later events show the cheque was presented; without the date we cannot check validity.
    stages.push({
      key: "presentation",
      title: "Cheque presented",
      deadline: lastPresentation,
      actual: null,
      state: "unknown",
      label: "Date not entered",
      detail: `Enter the presentation date to check it was within the period ending ${formatDay(lastPresentation)}.`,
      cite: `${ni("138")}, proviso (a)`,
      daysLeft: null,
    });
  } else {
    const d = left(lastPresentation);
    stages.push({
      key: "presentation",
      title: "Present the cheque",
      deadline: lastPresentation,
      actual: null,
      state: d !== null && d < 0 ? "late" : "pending",
      label: d === null ? "Not entered" : d < 0 ? "Validity over" : daysLeftText(d),
      detail: `Present the cheque to the bank by ${formatDayLong(lastPresentation)}.`,
      cite: `${ni("138")}, proviso (a)`,
      daysLeft: d,
    });
  }

  /* --------------------------------- (b) notice --------------------------------- */
  const noticeDeadline = info ? addDays(info, NOTICE_DAYS) : null;
  if (info && noticeDeadline) {
    steps.push({
      title: `Send the demand notice by ${formatDay(noticeDeadline)}`,
      detail: `The bank's information of dishonour was received on ${formatDay(info)}. Excluding that day, 30 days end on ${formatDayLong(noticeDeadline)}.`,
      cite: `${ni("138")}, proviso (b)`,
    });
    if (sent) {
      const state: StageState = sent <= noticeDeadline ? "ok" : "late";
      stages.push({
        key: "notice",
        title: "Demand notice sent",
        deadline: noticeDeadline,
        actual: sent,
        state,
        label: state === "ok" ? "Within 30 days" : "After 30 days",
        detail:
          state === "ok"
            ? `Sent on ${formatDay(sent)}, within 30 days (last day ${formatDay(noticeDeadline)}).`
            : `Sent on ${formatDay(sent)}, after the last day, ${formatDay(noticeDeadline)}. Proviso (b) is not met for this dishonour.`,
        cite: `${ni("138")}, proviso (b)`,
        daysLeft: null,
      });
    } else {
      const d = left(noticeDeadline);
      stages.push({
        key: "notice",
        title: "Send the demand notice",
        deadline: noticeDeadline,
        actual: null,
        state: d !== null && d < 0 ? "late" : "pending",
        label: d === null ? "Not sent yet" : d < 0 ? "Deadline passed" : daysLeftText(d),
        detail: `Send a written demand to the drawer by ${formatDayLong(noticeDeadline)}.`,
        cite: `${ni("138")}, proviso (b)`,
        daysLeft: d,
      });
    }
  } else {
    stages.push({
      key: "notice",
      title: "Demand notice",
      deadline: null,
      actual: sent || null,
      state: "unknown",
      label: "Needs a date",
      detail: "Enter the date the bank's information of dishonour (return memo) was received to compute the 30 days.",
      cite: `${ni("138")}, proviso (b)`,
      daysLeft: null,
    });
  }

  /* ------------------------------- (c) payment window ------------------------------ */
  const paymentDeadline = served ? addDays(served, PAYMENT_DAYS) : null;
  const causeOfAction = served ? addDays(served, PAYMENT_DAYS + 1) : null;
  if (served && paymentDeadline && causeOfAction) {
    steps.push({
      title: `Drawer may pay until ${formatDay(paymentDeadline)}; cause of action on ${formatDay(causeOfAction)}`,
      detail: `The notice was received on ${formatDay(served)}. Excluding that day, 15 days end on ${formatDay(paymentDeadline)}. If the drawer has not paid by then, the cause of action arises the next day, ${formatDayLong(causeOfAction)}.`,
      cite: `${ni("138")}, proviso (c); s. 142(1)(b)`,
    });
    const waiting = today !== null && today <= paymentDeadline;
    stages.push({
      key: "payment",
      title: "Drawer's 15 days to pay",
      deadline: paymentDeadline,
      actual: null,
      state: waiting ? "waiting" : "ok",
      label: waiting ? "Running" : "Over",
      detail: waiting
        ? `The drawer has until ${formatDay(paymentDeadline)} to pay. Do not file before ${formatDay(causeOfAction)}.`
        : `The 15 days ended on ${formatDay(paymentDeadline)}. If unpaid, the cause of action arose on ${formatDay(causeOfAction)}.`,
      cite: `${ni("138")}, proviso (c)`,
      daysLeft: left(paymentDeadline),
    });
  } else {
    stages.push({
      key: "payment",
      title: "Drawer's 15 days to pay",
      deadline: null,
      actual: null,
      state: "unknown",
      label: "Needs a date",
      detail: "Enter the date the drawer received the notice to compute the 15 days and the cause of action.",
      cite: `${ni("138")}, proviso (c)`,
      daysLeft: null,
    });
  }

  /* ----------------------------- s. 142(1)(b) complaint ----------------------------- */
  let complaintDeadline: IsoDate | null = null;
  let complaintClamped = false;
  if (causeOfAction) {
    const m = addMonths(causeOfAction, 1);
    complaintDeadline = m.date;
    complaintClamped = m.clamped;
    steps.push({
      title: `File the complaint by ${formatDay(complaintDeadline)}`,
      detail:
        `One month from the cause of action (${formatDay(causeOfAction)}, excluded) ends on the corresponding date, ${formatDayLong(complaintDeadline)}.` +
        (complaintClamped ? " The next month has no such day, so the month ends on its last day." : ""),
      cite: `${ni("142(1)(b)")}; s. 3(35) and s. 9, General Clauses Act, 1897`,
    });
    if (filed) {
      const state: StageState = filed < causeOfAction ? "premature" : filed <= complaintDeadline ? "ok" : "late";
      stages.push({
        key: "complaint",
        title: "Complaint filed",
        deadline: complaintDeadline,
        actual: filed,
        state,
        label: state === "ok" ? "Within one month" : state === "premature" ? "Too early" : "Late: needs condonation",
        detail:
          state === "ok"
            ? `Filed on ${formatDay(filed)}, within one month (last day ${formatDay(complaintDeadline)}).`
            : state === "premature"
              ? `Filed on ${formatDay(filed)}, before the cause of action arose on ${formatDay(causeOfAction)}. The offence is complete only when the drawer fails to pay within 15 days of receiving the notice.`
              : `Filed on ${formatDay(filed)}, after the last day, ${formatDay(complaintDeadline)}. The court may take cognizance only if you satisfy it that there was sufficient cause for the delay.`,
        cite: state === "premature" ? `${ni("138")}, proviso (c)` : `${ni("142(1)(b)")} and proviso`,
        daysLeft: null,
      });
    } else {
      const d = left(complaintDeadline);
      const early = today !== null && today < causeOfAction;
      stages.push({
        key: "complaint",
        title: "File the complaint",
        deadline: complaintDeadline,
        actual: null,
        state: d !== null && d < 0 ? "late" : "pending",
        label: d === null ? "Not filed yet" : d < 0 ? "Late: needs condonation" : early ? `Opens ${formatDay(causeOfAction)}` : daysLeftText(d),
        detail: early
          ? `File between ${formatDay(causeOfAction)} and ${formatDayLong(complaintDeadline)}.`
          : `File the complaint by ${formatDayLong(complaintDeadline)}.`,
        cite: ni("142(1)(b)"),
        daysLeft: d,
      });
    }
    if (complaintClamped) {
      notes.push({
        tone: "warning",
        title: "Month-end date",
        body: "The cause of action falls on a day the following month does not have, so the month is taken to end on that month's last day. File earlier if you can.",
      });
    }
  } else {
    stages.push({
      key: "complaint",
      title: "File the complaint",
      deadline: null,
      actual: filed || null,
      state: "unknown",
      label: "Needs a date",
      detail: "The one-month period runs from the cause of action, which needs the date the notice was served.",
      cite: ni("142(1)(b)"),
      daysLeft: null,
    });
  }

  /* ------------------------------------ headline ------------------------------------ */
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s])) as Record<ChequeStage["key"], ChequeStage>;
  let headline: Extract<ChequeResult, { ok: true }>["headline"] = null;
  if (complaintDeadline && causeOfAction) {
    const s = byKey.complaint;
    headline = {
      label: "Last day to file the complaint",
      date: complaintDeadline,
      state: s.state,
      daysLeft: s.daysLeft,
      sub: filed ? s.detail : `Cause of action arises on ${formatDay(causeOfAction)}. ${ni("142(1)(b)")}.`,
    };
  } else if (noticeDeadline) {
    const s = byKey.notice;
    headline = sent
      ? { label: "Demand notice", date: sent, state: s.state, daysLeft: null, sub: `${s.detail} Enter the date the drawer received it to get the complaint deadline.` }
      : { label: "Last day to send the demand notice", date: noticeDeadline, state: s.state, daysLeft: s.daysLeft, sub: `30 days from receipt of the bank's information, ${formatDay(info)}.` };
  } else {
    const s = byKey.presentation;
    headline = presented
      ? { label: "Cheque presented", date: presented, state: s.state, daysLeft: null, sub: `${s.detail} Enter the date the dishonour information was received for the notice deadline.` }
      : { label: "Last day to present the cheque", date: lastPresentation, state: s.state, daysLeft: s.daysLeft, sub: "Six months or the cheque's validity, whichever is earlier." };
  }

  /* ------------------------------------- notes ------------------------------------- */
  if (byKey.presentation.state === "late" && presented) {
    notes.push({
      tone: "danger",
      title: "Presented after validity",
      body: "Section 138 applies only if the cheque was presented within six months or its validity, whichever is earlier. Other civil remedies may remain.",
      cite: `${ni("138")}, proviso (a)`,
    });
  }
  if (byKey.notice.state === "late" && sent) {
    notes.push({
      tone: "danger",
      title: "Notice outside 30 days",
      body: "Proviso (b) requires the demand by notice in writing within thirty days of receiving the bank's information. Check the case law on when a notice is \"given\" before relying on the dispatch date.",
      cite: `${ni("138")}, proviso (b)`,
    });
  }
  notes.push({
    tone: "info",
    title: "Date of service of notice",
    body: "Enter the date the drawer actually received the notice. If it was returned unclaimed, refused or the drawer could not be found, the date of service is a question of law and fact; enter the date you will rely on and keep the postal records.",
  });
  notes.push({
    tone: "warning",
    title: "Late complaints",
    body: "A complaint after one month is not automatically barred: the court may take cognizance after the period if the complainant satisfies it that there was sufficient cause for not filing in time. File an application explaining the delay.",
    cite: `${ni("142(1)(b)")}, proviso`,
  });
  notes.push({
    tone: "info",
    title: "How the days are counted",
    body: "The day of the triggering event is excluded and a month runs to the corresponding date of the next month, as the Supreme Court counted in Saketh India Ltd v India Securities Ltd (1999): notice served on 29 Sept 1995, cause of action on 15 Oct 1995, complaint on 15 Nov 1995 held within time.",
    cite: "s. 3(35) and s. 9, General Clauses Act, 1897",
  });
  notes.push({
    tone: "info",
    title: "If the last day is a holiday",
    body: "If the last day for filing falls on a day the court is closed, check whether the filing can be made on the next day it is open (s. 10, General Clauses Act, 1897, or s. 4 read with s. 29(2), Limitation Act, 1963). The dates above do not move for holidays.",
  });
  notes.push({
    tone: "info",
    title: "Where to file",
    body: "The complaint is tried only by a court within whose local jurisdiction is the branch where the payee maintains the account (cheque delivered for collection through an account), or the drawee branch where the drawer maintains the account (cheque presented otherwise than through an account).",
    cite: ni("142(2)"),
  });

  return {
    ok: true,
    validity: { months, source, validityEnd, sixMonthEnd: sixMonth, lastPresentation },
    noticeDeadline,
    paymentDeadline,
    causeOfAction,
    complaintDeadline,
    complaintClamped,
    stages,
    headline,
    steps,
    notes,
  };
}
