// Pure rules for changing statute text, shared by every path that writes it:
// reviseSection / reviseSections (server), the India Code sync and the admin
// "Paste full act text" preview (client). Input limits, section-number order, the
// added / changed / removed / unchanged plan, where a new section goes, and the
// safety check that refuses bulk changes that look like a failed read.
// No I/O: safe for client and server, and unit-tested.

/** "103", "498A", "53AA", "1234ABCD". Stored section numbers are always upper case. */
export const SECTION_NO_PATTERN = /^\d{1,4}[A-Z]{0,4}$/;

export const CORPUS_LIMITS = {
  headingMax: 500,
  /** The longest seeded section is about 25,000 characters; room for long definitions with footnotes. */
  textMax: 200_000,
  chapterMax: 300,
  noteMax: 2000,
  sourceRefMax: 1000,
  changedByMax: 200,
  /** Sections in one reviseSections call. */
  batchMax: 5000,
} as const;

/**
 * Safety rule for automated bulk changes (the India Code sync) and for removing
 * sections from the admin paste flow. A read that returns far fewer sections than the
 * corpus has, or that would remove many at once, is far more likely a parsing failure
 * than an amendment, so it is refused and left for an admin to review.
 */
export const SYNC_SAFETY = {
  /** Refuse when the new text has fewer than this share of the current sections. */
  minSectionRatio: 0.7,
  /** Removals are always allowed up to this many… */
  maxRemovalsFloor: 10,
  /** …or up to this share of the current sections, whichever is larger. */
  maxRemovalRatio: 0.1,
} as const;

export type SafetyLimits = { minSectionRatio: number; maxRemovalsFloor: number; maxRemovalRatio: number };

export type SectionInputCode =
  | "invalid_section_no"
  | "invalid_heading"
  | "invalid_text"
  | "invalid_chapter"
  | "invalid_sort_key"
  | "invalid_meta"
  | "duplicate"
  | "conflict"
  | "too_many"
  | "unknown_act"
  | "exists"
  | "not_found";

/** A change that breaks the corpus rules. The message is safe to show to an admin. */
export class SectionInputError extends Error {
  constructor(
    message: string,
    public code: SectionInputCode,
    public sectionNo?: string,
  ) {
    super(message);
    this.name = "SectionInputError";
  }
}

/** A bulk change refused by a guard (e.g. the India Code safety rule). Nothing was written. */
export class UnsafeChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeChangeError";
  }
}

/** Upper case, no "s." / "Sec." / "Section" prefix, no spaces: " s. 498 a " → "498A". */
export function normaliseSectionNo(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/^S(?:EC(?:TION)?)?\.?\s*/, "")
    .replace(/\s+/g, "");
}

export function isSectionNo(no: string): boolean {
  return SECTION_NO_PATTERN.test(no);
}

// Characters Postgres text cannot hold (NUL) and other C0 controls except tab and newlines.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

export type SectionFields = { sectionNo: string; heading: string; text: string; chapter?: string | null; sortKey?: number };

