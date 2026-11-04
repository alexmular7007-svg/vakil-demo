// Case citations and case names: finding them in text, normalising them, matching
// them to library records, and ranking retrieved paragraphs. Pure functions, safe
// for client and server (and unit tests).

/* ------------------------------- citations ------------------------------- */

const REPORTERS: RegExp[] = [
  /\(\s*(?:19|20)\d{2}\s*\)\s*(?:Supp\.?\s*)?\d{0,3}\s*SCC(?:\s*\(Cri\))?\s+\d{1,5}/g, // (2014) 8 SCC 273
  /\b(?:19|20)\d{2}\s+SCC\s+OnLine\s+[A-Z][A-Za-z]*\s+\d{1,6}/g, // 2023 SCC OnLine SC 123
  /\b(?:19|20)\d{2}\s*INSC\s*\d{1,5}/g, // 2024 INSC 735
  /\[\s*(?:19|20)\d{2}\s*\]\s*(?:\d{1,2}\s*)?(?:Supp\.?\s*)?S\.?\s?C\.?\s?R\.?\s*\d{1,4}/g, // [2024] 10 S.C.R. 108
  /\(\s*(?:19|20)\d{2}\s*\)\s*\d{1,2}\s*SCR\s+\d{1,4}/g, // (2007) 3 SCR 507
  /\bAIR\s+(?:19|20)\d{2}\s+[A-Z][A-Za-z]*\s+\d{1,5}/g, // AIR 1980 SC 898
  /\(?\b(?:19|20)\d{2}\)?\s+(?:\d{1,3}\s+)?(?:Cri\s?L\.?\s?J\.?|SCALE)\s+\d{1,5}/g, // 2019 CriLJ 123
  /\b20\d{2}:[A-Z]{2,6}(?:-[A-Z]{2,5})?:\d{1,6}(?:-DB)?\b/g, // 2024:DHC:1234 (High Court neutral)
];

/** Reporter and neutral citations found in text, in order of appearance, without duplicates. */
export function findCitations(text: string): string[] {
  const hits: { at: number; text: string }[] = [];
  for (const re of REPORTERS) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags))) {
      const t = m[0].trim();
      const at = m.index ?? 0;
      if (hits.some((h) => at < h.at + h.text.length && at + t.length > h.at)) continue;
      hits.push({ at, text: t });
    }
  }
  const seen = new Set<string>();
  return hits
    .sort((a, b) => a.at - b.at)
    .map((h) => h.text)
    .filter((t) => {
      const k = citationKey(t);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** "(2014) 8 SCC 273" and "[2014] 8 S.C.C. 273" → "20148SCC273". */
export function citationKey(citation: string): string {
  return citation.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Keys for every citation stored in a judgment's citation field ("2024 INSC 735; [2024] 10 S.C.R. 108"). */
export function citationKeys(field: string | null | undefined): string[] {
  if (!field) return [];
  const keys = new Set<string>();
  for (const part of field.split(/[;|\n]+/)) {
    const k = citationKey(part);
    if (k.length >= 6) keys.add(k);
  }
  for (const c of findCitations(field)) keys.add(citationKey(c));
  return [...keys];
}

/* ------------------------------- case names ------------------------------- */

// "Arnesh Kumar v. State of Bihar", "X vs. Y", "X versus Y"
// The second party stops before "and" unless it is "and Ors." / "and Another", so
// "A v. State of Bihar and B v. C" gives two cases.
const CASE_NAME =
  /\b([A-Z][\w.'&@-]*(?:\s+(?:@\s+)?[A-Z][\w.'&-]*){0,5})\s+(?:v\.|vs\.?|versus)\s+((?:the\s+)?[A-Z][\w.'&-]*(?:\s+(?:of|the|for|[A-Z][\w.'&-]*)){0,6})(?:\s+(?:and|&)\s+(?:Ors|Others|Anr|Another)\b\.?)?/g;
const NOT_A_PARTY = /^(?:Section|Sec|The|In|Under|Article|See|Also|Cf|And|But|Per|As|Held|Para)$/i;
const PARTY_SUFFIX = /\s+(?:&|and)\s+(?:ors|others|anr|another|etc)\.?$|\s+(?:ors|anr|etc)\.?$/i;
const GENERIC = new Set(["state", "union", "india", "of", "the", "and", "ors", "anr", "others", "another", "govt", "government", "mr", "mrs", "ms", "shri", "smt", "sri"]);

export type CaseName = { text: string; first: string; second: string };

