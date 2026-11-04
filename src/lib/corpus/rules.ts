// Which criminal code governs, by date. Safe for client and server.
//
// Substantive law (IPC ↔ BNS): the law in force when the act was committed applies.
// Article 20(1) of the Constitution bars punishment under a law that was not in force
// at the time, and BNS s. 358(2) saves the IPC for earlier offences.
//
// Procedure (CrPC ↔ BNSS) and evidence (IEA ↔ BSA): what matters is whether the
// proceeding was already pending on 1 July 2024. BNSS s. 531(2)(a) and BSA s. 170(2)
// keep pending appeals, applications, trials, inquiries and investigations under the
// old law; proceedings begun on or after that date follow the new law.
import type { CodeFamily } from "./acts";

export const NEW_CODES_COMMENCEMENT = "2024-07-01";

const COMMENCEMENT_MS = Date.parse(`${NEW_CODES_COMMENCEMENT}T00:00:00+05:30`);

/** Parses "YYYY-MM-DD" as a date in India (IST). Returns null for anything else. */
export function parseIndianDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00+05:30`);
  return Number.isNaN(ms) ? null : new Date(ms);
}

export function isBeforeNewCodes(date: Date) {
  return date.getTime() < COMMENCEMENT_MS;
}

export type GoverningResult = {
  code: "IPC" | "BNS" | "CRPC" | "BNSS" | "IEA" | "BSA";
  isOldCode: boolean;
  headline: string;
  reason: string;
  /** Provision that supports the rule, for linking. */
  authority: { actId: "BNS" | "BNSS" | "BSA"; sectionNo: string; label: string };
};

const FMT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export function governingCode(family: CodeFamily, date: Date): GoverningResult {
  const before = isBeforeNewCodes(date);
  const when = FMT.format(date);
  if (family === "substantive") {
    return before
      ? {
          code: "IPC",
          isOldCode: true,
          headline: `Indian Penal Code applies (offence on ${when})`,
          reason:
            "The offence was committed before 1 July 2024, so the IPC applies. Article 20(1) of the Constitution allows a conviction only for breaking a law in force when the act was done, and no greater penalty than that law allowed; section 358(2) of the BNS preserves liability and proceedings under the IPC for offences committed before its repeal.",
          authority: { actId: "BNS", sectionNo: "358", label: "BNS s. 358 (repeal and savings)" },
        }
      : {
          code: "BNS",
          isOldCode: false,
          headline: `Bharatiya Nyaya Sanhita applies (offence on ${when})`,
          reason: "The offence was committed on or after 1 July 2024, when the BNS came into force and the IPC was repealed.",
          authority: { actId: "BNS", sectionNo: "358", label: "BNS s. 358 (repeal and savings)" },
        };
  }
  if (family === "procedure") {
    return before
      ? {
          code: "CRPC",
          isOldCode: true,
          headline: `CrPC applies if the proceeding was pending before 1 July 2024`,
          reason: `You entered ${when}. Under section 531(2)(a) of the BNSS, an appeal, application, trial, inquiry or investigation that was already pending immediately before 1 July 2024 continues under the CrPC. Procedure follows the date the proceeding began, not the date of the offence, so a proceeding started on or after 1 July 2024 follows the BNSS even for an earlier offence.`,
          authority: { actId: "BNSS", sectionNo: "531", label: "BNSS s. 531 (repeal and savings)" },
        }
      : {
          code: "BNSS",
          isOldCode: false,
          headline: `BNSS applies (proceeding from ${when})`,
          reason: "Proceedings begun on or after 1 July 2024 follow the Bharatiya Nagarik Suraksha Sanhita. Only proceedings already pending before that date continue under the CrPC (BNSS s. 531(2)(a)).",
          authority: { actId: "BNSS", sectionNo: "531", label: "BNSS s. 531 (repeal and savings)" },
        };
  }
  return before
    ? {
        code: "IEA",
        isOldCode: true,
        headline: `Indian Evidence Act applies if the proceeding was pending before 1 July 2024`,
        reason: `You entered ${when}. Under section 170(2) of the BSA, an application, trial, inquiry, investigation, proceeding or appeal pending immediately before 1 July 2024 is dealt with under the Indian Evidence Act. Proceedings begun on or after that date follow the BSA.`,
        authority: { actId: "BSA", sectionNo: "170", label: "BSA s. 170 (repeal and savings)" },
      }
    : {
        code: "BSA",
        isOldCode: false,
        headline: `Bharatiya Sakshya Adhiniyam applies (proceeding from ${when})`,
        reason: "Proceedings begun on or after 1 July 2024 follow the Bharatiya Sakshya Adhiniyam. Only proceedings already pending before that date stay under the Indian Evidence Act (BSA s. 170(2)).",
        authority: { actId: "BSA", sectionNo: "170", label: "BSA s. 170 (repeal and savings)" },
      };
}

/** Label for the date input, per family. */
export function dateQuestion(family: CodeFamily) {
  return family === "substantive" ? "Date of the offence" : "Date the proceeding began (FIR, complaint or case)";
}