/** The first problem with one section's fields, or null. Expects an already-normalised section number. */
export function sectionProblem(s: SectionFields): { code: SectionInputCode; message: string } | null {
  if (typeof s.sectionNo !== "string" || !isSectionNo(s.sectionNo)) {
    return { code: "invalid_section_no", message: `"${String(s.sectionNo).slice(0, 20)}" is not a section number (use 103, 498A…).` };
  }
  const heading = typeof s.heading === "string" ? s.heading.trim() : "";
  if (!heading) return { code: "invalid_heading", message: `Section ${s.sectionNo} has no heading.` };
  if (heading.length > CORPUS_LIMITS.headingMax) return { code: "invalid_heading", message: `The heading of section ${s.sectionNo} is longer than ${CORPUS_LIMITS.headingMax} characters.` };
  if (CONTROL.test(heading)) return { code: "invalid_heading", message: `The heading of section ${s.sectionNo} contains control characters.` };
  const text = typeof s.text === "string" ? s.text.trim() : "";
  if (!text) return { code: "invalid_text", message: `Section ${s.sectionNo} has no text.` };
  if (text.length > CORPUS_LIMITS.textMax) return { code: "invalid_text", message: `The text of section ${s.sectionNo} is longer than ${CORPUS_LIMITS.textMax.toLocaleString("en-IN")} characters.` };
  if (CONTROL.test(text)) return { code: "invalid_text", message: `The text of section ${s.sectionNo} contains control characters.` };
  if (s.chapter !== undefined && s.chapter !== null && (typeof s.chapter !== "string" || s.chapter.length > CORPUS_LIMITS.chapterMax || CONTROL.test(s.chapter))) {
    return { code: "invalid_chapter", message: `The chapter of section ${s.sectionNo} is not valid (at most ${CORPUS_LIMITS.chapterMax} characters).` };
  }
  if (s.sortKey !== undefined && (!Number.isInteger(s.sortKey) || s.sortKey < -2_000_000_000 || s.sortKey > 2_000_000_000)) {
    return { code: "invalid_sort_key", message: `The position of section ${s.sectionNo} is not a valid number.` };
  }
  return null;
}

/** Number, then suffix: 3 < 3A < 3AB < 3B < 4 < 10. Malformed numbers sort after valid ones. */
export function compareSectionNos(a: string, b: string): number {
  const ma = /^(\d+)([A-Z]*)$/.exec(a);
  const mb = /^(\d+)([A-Z]*)$/.exec(b);
  if (!ma || !mb) return ma ? -1 : mb ? 1 : a.localeCompare(b);
  const d = Number(ma[1]) - Number(mb[1]);
  if (d !== 0) return d;
  return ma[2] < mb[2] ? -1 : ma[2] > mb[2] ? 1 : 0;
}

/** cyrb53: a fast 53-bit string hash, identical in the browser and on the server. */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Short fingerprint of a section's heading and text, as compared by the plan (trimmed).
 * Lets the admin preview tell "changed" from "unchanged" without sending every section's
 * full text to the browser.
 */
export function sectionFingerprint(heading: string, text: string): string {
  return cyrb53(`${heading.trim()}\u0001${text.trim()}`).toString(36);
}

/** A section as it is now: full text on the server, or only a fingerprint in the browser. */
export type CurrentSectionLike = { sectionNo: string; chapter?: string | null; heading?: string; text?: string; fingerprint?: string };

/** A section as it should be. `chapter: undefined` keeps the stored chapter. */
export type PlannedSection = { sectionNo: string; heading: string; text: string; chapter?: string | null };

/** True when `next` would change nothing about `cur` (heading and text trimmed; chapter only if given). */
export function sameSection(cur: CurrentSectionLike, next: PlannedSection): boolean {
  if (next.chapter !== undefined && (cur.chapter ?? null) !== (next.chapter ?? null)) return false;
  if (cur.heading !== undefined && cur.text !== undefined) return cur.heading.trim() === next.heading.trim() && cur.text.trim() === next.text.trim();
  return cur.fingerprint !== undefined && cur.fingerprint === sectionFingerprint(next.heading, next.text);
}

export type SectionPlan<T> = {
  added: T[];
  changed: T[];
  /** Section numbers whose heading and text already match. */
  unchanged: string[];
  /** Section numbers in the corpus that are not in the new text (only with removeMissing). */
  removed: string[];
  /** Section numbers that appeared more than once in the new text; the first one is used. */
  duplicates: string[];
};

export type PlanOptions = {
  /** Treat sections missing from `next` as removed (a full act); otherwise they are left alone. */
  removeMissing?: boolean;
  /** Never remove these (e.g. sections the PDF parser could not find: unknown, not removed). */
  keep?: Iterable<string>;
};

/**
 * What it takes to make the corpus match `next`: the one diff used by the India Code
 * sync, the admin paste preview and reviseSections itself. `view` reads the section
 * fields from the caller's own type.
 */
