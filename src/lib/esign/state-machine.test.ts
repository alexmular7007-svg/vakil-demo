// The e-sign rules in one place: transition maps, action/role rules, and a guard
// that no file other than state.ts writes a status column.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTION_RULES,
  DONE_RECIPIENT_STATUSES,
  ENVELOPE_STATUSES,
  IN_FLIGHT_STATUSES,
  RECIPIENT_ACTIONS,
  RECIPIENT_STATUSES,
  ROLE_LABELS,
  ROLE_RULES,
  TERMINAL_STATUSES,
} from "./constants";
import {
  ENVELOPE_TRANSITIONS,
  RECIPIENT_TRANSITIONS,
  WorkflowError,
  assertRecipientTransition,
  assertTransition,
  canRecipientTransition,
  canTransition,
  isInFlight,
  isTerminal,
  undeliveredRecipientIds,
} from "./workflow";

const here = __dirname;

describe("envelope transition map", () => {
  it("covers every status in the schema enum and nothing else", () => {
    expect(Object.keys(ENVELOPE_TRANSITIONS).sort()).toEqual([...ENVELOPE_STATUSES].sort());
    for (const targets of Object.values(ENVELOPE_TRANSITIONS)) {
      for (const t of targets) expect(ENVELOPE_STATUSES).toContain(t);
    }
  });

  it("terminal statuses are exactly those with no way out, and match the database trigger", () => {
    const noExit = ENVELOPE_STATUSES.filter((s) => ENVELOPE_TRANSITIONS[s].length === 0);
    expect([...noExit].sort()).toEqual([...TERMINAL_STATUSES].sort());
    const sql = readFileSync(path.resolve(here, "../db/sql/security.sql"), "utf8");
    const m = /old\.status in \(([^)]*)\)/.exec(sql);
    expect(m).not.toBeNull();
    const fromTrigger = m![1].split(",").map((x) => x.trim().replace(/'/g, ""));
    expect(fromTrigger.sort()).toEqual([...TERMINAL_STATUSES].sort());
    for (const s of TERMINAL_STATUSES) expect(isTerminal(s)).toBe(true);
  });

  it("in-flight statuses are the ones recipients can act in", () => {
    for (const s of ENVELOPE_STATUSES) expect(isInFlight(s)).toBe(IN_FLIGHT_STATUSES.includes(s));
    expect(isInFlight("DRAFT")).toBe(false);
  });

  it("has no self-transitions and rejects illegal ones with a clear WorkflowError", () => {
    for (const s of ENVELOPE_STATUSES) expect(canTransition(s, s)).toBe(false);
    expect(() => assertTransition("COMPLETED", "VOIDED")).toThrow(WorkflowError);
    expect(() => assertTransition("COMPLETED", "VOIDED")).toThrow("An envelope that is completed cannot become voided.");
    expect(() => assertTransition("DRAFT", "COMPLETED")).toThrow(/draft cannot become completed/);
    expect(canTransition("PARTIALLY_SIGNED", "OUT_FOR_SIGNATURE")).toBe(false);
  });
});

describe("recipient transition map", () => {
  const r = (status: string, action: string) => ({ status, action });

  it("covers every recipient status", () => {
    expect(Object.keys(RECIPIENT_TRANSITIONS).sort()).toEqual([...RECIPIENT_STATUSES].sort());
  });

  it("requires a verified email (VIEWED) before any approval, signature or decline", () => {
    for (const to of ["APPROVED", "SIGNED", "DECLINED"] as const) {
      expect(canRecipientTransition(r("PENDING", "SIGN"), to)).toBe(false);
      expect(canRecipientTransition(r("SENT", "SIGN"), to)).toBe(false);
    }
    expect(canRecipientTransition(r("PENDING", "SIGN"), "SENT")).toBe(true);
    expect(canRecipientTransition(r("SENT", "SIGN"), "VIEWED")).toBe(true);
  });

  it("each action can only finish with its own status", () => {
    expect(canRecipientTransition(r("VIEWED", "REVIEW"), "APPROVED")).toBe(true);
    expect(canRecipientTransition(r("VIEWED", "REVIEW"), "SIGNED")).toBe(false);
    expect(canRecipientTransition(r("VIEWED", "SIGN"), "SIGNED")).toBe(true);
    expect(canRecipientTransition(r("VIEWED", "SIGN"), "APPROVED")).toBe(false);
    expect(canRecipientTransition(r("VIEWED", "WITNESS"), "SIGNED")).toBe(true);
    for (const a of ["REVIEW", "SIGN", "WITNESS"]) expect(canRecipientTransition(r("VIEWED", a), "DECLINED")).toBe(true);
  });

  it("copies only ever receive a link", () => {
    expect(canRecipientTransition(r("PENDING", "CC"), "SENT")).toBe(true);
    expect(canRecipientTransition(r("SENT", "CC"), "VIEWED")).toBe(false);
    expect(canRecipientTransition(r("VIEWED", "CC"), "SIGNED")).toBe(false);
  });

  it("finished recipients never change again", () => {
    for (const from of ["APPROVED", "SIGNED", "DECLINED"]) {
      for (const to of RECIPIENT_STATUSES) expect(canRecipientTransition(r(from, "SIGN"), to)).toBe(false);
    }
    expect(() => assertRecipientTransition(r("SIGNED", "SIGN"), "DECLINED")).toThrow(WorkflowError);
    expect(() => assertRecipientTransition(r("VIEWED", "BOGUS"), "SIGNED")).toThrow(WorkflowError);
  });
});

describe("action and role rules", () => {
  it("define every action and role from the schema enums", () => {
    expect(Object.keys(ACTION_RULES).sort()).toEqual([...RECIPIENT_ACTIONS].sort());
    expect(Object.keys(ROLE_RULES).sort()).toEqual([...ROLE_LABELS].sort());
  });

  it("are internally consistent", () => {
    for (const rule of Object.values(ACTION_RULES)) {
      if (rule.actionable) {
        expect(rule.completesAs).not.toBeNull();
        expect(DONE_RECIPIENT_STATUSES).toContain(rule.completesAs);
        expect(rule.verb).not.toBeNull();
        expect(rule.authMethod).toBe("email_otp");
      } else {
        expect(rule.completesAs).toBeNull();
        expect(rule.phase).toBe("copy");
      }
    }
    expect(Object.values(ACTION_RULES).some((x) => x.phase === "signers")).toBe(true);
  });
});

describe("one writer for status columns", () => {
  it("only state.ts sets envelopes.status or recipients.status", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(here)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts") || f === "state.ts") continue;
      const src = readFileSync(path.join(here, f), "utf8");
      // Any .set({...}) whose object mentions a status key.
      for (const m of src.matchAll(/\.set\(\{([^}]*)\}/g)) {
        if (/\bstatus\s*[:,}]/.test(m[1]) || /^\s*status\s*$/.test(m[1])) offenders.push(`${f}: .set({${m[1].trim().slice(0, 60)}})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("undelivered links", () => {
  it("flags a recipient whose newest link email failed, and clears it after a fresh link is delivered", () => {
    const ev = (seq: number, type: string, recipientId: string | null, kind?: string) => ({ seq, type, recipientId, data: kind ? { kind } : null });
    const trail = [
      ev(1, "recipient.notified", "a"),
      ev(2, "recipient.notified", "b"),
      ev(3, "email.failed", "a", "initial"),
      ev(4, "email.failed", null, "declined_notice"),
    ];
    expect(undeliveredRecipientIds(trail)).toEqual(["a"]);
    expect(undeliveredRecipientIds([...trail, ev(5, "recipient.notified", "a")])).toEqual([]);
    // A failed cancellation notice is reported in the trail but is not a missing link.
    expect(undeliveredRecipientIds([ev(1, "recipient.notified", "c"), ev(2, "email.failed", "c", "voided")])).toEqual([]);
  });
});
