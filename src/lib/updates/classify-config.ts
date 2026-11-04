// Every keyword list the legal-updates classifier uses, in one place. To follow a new
// subject or act, add words here; classify.ts only compiles and applies them.
//
// Terms are regular-expression fragments matched as whole words, case-insensitively
// unless listed under a "caseSensitive" key; a plain space stands for any whitespace.
// Acts in the corpus are already recognised by their built-in abbreviations
// (src/lib/corpus/acts.ts) and, for acts added by an admin, by their short title; add
// other names for an act (abbreviations, popular names) under actAliases.
// Pure data, safe for client and server.

import type { UpdateKind } from "./types";

export type ClassifierConfig = {
  /** Kinds that are legislation: these become "high" when they touch a watched subject. */
  legislativeKinds: readonly UpdateKind[];
  subjects: {
    /** Criminal law by name or subject. Kept narrow so ordinary news does not match. */
    criminal: readonly string[];
    constitution: readonly string[];
    courts: readonly string[];
  };
  supremeCourt: { words: readonly string[]; caseSensitive: readonly string[] };
  highCourt: { words: readonly string[]; caseSensitive: readonly string[] };
  /** Larger-bench and landmark wording: a Supreme Court ruling with these in the headline can be "high". */
  landmark: readonly string[];
  /** Kind detection from the headline. */
  kinds: {
    ordinance: readonly string[];
    /** "Bill", "Bill, 2026"… */
    bill: readonly string[];
    /** Phrases with "bill" that are not legislation ("bill of exchange"). */
    notBill: readonly string[];
    /** Legislative notifications (S.O./G.S.R. numbers, commencement, gazette). */
    notification: readonly string[];
    /** In news headlines: words that signal a notification… */
    newsNotification: readonly string[];
    /** …when the headline is also about one of these. */
    newsNotificationObject: readonly string[];
    /** Source categories (e.g. PRS status "Rules") that make a legislative item a notification. */
    notificationCategory: readonly string[];
    /** Rules and regulations ("… Rules, 2026"). */
    rules: readonly string[];
    /** Matched as written: no automatic word boundaries, so "(Amendment)" can match. */
    amendment: readonly string[];
    act: readonly string[];
  };
  /** Extra names for acts in the corpus, by act id: { NDPS: ["ndps act", "narcotic drugs and psychotropic substances act"] }. */
  actAliases: Readonly<Record<string, readonly string[]>>;
  /** Text that looks like an act mention but is another act (checked just before the mention). */
  notActs: readonly { actId: string; pattern: string }[];
  /** Admin-added acts are matched by short title only when it is at least this long (avoids "Act" matching everything). */
  minShortTitleLength: number;
  /** Subject tags added to items (shown as filters and used in importance). */
  tags: { criminal: string; constitution: string; supremeCourt: string; highCourt: string; largerBench: string };
};

export const CLASSIFIER_CONFIG: ClassifierConfig = {
  legislativeKinds: ["act", "amendment", "bill", "ordinance", "notification"],
  subjects: {
    criminal: [
      "criminal",
      "penal",
      "bharatiya (?:nyaya|nagarik suraksha|sakshya)",
      "nyaya sanhita",
      "suraksha sanhita",
      "sakshya adhiniyam",
      "i\\.?p\\.?c",
      "cr\\.?p\\.?c",
      "bnss?",
      "evidence",
      "offences?",
      "narcotic",
      "ndps",
      "pocso",
      "unlawful activities",
      "uapa",
      "money[-\\s]laundering",
      "pmla",
      "bail",
      "terroris[mt]",
    ],
    constitution: ["constitution(?:al)?"],
    courts: ["supreme court", "high courts?", "courts?", "judges?", "judiciary", "judicial", "tribunals?"],
  },
  supremeCourt: { words: ["supreme court", "apex court"], caseSensitive: ["SC", "CJI"] },
  highCourt: { words: ["high courts?"], caseSensitive: ["HC"] },
  landmark: [
    "constitution(?:al)? bench",
    "(?:five|seven|nine|5|7|9)[-\\s]judges?['’]? bench",
    "larger bench",
    "full bench",
    "landmark",
    "overrul(?:es|ed|ing)",
    "reference answered",
  ],
  kinds: {
    ordinance: ["ordinance"],
    bill: ["bill,?\\s*(?:\\d{4})?"],
    notBill: ["bill of (?:exchange|lading|entry|costs?)"],
    notification: ["notification", "notif(?:y|ies|ied)", "commencement", "S\\.O\\.\\s*\\d+", "G\\.S\\.R\\.\\s*\\d+", "gazette"],
    newsNotification: ["notif(?:y|ies|ied|ication)", "gazette", "comes? into force", "brought into force"],
    newsNotificationObject: ["act", "rules?", "section", "code", "sanhita"],
    notificationCategory: ["rules"],
    rules: ["rules?,?\\s*\\d{4}", "regulations?,?\\s*\\d{4}"],
    amendment: ["\\(amendment\\)", "\\bamendment\\s+act\\b", "\\bamendment\\b.*\\bact\\b"],
    act: ["act,?\\s*\\d{4}"],
  },
  actAliases: {},
  notActs: [{ actId: "IEA", pattern: "bankers['’]?\\s*books\\s+evidence" }],
  minShortTitleLength: 10,
  tags: { criminal: "criminal-law", constitution: "constitution", supremeCourt: "supreme-court", highCourt: "high-court", largerBench: "larger-bench" },
};

/** Whole-word, case-insensitive alternation of config terms (a space matches any whitespace). */
export function termsRegex(terms: readonly string[], opts: { caseSensitive?: boolean; wordBoundary?: boolean } = {}): RegExp {
  // A term that matches nothing keeps an empty list from matching everything.
  const body = terms.length ? terms.map((t) => t.replace(/ /g, "\\s+")).join("|") : "(?!)";
  const b = opts.wordBoundary === false ? "" : "\\b";
  return new RegExp(`${b}(?:${body})${b}`, opts.caseSensitive ? "" : "i");
}