export function planSections<T>(
  current: readonly CurrentSectionLike[],
  next: readonly T[],
  view: (item: T) => PlannedSection,
  opts: PlanOptions = {},
): SectionPlan<T> {
  const cur = new Map(current.map((s) => [s.sectionNo, s]));
  const seen = new Set<string>();
  const plan: SectionPlan<T> = { added: [], changed: [], unchanged: [], removed: [], duplicates: [] };
  for (const item of next) {
    const s = view(item);
    if (seen.has(s.sectionNo)) {
      plan.duplicates.push(s.sectionNo);
      continue;
    }
    seen.add(s.sectionNo);
    const c = cur.get(s.sectionNo);
    if (!c) plan.added.push(item);
    else if (sameSection(c, s)) plan.unchanged.push(s.sectionNo);
    else plan.changed.push(item);
  }
  if (opts.removeMissing) {
    const keep = new Set(opts.keep ?? []);
    plan.removed = current.map((s) => s.sectionNo).filter((no) => !seen.has(no) && !keep.has(no));
  }
  return plan;
}

/** planSections for plain section objects. */
export function planSectionEdits<T extends PlannedSection>(current: readonly CurrentSectionLike[], next: readonly T[], opts?: PlanOptions): SectionPlan<T> {
  return planSections(current, next, (s) => s, opts);
}

/** Largest number of removals the safety rule allows for an act of this size. */
export function maxSafeRemovals(currentCount: number, limits: SafetyLimits = SYNC_SAFETY): number {
  return Math.max(limits.maxRemovalsFloor, Math.ceil(currentCount * limits.maxRemovalRatio));
}

/**
 * Refuses plans that look like a parsing failure rather than an amendment: far fewer
 * sections than before, or many removals at once. Returns the reason, or null if safe.
 * `source` names where the new text came from, for the message.
 */
export function unsafePlanReason(
  plan: { removed: readonly unknown[] },
  currentCount: number,
  nextCount: number,
  opts: { limits?: SafetyLimits; source?: string } = {},
): string | null {
  const limits = opts.limits ?? SYNC_SAFETY;
  const source = opts.source ?? "The new text";
  if (currentCount > 0 && nextCount < Math.ceil(currentCount * limits.minSectionRatio)) {
    return `${source} returned ${nextCount} sections where the corpus has ${currentCount}; not applied (looks like an incomplete read).`;
  }
  if (plan.removed.length > maxSafeRemovals(currentCount, limits)) {
    return `${plan.removed.length} sections would be removed at once; not applied, review in the Law library.`;
  }
  return null;
}

/**
 * Sort key for a new section: between the nearest lower-numbered section and the one
 * after it. Null when there is no gap left there (the caller renumbers the act first).
 */
export function sortKeyForNew(existing: readonly { sectionNo: string; sortKey: number }[], sectionNo: string): number | null {
  if (!existing.length) return 10;
  const byKey = [...existing].sort((a, b) => a.sortKey - b.sortKey);
  let anchor: { sectionNo: string; sortKey: number } | null = null;
  for (const s of existing) {
    if (s.sectionNo === sectionNo || compareSectionNos(s.sectionNo, sectionNo) >= 0) continue;
    if (!anchor || compareSectionNos(s.sectionNo, anchor.sectionNo) > 0) anchor = s;
  }
  if (!anchor) {
    // Lower than every existing section: before the first one.
    const first = byKey[0].sortKey;
    return first > 1 ? Math.floor(first / 2) : first - 10;
  }
  const after = byKey.find((s) => s.sortKey > anchor.sortKey);
  if (!after) return anchor.sortKey + 10;
  const mid = Math.floor((anchor.sortKey + after.sortKey) / 2);
  return mid > anchor.sortKey ? mid : null;
}

/** "103, 104, 105A and 12 more" for summaries. */
export function listSectionNos(nos: readonly string[], max = 6): string {
  if (!nos.length) return "";
  const shown = nos.slice(0, max).join(", ");
  return nos.length > max ? `${shown} and ${nos.length - max} more` : shown;
}
