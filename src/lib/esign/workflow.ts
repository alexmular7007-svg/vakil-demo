// E-sign state machine. Pure functions only (no I/O), shared by the service
// layer, the UI and the unit tests.
//
// Envelope: DRAFT -> OUT_FOR_SIGNATURE (document hash locked) -> PARTIALLY_SIGNED
//           -> COMPLETED, with exits DECLINED, EXPIRED and VOIDED.
// Recipient: PENDING -> SENT (link emailed) -> VIEWED (email OTP verified)
//           -> APPROVED | SIGNED | DECLINED. Copies (CC) only ever go PENDING -> SENT.
// Routing: equal routingOrder act in parallel; a higher order waits until every
// actionable recipient in all lower orders has finished.
//
// The transition maps below are the only statement of what may change into
// what. The database writes go through changeEnvelopeStatus /
// changeRecipientStatus (src/lib/esign/state.ts), which check these maps.

import {
  DONE_RECIPIENT_STATUSES,
  IN_FLIGHT_STATUSES,
  MAX_ROUTING_ORDER,
  TERMINAL_STATUSES,
  actionRule,
  type EnvelopeStatus,
  type RecipientAction,
  type RecipientStatus,
  type RoleLabel,
} from "./constants";

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

/** Allowed envelope status changes. A status missing from a list can never follow it. */
export const ENVELOPE_TRANSITIONS: Readonly<Record<EnvelopeStatus, readonly EnvelopeStatus[]>> = {
  DRAFT: ["OUT_FOR_SIGNATURE"],
  OUT_FOR_SIGNATURE: ["PARTIALLY_SIGNED", "COMPLETED", "DECLINED", "EXPIRED", "VOIDED"],
  PARTIALLY_SIGNED: ["COMPLETED", "DECLINED", "EXPIRED", "VOIDED"],
  COMPLETED: [],
  DECLINED: [],
  EXPIRED: [],
  VOIDED: [],
};

/**
 * Allowed recipient status changes. Acting requires VIEWED, which only a correct
 * one-time code sets, so no approval, signature or decline can skip the OTP.
 * Which finished status an action may reach is checked against ACTION_RULES.
 */
export const RECIPIENT_TRANSITIONS: Readonly<Record<RecipientStatus, readonly RecipientStatus[]>> = {
  PENDING: ["SENT"],
  SENT: ["VIEWED"],
  VIEWED: ["APPROVED", "SIGNED", "DECLINED"],
  APPROVED: [],
  SIGNED: [],
  DECLINED: [],
};

const human = (s: string) => s.toLowerCase().replaceAll("_", " ");

export function canTransition(from: EnvelopeStatus, to: EnvelopeStatus): boolean {
  return (ENVELOPE_TRANSITIONS as Record<string, readonly string[] | undefined>)[from]?.includes(to) ?? false;
}

export function assertTransition(from: EnvelopeStatus, to: EnvelopeStatus): void {
  if (!canTransition(from, to)) {
    throw new WorkflowError(`An envelope that is ${human(from)} cannot become ${human(to)}.`);
  }
}

/** True when a recipient with this action may move from their current status to `to`. */
export function canRecipientTransition(r: { status: string; action: string }, to: RecipientStatus): boolean {
  const allowed = (RECIPIENT_TRANSITIONS as Record<string, readonly string[] | undefined>)[r.status];
  if (!allowed?.includes(to)) return false;
  const rule = actionRule(r.action);
  if (!rule) return false;
  // Copies never verify or act: they only receive a link to the final PDF.
  if (!rule.actionable) return to === "SENT";
  if (to === "APPROVED" || to === "SIGNED") return rule.completesAs === to;
  return true;
}

export function assertRecipientTransition(r: { status: string; action: string }, to: RecipientStatus): void {
  if (!canRecipientTransition(r, to)) {
    throw new WorkflowError(`A recipient who is ${human(r.status)} cannot become ${human(to)} (action: ${human(r.action)}).`);
  }
}

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Recipients can act only while the envelope is out for signature. */
export function isInFlight(status: string): boolean {
  return (IN_FLIGHT_STATUSES as readonly string[]).includes(status);
}

