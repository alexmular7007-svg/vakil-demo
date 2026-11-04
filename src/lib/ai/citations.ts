import "server-only";
import { getSection } from "@/lib/corpus/search";
import { findCaseNames, findCitations, formatDecided } from "@/lib/judgments/cite";
import { findJudgmentsForRefs, type JudgmentMeta } from "@/lib/judgments/queries";
import type { Source } from "./retrieval";
import { logAiError } from "./safe-log";

export type Citation = {
  /** "S1" for retrieved sources; "ref-n" for references found in the text. */
  id: string;
  kind: "statute" | "document" | "judgment" | "case";
  label: string;
  href: string | null;
  /**
   * verified       cited source was retrieved from the corpus / user's documents
   * in_corpus      a statute reference in the text that exists in the corpus
   * not_in_corpus  a statute reference the corpus does not contain (verify manually)
   * in_library     a case name or citation found in the Vaakil judgments library
   * unverified     a case name or citation the library does not contain (verify manually)
   * invalid        the answer cited a source number that was never provided
   */
  status: "verified" | "in_corpus" | "not_in_corpus" | "in_library" | "unverified" | "invalid";
};

// Act names as they appear in answers → corpus act ids.
const ACT_ALIASES: [RegExp, string][] = [
  [/bharatiya\s+nyaya\s+sanhita|\bBNS\b/i, "BNS"],
  [/bharatiya\s+nagarik\s+suraksha\s+sanhita|\bBNSS\b/i, "BNSS"],
  [/bharatiya\s+sakshya\s+adhiniyam|\bBSA\b/i, "BSA"],
  [/indian\s+penal\s+code|\bIPC\b/i, "IPC"],
  [/code\s+of\s+criminal\s+procedure|\bCr\.?\s?P\.?C\.?\b/i, "CRPC"],
  [/indian\s+evidence\s+act|\bIEA\b/i, "IEA"],
  [/negotiable\s+instruments\s+act|\bNI\s+Act\b/i, "NIA"],
  [/hindu\s+marriage\s+act|\bHMA\b/i, "HMA"],
  [/consumer\s+protection\s+act/i, "CPA"],
  [/right\s+to\s+information\s+act|\bRTI\s+Act\b/i, "RTI"],
];

const ACT_PATTERN =
  "(Bharatiya Nyaya Sanhita|Bharatiya Nagarik Suraksha Sanhita|Bharatiya Sakshya Adhiniyam|Indian Penal Code|Code of Criminal Procedure|Indian Evidence Act|Negotiable Instruments Act|Hindu Marriage Act|Consumer Protection Act|Right to Information Act|BNSS|BNS|BSA|IPC|Cr\\.?\\s?P\\.?C\\.?|IEA|NI Act|HMA|RTI Act)";
const SEC = "(\\d{1,3}[A-Z]{0,2})";

// "Section 103 of the BNS", "s. 302 IPC", "Sec 138 NI Act", "BNS s.103", "BNSS section 480"
const STATUTE_REFS = [
  new RegExp(`\\b(?:Section|Sec\\.?|S\\.|s\\.)\\s*${SEC}\\s*(?:\\([^)]*\\)\\s*)?(?:of\\s+(?:the\\s+)?)?${ACT_PATTERN}`, "g"),
  new RegExp(`\\b${ACT_PATTERN}\\s*(?:,\\s*)?(?:Section|Sec\\.?|S\\.|s\\.)\\s*${SEC}`, "g"),
];

function actIdFor(name: string): string | null {
  for (const [re, id] of ACT_ALIASES) if (re.test(name)) return id;
  return null;
}

/** Checks every citation in an answer against what was retrieved and the corpus. */
export async function verifyCitations(answer: string, sources: Source[]): Promise<Citation[]> {
  const out: Citation[] = [];
  const seen = new Set<string>();
  const byId = new Map(sources.map((s) => [s.id, s]));

  // 1. Inline [S#] markers
  for (const m of answer.matchAll(/\[(S\d{1,2})\]/g)) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const s = byId.get(id);
    out.push(
      s
        ? { id, kind: s.kind, label: s.label, href: s.href, status: "verified" }
        : { id, kind: "statute", label: `Source ${id} was cited but never provided`, href: null, status: "invalid" },
    );
  }

  // Statutes already covered by retrieved sources need no second check.
  const retrieved = new Set(
    sources.filter((s) => s.meta?.actId).map((s) => `${s.meta!.actId}:${s.meta!.sectionNo}`.toUpperCase()),
  );

  // 2. Statute references written in prose
  let n = 0;
  const refs: { act: string; sec: string; text: string }[] = [];
  for (const re of STATUTE_REFS) {
    for (const m of answer.matchAll(re)) {
      const [full, a, b] = m;
      const isSecFirst = /^\d/.test(a);
      const sec = (isSecFirst ? a : b).toUpperCase();
      const actName = isSecFirst ? b : a;
      const act = actIdFor(actName);
      if (act) refs.push({ act, sec, text: full.trim() });
    }
  }
  for (const r of refs) {
    const key = `${r.act}:${r.sec}`;
    if (seen.has(key) || retrieved.has(key)) continue;
    seen.add(key);
    const hit = await getSection(r.act, r.sec).catch(() => null);
    out.push({
      id: `ref-${++n}`,
      kind: "statute",
      label: hit ? `${hit.actTitle}, Section ${hit.sectionNo}: ${hit.heading}` : `${r.act} s.${r.sec} (mentioned in the answer)`,
      href: hit ? `/app/research/${encodeURIComponent(hit.actId)}/${encodeURIComponent(hit.sectionNo)}` : null,
      status: hit ? "in_corpus" : "not_in_corpus",
    });
  }

  // 3. Case law: names and citations are looked up in the judgments library.
  const caseRefs = [...findCitations(answer), ...findCaseNames(answer).map((c) => c.text)].filter((c) => !seen.has(c));
  let library = new Map<string, JudgmentMeta>();
  if (caseRefs.length) {
    library = await findJudgmentsForRefs({ citations: findCitations(answer), names: findCaseNames(answer) }).catch((e) => {
      logAiError("citations", "judgment lookup failed", e);
      return new Map<string, JudgmentMeta>();
    });
  }
  // Judgments already given to the model as [S#] sources need no second entry.
  const listed = new Set(sources.filter((s) => s.meta?.judgmentId && seen.has(s.id)).map((s) => s.meta!.judgmentId!));
  for (const c of caseRefs) {
    if (seen.has(c)) continue;
    seen.add(c);
    const j = library.get(c);
    if (j) {
      if (listed.has(j.id)) continue;
      listed.add(j.id);
      const date = formatDecided(j.decidedOn);
      const cite = j.citation?.split(/;\s*/)[0];
      out.push({
        id: `ref-${++n}`,
        kind: "case",
        label: `${j.title} (${j.court}${date ? `, decided ${date}` : ""})${cite ? `, ${cite}` : ""}`,
        href: `/app/research/case/${j.id}`,
        status: "in_library",
      });
    } else {
      out.push({ id: `ref-${++n}`, kind: "case", label: c, href: null, status: "unverified" });
    }
  }

  return out;
}