/** Lower-case party name without punctuation, "The", or "& Ors." / "Anr." suffixes. */
export function partyKey(party: string): string {
  return party
    .toLowerCase()
    .replace(/[.,'’"“”()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(PARTY_SUFFIX, "")
    .replace(/^the\s+/, "")
    .trim();
}

/** Splits "A v. B" into party keys; null when it is not a usable case name. */
export function parseCaseName(name: string): CaseName | null {
  const m = /^(.+?)\s+(?:v\.?|vs\.?|versus)\s+(.+)$/i.exec(name.replace(/\s+/g, " ").trim());
  if (!m) return null;
  const first = partyKey(m[1]);
  const second = partyKey(m[2]);
  if (first.length < 3 || second.length < 3) return null;
  const words = `${first} ${second}`.split(" ");
  if (!words.some((w) => w.length >= 4 && !GENERIC.has(w))) return null;
  return { text: name.trim(), first, second };
}

/** Case names ("A v. B") mentioned in text. */
export function findCaseNames(text: string): CaseName[] {
  const out: CaseName[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(new RegExp(CASE_NAME.source, CASE_NAME.flags))) {
    let left = m[1];
    // Drop a leading connective picked up by the regex: "See Arnesh Kumar" → "Arnesh Kumar".
    const words = left.split(/\s+/);
    while (words.length > 1 && NOT_A_PARTY.test(words[0])) words.shift();
    left = words.join(" ");
    if (NOT_A_PARTY.test(left)) continue;
    const right = m[2].replace(/\s+(?:of|the|for)$/i, "");
    const parsed = parseCaseName(`${left} v. ${right}`);
    if (!parsed) continue;
    const k = `${parsed.first}|${parsed.second}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(parsed);
  }
  return out;
}

/** True when a judgment's title (or parties line) is the named case, ignoring case, punctuation and "& Ors.". */
export function titleMatchesCaseName(title: string, ref: CaseName): boolean {
  const t = title
    .toLowerCase()
    .replace(/\s+(?:versus|vs\.?|v\.?)\s+/g, " ⟂ ")
    .replace(/[.,'’"“”()[\]]/g, " ")
    .replace(/\s+/g, " ");
  const [left, right] = t.split(" ⟂ ");
  if (!right) return false;
  const l = ` ${partyKey(left)} `;
  const r = ` ${partyKey(right)} `;
  return l.includes(` ${ref.first} `) && r.includes(` ${ref.second} `);
}

/** The longest distinctive word of a party key, used to narrow the database lookup. */
export function anchorWord(party: string): string {
  const words = party.split(" ").filter((w) => w.length >= 3 && !GENERIC.has(w));
  return (words.length ? words : party.split(" ")).sort((a, b) => b.length - a.length)[0] ?? party;
}

/* ------------------------------- retrieval ------------------------------- */

const STOP = new Set(
  (
    "a an and are as at be been being but by can could did do does for from had has have how i if in into is it its may me might " +
    "must my no not of on or our shall should so such than that the their them then there these they this those to under upon " +
    "was we were what when where whether which while who whom why will with would you your about against any also between both " +
    "each more most other same some very " +
    // too common in Indian judgments to help ranking
    "court courts case cases law laws section sections act acts india indian judgment judgments held hold order orders please " +
    "explain tell give list detail details question answer state supreme high hon ble learned counsel"
  ).split(" "),
);

/** Distinctive words of a question for a ranked OR search (at most `max`). */
export function significantTerms(question: string, max = 12): string[] {
  const out: string[] = [];
  for (const raw of question.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || STOP.has(raw)) continue;
    const isNumber = /^\d+$/.test(raw);
    if (isNumber ? raw.length < 2 || raw.length > 4 : raw.length < 3) continue;
    if (!/^[a-z0-9]+$/.test(raw) || out.includes(raw)) continue;
    out.push(raw);
    if (out.length >= max) break;
  }
  return out;
}

/** "bail | anticipatory | 438" for to_tsquery; null when there is nothing to search. */
export function orTsQuery(terms: string[]): string | null {
  const safe = terms.filter((t) => /^[a-z0-9]+$/.test(t));
  return safe.length ? safe.join(" | ") : null;
}

/** How many of the terms occur in the text (crude stemming: "murdered" counts for "murder"). */
export function termCoverage(text: string, terms: string[]): number {
  const t = text.toLowerCase();
  return terms.filter((term) => t.includes(term.length > 5 ? term.slice(0, term.length - 2) : term)).length;
}

export type ParaCandidate = {
  judgmentId: string;
  paraNo: number;
  text: string;
  score: number;
  /** Found because the question named this case or its citation. */
  exact?: boolean;
};

/** Terms a ranked paragraph must contain: half the question's terms, at least 2 and at most 4. */
export function requiredCoverage(termCount: number): number {
  return Math.min(termCount, Math.max(2, Math.min(4, Math.ceil(termCount / 2))));
}

/**
 * Chooses the paragraphs to give the model: exact case matches first, then by
 * score; ranked hits must contain enough of the question's terms (see
 * requiredCoverage); at most `perJudgment` paragraphs from any one judgment.
 */
export function pickParagraphs<T extends ParaCandidate>(
  candidates: T[],
  opts: { limit: number; perJudgment?: number; terms?: string[]; minCoverage?: number },
): T[] {
  const per = opts.perJudgment ?? 2;
  const terms = opts.terms ?? [];
  const min = Math.min(opts.minCoverage ?? requiredCoverage(terms.length), terms.length);
  const sorted = [...candidates].sort((a, b) => Number(Boolean(b.exact)) - Number(Boolean(a.exact)) || b.score - a.score);
  const seen = new Set<string>();
  const count = new Map<string, number>();
  const out: T[] = [];
  for (const c of sorted) {
    if (out.length >= opts.limit) break;
    const key = `${c.judgmentId}:${c.paraNo}`;
    if (seen.has(key)) continue;
    if (!c.exact && termCoverage(c.text, terms) < min) continue;
    if ((count.get(c.judgmentId) ?? 0) >= per) continue;
    seen.add(key);
    count.set(c.judgmentId, (count.get(c.judgmentId) ?? 0) + 1);
    out.push(c);
  }
  return out;
}

/** Source label for the model and the citation list: case, court, date, citation and paragraph. */
export function judgmentLabel(j: { title: string; court: string; decidedOn: string | null; citation: string | null }, paraNo: number) {
  const date = j.decidedOn ? formatDecided(j.decidedOn) : null;
  const cite = j.citation?.split(/;\s*/)[0];
  return `${j.title} (${j.court}${date ? `, decided ${date}` : ""})${cite ? `, ${cite}` : ""}, ${paraNo === 0 ? "headnote / cause title" : `para ${paraNo}`}`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "2024-09-25" → "25 Sept 2024" without timezone drift. */
export function formatDecided(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return DATE_FMT.format(new Date(`${iso}T00:00:00Z`));
}