export function isExpiredAt(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export type RecipientState = {
  id: string;
  action: RecipientAction | string;
  routingOrder: number;
  status: RecipientStatus | string;
};

export function isActionable(r: Pick<RecipientState, "action">): boolean {
  return actionRule(r.action)?.actionable ?? false;
}

export function isDone(r: Pick<RecipientState, "status">): boolean {
  return (DONE_RECIPIENT_STATUSES as readonly string[]).includes(r.status);
}

/** Status a recipient reaches when they complete their action. */
export function completedStatusFor(action: RecipientAction | string): RecipientStatus {
  const done = actionRule(action)?.completesAs;
  if (!done) throw new WorkflowError("Copy recipients do not act on the document.");
  return done;
}

/** Lowest routing order that still has an actionable recipient who has not finished. */
export function currentOrder(recipients: readonly RecipientState[]): number | null {
  let min: number | null = null;
  for (const r of recipients) {
    if (!isActionable(r) || isDone(r)) continue;
    if (min === null || r.routingOrder < min) min = r.routingOrder;
  }
  return min;
}

export function allActionableDone(recipients: readonly RecipientState[]): boolean {
  const actionable = recipients.filter(isActionable);
  return actionable.length > 0 && actionable.every(isDone);
}

export function anyDeclined(recipients: readonly RecipientState[]): boolean {
  return recipients.some((r) => r.status === "DECLINED");
}

/** True when this recipient may act right now. */
export function canRecipientAct(
  recipient: RecipientState,
  recipients: readonly RecipientState[],
  envelopeStatus: string,
): boolean {
  if (!isInFlight(envelopeStatus)) return false;
  if (!isActionable(recipient) || isDone(recipient) || recipient.status === "DECLINED") return false;
  if (anyDeclined(recipients)) return false;
  return currentOrder(recipients) === recipient.routingOrder;
}

/** Recipients that receive their link when the envelope is first sent. */
export function initialRecipientsToNotify<T extends RecipientState>(recipients: readonly T[]): T[] {
  const order = currentOrder(recipients);
  if (order === null) return [];
  return recipients.filter((r) => isActionable(r) && r.routingOrder === order && !isDone(r));
}

export type ActionPlan<T extends RecipientState> = {
  /** Envelope status after the action. */
  envelopeStatus: EnvelopeStatus;
  /** The routing order that just finished, if this action finished it. */
  orderCompleted: number | null;
  /** Recipients whose turn has now come (emailed their link). */
  notify: T[];
  allDone: boolean;
};

/**
 * Decide what happens after one recipient's status changed.
 * `before` and `after` are the full recipient lists around the change.
 */
export function planAfterAction<T extends RecipientState>(
  before: readonly T[],
  after: readonly T[],
  envelopeStatus: EnvelopeStatus,
): ActionPlan<T> {
  if (!isInFlight(envelopeStatus)) {
    throw new WorkflowError("The envelope is not out for signature.");
  }
  if (anyDeclined(after)) {
    assertTransition(envelopeStatus, "DECLINED");
    return { envelopeStatus: "DECLINED", orderCompleted: null, notify: [], allDone: false };
  }
  const prevOrder = currentOrder(before);
  const nextOrder = currentOrder(after);
  const orderCompleted = prevOrder !== null && prevOrder !== nextOrder ? prevOrder : null;
  // Completion is a separate step (the final PDF must be built first), so the
  // envelope stays in flight here and allDone tells the caller to complete it.
  const status: EnvelopeStatus = after.some((r) => isActionable(r) && isDone(r)) ? "PARTIALLY_SIGNED" : envelopeStatus;
  if (status !== envelopeStatus) assertTransition(envelopeStatus, status);
  if (nextOrder === null) {
    return { envelopeStatus: status, orderCompleted, notify: [], allDone: allActionableDone(after) };
  }
  const notify =
    orderCompleted !== null
      ? after.filter((r) => isActionable(r) && r.routingOrder === nextOrder && r.status === "PENDING")
      : [];
  return { envelopeStatus: status, orderCompleted, notify, allDone: false };
}

export type RecipientDraft = {
  name: string;
  email: string;
  roleLabel: RoleLabel;
  action: RecipientAction;
  routingOrder: number;
  advocateUserId?: string | null;
};

/** Default three-party template: lawyer review, both parties sign in parallel, optional lawyer witness. */
export function defaultRecipients(opts: { includeWitness?: boolean } = {}): RecipientDraft[] {
  const list: RecipientDraft[] = [
    { name: "", email: "", roleLabel: "LAWYER", action: "REVIEW", routingOrder: 1, advocateUserId: null },
    { name: "", email: "", roleLabel: "SENDER", action: "SIGN", routingOrder: 2, advocateUserId: null },
    { name: "", email: "", roleLabel: "RECEIVER", action: "SIGN", routingOrder: 2, advocateUserId: null },
  ];
  if (opts.includeWitness) {
    list.push({ name: "", email: "", roleLabel: "LAWYER", action: "WITNESS", routingOrder: 3, advocateUserId: null });
  }
  return list;
}

export type RoutingIssue = { index: number | null; field: "routingOrder" | "action" | "email" | null; message: string };

/**
 * Checks that the routing makes sense. Returns every problem found so the form
 * can highlight each row.
 */
export function validateRouting(
  recipients: readonly { action: RecipientAction | string; routingOrder: number; email: string }[],
): RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  const phase = (action: string) => actionRule(action)?.phase;
  recipients.forEach((r, i) => {
    if (!actionRule(r.action)) issues.push({ index: i, field: "action", message: "Choose an action." });
  });
  const signers = recipients.filter((r) => phase(r.action) === "signers");
  if (signers.length === 0) {
    issues.push({ index: null, field: "action", message: "Add at least one recipient who signs." });
  }
  recipients.forEach((r, i) => {
    if (!Number.isInteger(r.routingOrder) || r.routingOrder < 1 || r.routingOrder > MAX_ROUTING_ORDER) {
      issues.push({ index: i, field: "routingOrder", message: `Order must be a whole number from 1 to ${MAX_ROUTING_ORDER}.` });
    }
  });
  if (signers.length > 0) {
    const minSign = Math.min(...signers.map((s) => s.routingOrder));
    const maxSign = Math.max(...signers.map((s) => s.routingOrder));
    recipients.forEach((r, i) => {
      if (phase(r.action) === "before_signers" && r.routingOrder >= minSign) {
        issues.push({
          index: i,
          field: "routingOrder",
          message: "A reviewer approves the text before anyone signs, so their order must be lower than every signer's.",
        });
      }
      if (phase(r.action) === "after_signers" && r.routingOrder <= maxSign) {
        issues.push({
          index: i,
          field: "routingOrder",
          message: "A witness attests the signatures, so their order must be higher than every signer's.",
        });
      }
    });
  }
  const seen = new Map<string, number>();
  recipients.forEach((r, i) => {
    const key = `${r.email.trim().toLowerCase()}|${r.action}|${r.routingOrder}`;
    if (!r.email.trim()) return;
    if (seen.has(key)) {
      issues.push({ index: i, field: "email", message: "This person already has the same action at the same order." });
    } else {
      seen.set(key, i);
    }
  });
  return issues;
}

