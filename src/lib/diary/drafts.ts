// Builders for the add/edit hearing form values. Pure; safe for client and server.
import type { HearingDraft, HearingItem, MatterOption, OrderProposal } from "./types";

export function blankDraft(date: string, prefill?: Partial<HearingDraft>): HearingDraft {
  return {
    matterId: "",
    caseTitle: "",
    court: "",
    bench: "",
    caseNo: "",
    cnr: "",
    itemNo: "",
    hearingDate: date,
    hearingTime: "",
    purpose: "",
    notes: "",
    ...prefill,
  };
}

export function draftFromHearing(h: HearingItem): HearingDraft {
  return {
    matterId: h.matterId ?? "",
    caseTitle: h.caseTitle,
    court: h.court ?? "",
    bench: h.bench ?? "",
    caseNo: h.caseNo ?? "",
    cnr: h.cnr ?? "",
    itemNo: h.itemNo ?? "",
    hearingDate: h.hearingDate,
    hearingTime: h.hearingTime ?? "",
    purpose: h.purpose ?? "",
    notes: h.notes ?? "",
  };
}

/** Case details copied from a matter (title, court, case number, CNR). */
export function matterPrefill(m: MatterOption): Partial<HearingDraft> {
  return {
    matterId: m.id,
    caseTitle: m.title,
    ...(m.court ? { court: m.court } : {}),
    ...(m.caseNo ? { caseNo: m.caseNo } : {}),
    ...(m.cnr ? { cnr: m.cnr } : {}),
  };
}

/** Form values from an AI reading of an order; the matter fills only what the order did not state. */
export function draftFromProposal(p: OrderProposal, matter: MatterOption | null, fallbackDate: string): HearingDraft {
  const base = blankDraft(fallbackDate, matter ? matterPrefill(matter) : undefined);
  return {
    ...base,
    caseTitle: p.caseTitle ?? base.caseTitle,
    court: p.court ?? base.court,
    bench: p.bench ?? base.bench,
    caseNo: p.caseNo ?? base.caseNo,
    itemNo: p.itemNo ?? "",
    hearingDate: p.nextDate ?? "",
    purpose: p.purpose ?? "",
  };
}
