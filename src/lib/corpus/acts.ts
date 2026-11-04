// Act identifiers, names and aliases. Safe for client and server.

export const ACT_IDS = ["BNS", "BNSS", "BSA", "IPC", "CRPC", "IEA", "NIA", "HMA", "CPA", "RTI"] as const;
export type ActId = (typeof ACT_IDS)[number];

export type ActInfo = {
  id: ActId;
  /** URL segment, e.g. /law/bns */
  slug: string;
  /** How lawyers write it: "BNS", "CrPC" */
  abbr: string;
  shortTitle: string;
  title: string;
  year: number;
};

export const ACT_INFO: Record<ActId, ActInfo> = {
  BNS: { id: "BNS", slug: "bns", abbr: "BNS", shortTitle: "Bharatiya Nyaya Sanhita", title: "The Bharatiya Nyaya Sanhita, 2023", year: 2023 },
  BNSS: { id: "BNSS", slug: "bnss", abbr: "BNSS", shortTitle: "Bharatiya Nagarik Suraksha Sanhita", title: "The Bharatiya Nagarik Suraksha Sanhita, 2023", year: 2023 },
  BSA: { id: "BSA", slug: "bsa", abbr: "BSA", shortTitle: "Bharatiya Sakshya Adhiniyam", title: "The Bharatiya Sakshya Adhiniyam, 2023", year: 2023 },
  IPC: { id: "IPC", slug: "ipc", abbr: "IPC", shortTitle: "Indian Penal Code", title: "The Indian Penal Code, 1860", year: 1860 },
  CRPC: { id: "CRPC", slug: "crpc", abbr: "CrPC", shortTitle: "Code of Criminal Procedure", title: "The Code of Criminal Procedure, 1973", year: 1973 },
  IEA: { id: "IEA", slug: "iea", abbr: "Evidence Act", shortTitle: "Indian Evidence Act", title: "The Indian Evidence Act, 1872", year: 1872 },
  NIA: { id: "NIA", slug: "ni-act", abbr: "NI Act", shortTitle: "Negotiable Instruments Act", title: "The Negotiable Instruments Act, 1881", year: 1881 },
  HMA: { id: "HMA", slug: "hma", abbr: "HMA", shortTitle: "Hindu Marriage Act", title: "The Hindu Marriage Act, 1955", year: 1955 },
  CPA: { id: "CPA", slug: "consumer-protection-act", abbr: "CPA", shortTitle: "Consumer Protection Act", title: "The Consumer Protection Act, 2019", year: 2019 },
  RTI: { id: "RTI", slug: "rti-act", abbr: "RTI Act", shortTitle: "Right to Information Act", title: "The Right to Information Act, 2005", year: 2005 },
};

/** Old code ↔ new code pairs covered by the NCRB correspondence tables. */
export const CODE_PAIRS = [
  { old: "IPC", new: "BNS", family: "substantive", label: "IPC ↔ BNS", subject: "Offences and punishments" },
  { old: "CRPC", new: "BNSS", family: "procedure", label: "CrPC ↔ BNSS", subject: "Criminal procedure" },
  { old: "IEA", new: "BSA", family: "evidence", label: "Evidence Act ↔ BSA", subject: "Evidence" },
] as const satisfies readonly { old: ActId; new: ActId; family: string; label: string; subject: string }[];

export type CodePair = (typeof CODE_PAIRS)[number];
export type CodeFamily = CodePair["family"];

export function pairFor(actId: string): CodePair | null {
  return CODE_PAIRS.find((p) => p.old === actId || p.new === actId) ?? null;
}

export function isActId(v: string): v is ActId {
  return (ACT_IDS as readonly string[]).includes(v);
}

export function actBySlug(slug: string): ActInfo | null {
  return Object.values(ACT_INFO).find((a) => a.slug === slug.toLowerCase()) ?? null;
}

// Order matters: longer / more specific names first (BNSS before BNS).
const ALIASES: [RegExp, ActId][] = [
  [/\bb\.?n\.?s\.?s\b\.?|bharatiya\s+nagarik\s+suraksha(\s+sanhita)?|nagarik\s+suraksha\s+sanhita/i, "BNSS"],
  [/\bb\.?n\.?s\b\.?|bharatiya\s+nyaya(\s+sanhita)?|nyaya\s+sanhita/i, "BNS"],
  [/\bb\.?s\.?a\b\.?|bharatiya\s+sakshya(\s+adhiniyam)?|sakshya\s+adhiniyam/i, "BSA"],
  [/\bi\.?p\.?c\b\.?|indian\s+penal\s+code|\bpenal\s+code\b/i, "IPC"],
  [/\bcr\.?\s?p\.?c\b\.?|code\s+of\s+criminal\s+procedure|criminal\s+procedure\s+code/i, "CRPC"],
  [/\bi\.e\.a\b\.?|\biea\b|indian\s+evidence\s+act|\bevidence\s+act\b/i, "IEA"],
  [/\bn\.?i\.?\s?act\b|negotiable\s+instruments?(\s+act)?/i, "NIA"],
  [/\bh\.?m\.?a\b\.?|hindu\s+marriage(\s+act)?/i, "HMA"],
  [/\bc\.?p\.?a\b\.?|consumer\s+protection(\s+act)?/i, "CPA"],
  [/\br\.?t\.?i\b\.?(\s+act)?|right\s+to\s+information(\s+act)?/i, "RTI"],
];

/** Finds act mentions in free text with their positions (non-overlapping, left to right). */
export function findActMentions(text: string): { actId: ActId; start: number; end: number }[] {
  const out: { actId: ActId; start: number; end: number }[] = [];
  for (const [re, id] of ALIASES) {
    const g = new RegExp(re.source, "gi");
    for (const m of text.matchAll(g)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (out.some((o) => start < o.end && end > o.start)) continue;
      out.push({ actId: id, start, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** "CrPC", "Cr.P.C.", "crpc", "Code of Criminal Procedure" → "CRPC". */
export function normaliseActId(input: string): ActId | null {
  const up = input.trim().toUpperCase();
  if (isActId(up)) return up;
  return findActMentions(input)[0]?.actId ?? null;
}

export function sectionLabel(actId: ActId, sectionNo: string) {
  return `${ACT_INFO[actId].abbr} s. ${sectionNo}`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Formats a date-only ISO string ("2024-07-01") without timezone drift. */
export function formatActDate(iso: string | null | undefined) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  return DATE_FMT.format(new Date(`${iso}T00:00:00Z`));
}
