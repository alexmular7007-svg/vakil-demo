// Classifies an entry from any source: what kind of legal change it is, which acts it
// touches, and whether it is important enough for a pop-up. The keyword lists live in
// classify-config.ts (one place to add subjects, act names and wording); this file
// compiles them once and applies the rules. Pure functions, no I/O.
import { findActMentions } from "@/lib/corpus/acts";
import { CLASSIFIER_CONFIG, termsRegex, type ClassifierConfig } from "./classify-config";
import type { KnownAct, RawEntry, UpdateKind } from "./types";

export type Classification = {
  kind: UpdateKind;
  acts: string[];
  importance: "high" | "normal";
  tags: string[];
};

type Compiled = ReturnType<typeof compile>;

function compile(c: ClassifierConfig) {
  return {
    config: c,
    legislative: new Set<UpdateKind>(c.legislativeKinds),
    criminal: termsRegex(c.subjects.criminal),
    constitution: termsRegex(c.subjects.constitution),
    courts: termsRegex(c.subjects.courts),
    scWords: termsRegex(c.supremeCourt.words),
    scAbbr: termsRegex(c.supremeCourt.caseSensitive, { caseSensitive: true }),
    hcWords: termsRegex(c.highCourt.words),
    hcAbbr: termsRegex(c.highCourt.caseSensitive, { caseSensitive: true }),
    landmark: termsRegex(c.landmark),
    ordinance: termsRegex(c.kinds.ordinance),
    bill: termsRegex(c.kinds.bill),
    notBill: termsRegex(c.kinds.notBill),
    notification: termsRegex(c.kinds.notification),
    newsNotification: termsRegex(c.kinds.newsNotification),
    newsNotificationObject: termsRegex(c.kinds.newsNotificationObject),
    notificationCategory: termsRegex(c.kinds.notificationCategory),
    rules: termsRegex(c.kinds.rules),
    amendment: termsRegex(c.kinds.amendment, { wordBoundary: false }),
    act: termsRegex(c.kinds.act),
    aliases: Object.entries(c.actAliases).map(([id, names]) => ({ id, re: termsRegex(names) })),
    notActs: c.notActs.map((n) => ({ actId: n.actId, re: new RegExp(n.pattern, "i") })),
  };
}

let compiled: Compiled = compile(CLASSIFIER_CONFIG);

/** Replaces the active configuration (tests, or trying a new subject before it ships). Returns the previous one. */
export function setClassifierConfig(config: ClassifierConfig): ClassifierConfig {
  const prev = compiled.config;
  compiled = compile(config);
  return prev;
}

const mentionsSupremeCourt = (s: string, k: Compiled = compiled) => k.scWords.test(s) || k.scAbbr.test(s);

/** Kind from wording, when the source did not say. `fallback` is the source's default. */
export function detectKind(title: string, text: string, categories: string[], fallback: UpdateKind): UpdateKind {
  const k = compiled;
  const t = title;
  const cats = categories.join(" | ");
  if (k.ordinance.test(t)) return "ordinance";
  if (k.bill.test(t) && !k.notBill.test(t)) return "bill";
  if (fallback === "news" || fallback === "judgment") {
    // Reports of a ruling by a Supreme Court constitution or larger bench are judgments.
    if (mentionsSupremeCourt(t) && k.landmark.test(t)) return "judgment";
    if (k.newsNotification.test(t) && k.newsNotificationObject.test(t)) return "notification";
    return fallback;
  }
  if (k.notification.test(t) || k.notificationCategory.test(cats)) return "notification";
  if (k.rules.test(t)) return "notification";
  if (k.amendment.test(t)) return "amendment";
  if (k.act.test(t)) return "act";
  return fallback;
}

/** Act ids mentioned in the text: the built-in aliases (BNS, IPC, CrPC…), configured aliases, and any act by short title. */
export function detectActs(text: string, known: KnownAct[] = []): string[] {
  const k = compiled;
  const ids = new Set<string>();
  for (const m of findActMentions(text)) {
    const before = text.slice(Math.max(0, m.start - 20), m.end);
    if (k.notActs.some((n) => n.actId === m.actId && n.re.test(before))) continue;
    ids.add(m.actId);
  }
  for (const a of k.aliases) if (a.re.test(text)) ids.add(a.id);
  const lower = text.toLowerCase();
  for (const a of known) {
    const name = a.shortTitle.trim().toLowerCase();
    if (name.length >= k.config.minShortTitleLength && lower.includes(name)) ids.add(a.id);
  }
  // Only acts the app knows about can be linked; others stay as tags.
  const knownIds = new Set(known.map((a) => a.id));
  return [...ids].filter((id) => !known.length || knownIds.has(id)).sort();
}

function subjectTags(text: string): string[] {
  const k = compiled;
  const tags = k.config.tags;
  const out: string[] = [];
  if (k.criminal.test(text)) out.push(tags.criminal);
  if (k.constitution.test(text)) out.push(tags.constitution);
  if (mentionsSupremeCourt(text)) out.push(tags.supremeCourt);
  else if (k.hcWords.test(text) || k.hcAbbr.test(text)) out.push(tags.highCourt);
  if (k.landmark.test(text)) out.push(tags.largerBench);
  return out;
}

/**
 * Importance rule:
 *  - high: a bill, act, amendment, ordinance or notification touching criminal law, a
 *    tracked act, the Constitution, or the courts; or a Supreme Court constitution-bench /
 *    larger-bench / landmark ruling;
 *  - normal: everything else.
 */
export function classify(entry: Pick<RawEntry, "title" | "summary" | "categories" | "kind">, fallback: UpdateKind, known: KnownAct[] = []): Classification {
  const k = compiled;
  const text = `${entry.title} ${entry.summary ?? ""}`;
  const kind = entry.kind ?? detectKind(entry.title, entry.summary ?? "", entry.categories, fallback);
  const acts = detectActs(text, known);
  const tags = subjectTags(`${text} ${entry.categories.join(" ")}`);
  const trackedIds = new Set(known.filter((a) => a.tracked).map((a) => a.id));
  const touchesTracked = acts.some((id) => (known.length ? trackedIds.has(id) : true));

  let importance: "high" | "normal" = "normal";
  if (k.legislative.has(kind)) {
    // Bills and acts are judged on their title: a summary like "introduced in Lok Sabha" must not count as "courts".
    const subject = kind === "notification" ? text : entry.title;
    const touches = touchesTracked || k.criminal.test(subject) || k.constitution.test(entry.title) || k.courts.test(entry.title);
    // A notification matters when it touches a tracked act (e.g. brings a BNS provision into force).
    if (kind === "notification" ? touchesTracked : touches) importance = "high";
  } else if (kind === "judgment" || kind === "news") {
    // Only the headline can say what bench decided: judgment excerpts often cite earlier
    // constitution-bench rulings, which must not make every judgment "high".
    const isSc = mentionsSupremeCourt(entry.title) || entry.categories.some((c) => k.scWords.test(c));
    if (isSc && k.landmark.test(entry.title) && (touchesTracked || k.criminal.test(text) || k.constitution.test(text))) importance = "high";
  }
  return { kind, acts, importance, tags };
}
