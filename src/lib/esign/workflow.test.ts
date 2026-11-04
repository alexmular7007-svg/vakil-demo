import { describe, expect, it } from "vitest";
import {
  allActionableDone,
  canRecipientAct,
  canTransition,
  currentOrder,
  defaultRecipients,
  groupByOrder,
  initialRecipientsToNotify,
  planAfterAction,
  stepState,
  validateRouting,
  type RecipientState,
} from "./workflow";

const r = (id: string, action: string, routingOrder: number, status = "PENDING"): RecipientState => ({ id, action, routingOrder, status });

function threeParty(): RecipientState[] {
  return [r("lawyer", "REVIEW", 1), r("sender", "SIGN", 2), r("receiver", "SIGN", 2), r("witness", "WITNESS", 3), r("cc", "CC", 1)];
}

function update(list: RecipientState[], id: string, status: string) {
  return list.map((x) => (x.id === id ? { ...x, status } : x));
}

describe("envelope transitions", () => {
  it("allows the forward path and the exits", () => {
    expect(canTransition("DRAFT", "OUT_FOR_SIGNATURE")).toBe(true);
    expect(canTransition("OUT_FOR_SIGNATURE", "PARTIALLY_SIGNED")).toBe(true);
    expect(canTransition("PARTIALLY_SIGNED", "COMPLETED")).toBe(true);
    for (const exit of ["DECLINED", "EXPIRED", "VOIDED"] as const) {
      expect(canTransition("OUT_FOR_SIGNATURE", exit)).toBe(true);
      expect(canTransition("PARTIALLY_SIGNED", exit)).toBe(true);
    }
  });

  it("never leaves a terminal state and never skips the lock", () => {
    expect(canTransition("DRAFT", "COMPLETED")).toBe(false);
    expect(canTransition("DRAFT", "PARTIALLY_SIGNED")).toBe(false);
    for (const t of ["COMPLETED", "DECLINED", "EXPIRED", "VOIDED"] as const) {
      expect(canTransition(t, "OUT_FOR_SIGNATURE")).toBe(false);
      expect(canTransition(t, "VOIDED")).toBe(false);
    }
  });
});

describe("routing", () => {
  it("starts with the lowest order and ignores CC", () => {
    const list = threeParty();
    expect(currentOrder(list)).toBe(1);
    expect(initialRecipientsToNotify(list).map((x) => x.id)).toEqual(["lawyer"]);
  });

  it("lets only the current order act", () => {
    const list = threeParty();
    const sender = list.find((x) => x.id === "sender")!;
    const lawyer = list.find((x) => x.id === "lawyer")!;
    const cc = list.find((x) => x.id === "cc")!;
    expect(canRecipientAct(lawyer, list, "OUT_FOR_SIGNATURE")).toBe(true);
    expect(canRecipientAct(sender, list, "OUT_FOR_SIGNATURE")).toBe(false);
    expect(canRecipientAct(cc, list, "OUT_FOR_SIGNATURE")).toBe(false);
    expect(canRecipientAct(lawyer, list, "DRAFT")).toBe(false);
    expect(canRecipientAct(lawyer, list, "VOIDED")).toBe(false);
  });

  it("opens the parallel order once review is approved", () => {
    const before = threeParty();
    const after = update(before, "lawyer", "APPROVED");
    const plan = planAfterAction(before, after, "OUT_FOR_SIGNATURE");
    expect(plan.envelopeStatus).toBe("PARTIALLY_SIGNED");
    expect(plan.orderCompleted).toBe(1);
    expect(plan.notify.map((x) => x.id).sort()).toEqual(["receiver", "sender"]);
    expect(plan.allDone).toBe(false);
  });

  it("waits for every parallel signer before the next order", () => {
    let list = update(threeParty(), "lawyer", "APPROVED");
    list = update(list, "sender", "SENT");
    list = update(list, "receiver", "SENT");
    const after = update(list, "sender", "SIGNED");
    const plan = planAfterAction(list, after, "PARTIALLY_SIGNED");
    expect(plan.orderCompleted).toBeNull();
    expect(plan.notify).toEqual([]);
    const after2 = update(after, "receiver", "SIGNED");
    const plan2 = planAfterAction(after, after2, "PARTIALLY_SIGNED");
    expect(plan2.orderCompleted).toBe(2);
    expect(plan2.notify.map((x) => x.id)).toEqual(["witness"]);
  });

  it("reports allDone after the last actionable recipient, regardless of CC", () => {
    let list = threeParty();
    for (const id of ["lawyer"]) list = update(list, id, "APPROVED");
    for (const id of ["sender", "receiver"]) list = update(list, id, "SIGNED");
    const after = update(list, "witness", "SIGNED");
    const plan = planAfterAction(list, after, "PARTIALLY_SIGNED");
    expect(plan.allDone).toBe(true);
    expect(plan.orderCompleted).toBe(3);
    expect(allActionableDone(after)).toBe(true);
  });

  it("a decline ends the envelope", () => {
    const before = threeParty();
    const after = update(before, "lawyer", "DECLINED");
    const plan = planAfterAction(before, after, "OUT_FOR_SIGNATURE");
    expect(plan.envelopeStatus).toBe("DECLINED");
    expect(plan.notify).toEqual([]);
  });

  it("refuses to plan when the envelope is not in flight", () => {
    expect(() => planAfterAction(threeParty(), threeParty(), "COMPLETED")).toThrow();
  });
});

describe("validateRouting", () => {
  const base = (rows: [string, number][]) => rows.map(([action, routingOrder], i) => ({ action, routingOrder, email: `p${i}@example.com` })) as never;

  it("accepts the default template", () => {
    const rows = defaultRecipients({ includeWitness: true }).map((x, i) => ({ ...x, email: `p${i}@example.com` }));
    expect(validateRouting(rows)).toEqual([]);
  });

  it("needs a signer", () => {
    expect(validateRouting(base([["REVIEW", 1], ["CC", 1]])).some((i) => i.index === null)).toBe(true);
  });

  it("puts reviewers before and witnesses after every signer", () => {
    const issues = validateRouting(base([["SIGN", 1], ["REVIEW", 1], ["WITNESS", 1]]));
    expect(issues.map((i) => i.index).sort()).toEqual([1, 2]);
  });

  it("rejects orders outside 1..20 and duplicate rows", () => {
    expect(validateRouting(base([["SIGN", 0]])).length).toBeGreaterThan(0);
    expect(validateRouting(base([["SIGN", 21]])).length).toBeGreaterThan(0);
    const dup = [
      { action: "SIGN", routingOrder: 1, email: "a@example.com" },
      { action: "SIGN", routingOrder: 1, email: "A@example.com" },
    ] as never;
    expect(validateRouting(dup).some((i) => i.field === "email")).toBe(true);
  });
});

describe("timeline helpers", () => {
  it("groups by order with CC last and reports step state", () => {
    const list = update(threeParty(), "lawyer", "APPROVED");
    const groups = groupByOrder(list);
    expect(groups.map((g) => g.order)).toEqual([1, 2, 3, "CC"]);
    expect(stepState(1, list, "PARTIALLY_SIGNED")).toBe("done");
    expect(stepState(2, list, "PARTIALLY_SIGNED")).toBe("current");
    expect(stepState(3, list, "PARTIALLY_SIGNED")).toBe("waiting");
    expect(stepState(2, list, "VOIDED")).toBe("stopped");
    expect(stepState("CC", list, "COMPLETED")).toBe("done");
  });
});