/** Group recipients by routing order for timelines. CC recipients go last. */
export function groupByOrder<T extends RecipientState>(recipients: readonly T[]): { order: number | "CC"; items: T[] }[] {
  const map = new Map<number, T[]>();
  const cc: T[] = [];
  for (const r of recipients) {
    if (!isActionable(r)) {
      cc.push(r);
      continue;
    }
    const list = map.get(r.routingOrder) ?? [];
    list.push(r);
    map.set(r.routingOrder, list);
  }
  const groups: { order: number | "CC"; items: T[] }[] = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([order, items]) => ({ order, items }));
  if (cc.length) groups.push({ order: "CC", items: cc });
  return groups;
}

export type StepState = "done" | "current" | "waiting" | "stopped";

/** Timeline state of one routing step. */
export function stepState(
  order: number | "CC",
  recipients: readonly RecipientState[],
  envelopeStatus: string,
): StepState {
  if (order === "CC") return envelopeStatus === "COMPLETED" ? "done" : isTerminal(envelopeStatus) ? "stopped" : "waiting";
  const items = recipients.filter((r) => isActionable(r) && r.routingOrder === order);
  if (items.length > 0 && items.every(isDone)) return "done";
  if (envelopeStatus === "DRAFT") return "waiting";
  if (!isInFlight(envelopeStatus)) return "stopped";
  return currentOrder(recipients) === order ? "current" : "waiting";
}

/** Event kinds that carry a personal link; a failed email of these kinds leaves the recipient without a working link. */
const LINK_EMAIL_KINDS = new Set(["initial", "next_order", "reminder", "final_copy"]);

/**
 * Recipients whose newest link never arrived: their last "recipient.notified"
 * event is followed by an "email.failed" event for a link email. The owner is
 * shown these so they can send a reminder (which issues a fresh link).
 */
export function undeliveredRecipientIds(
  events: readonly { seq: number; type: string; recipientId: string | null; data?: unknown }[],
): string[] {
  const lastNotified = new Map<string, number>();
  const lastFailed = new Map<string, number>();
  for (const e of events) {
    if (!e.recipientId) continue;
    if (e.type === "recipient.notified") lastNotified.set(e.recipientId, Math.max(e.seq, lastNotified.get(e.recipientId) ?? -1));
    if (e.type === "email.failed") {
      const kind = (e.data as { kind?: unknown } | null | undefined)?.kind;
      if (typeof kind === "string" && LINK_EMAIL_KINDS.has(kind)) {
        lastFailed.set(e.recipientId, Math.max(e.seq, lastFailed.get(e.recipientId) ?? -1));
      }
    }
  }
  return [...lastFailed.entries()].filter(([id, seq]) => seq > (lastNotified.get(id) ?? -1)).map(([id]) => id);
}
