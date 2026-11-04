// Shapes shared by diary queries, server actions and client components.

import { HEARING_STATUSES } from "@/lib/db/schema/enums";

// Allowed values live in the schema (enforced by a CHECK constraint in the database).
export { HEARING_STATUSES };
export type HearingStatus = (typeof HEARING_STATUSES)[number];

export type HearingItem = {
  id: string;
  matterId: string | null;
  caseTitle: string;
  court: string | null;
  /** Court hall, bench or judge. */
  bench: string | null;
  itemNo: string | null;
  /** "HH:MM" (24-hour) or null. */
  hearingTime: string | null;
  purpose: string | null;
  /** YYYY-MM-DD */
  hearingDate: string;
  status: HearingStatus;
  caseNo: string | null;
  cnr: string | null;
  notes: string | null;
  outcome: string | null;
  nextHearingId: string | null;
  /** YYYY-MM-DD of the linked next hearing, if any. */
  nextHearingDate: string | null;
};

export type TaskItem = {
  id: string;
  title: string;
  /** YYYY-MM-DD or null */
  dueDate: string | null;
  matterId: string | null;
  matterTitle: string | null;
  done: boolean;
};

export type MatterOption = {
  id: string;
  title: string;
  court: string | null;
  caseNo: string | null;
  cnr: string | null;
  clientName: string | null;
};

/** Values of the add/edit hearing form (all strings, as typed). */
export type HearingDraft = {
  matterId: string;
  caseTitle: string;
  court: string;
  bench: string;
  caseNo: string;
  cnr: string;
  itemNo: string;
  hearingDate: string;
  hearingTime: string;
  purpose: string;
  notes: string;
};

/** What the AI proposes after reading an order; the user confirms before saving. */
export type OrderProposal = {
  nextDate: string | null;
  purpose: string | null;
  court: string | null;
  bench: string | null;
  itemNo: string | null;
  caseTitle: string | null;
  caseNo: string | null;
  /** Short quote from the order supporting the next date. */
  evidence: string | null;
};

export function toStatus(s: string): HearingStatus {
  return (HEARING_STATUSES as readonly string[]).includes(s) ? (s as HearingStatus) : "scheduled";
}
