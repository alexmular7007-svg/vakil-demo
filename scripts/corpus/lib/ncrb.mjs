// NCRB SANKALAN (National Crime Records Bureau, Ministry of Home Affairs) publishes
// section-by-section correspondence tables between the new criminal laws and the
// codes they replaced. Each table row pairs a new-code provision (left cell) with
// the old-code provision(s) it corresponds to (right cell).

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…" };

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

const clean = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function cells(rowHtml) {
  const out = [];
  for (const m of rowHtml.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)) {
    const id = m[1].match(/\bid="([^"]*)"/)?.[1] ?? null;
    const paras = [...m[2].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((p) => clean(p[1]));
    out.push({ id, paras: paras.length ? paras : [clean(m[2])] });
  }
  return out;
}

// "420. Cheating…", "376(3)", "41A Notice…", "14- “Servant…”", "65B (3) (a) …"
const REF = /^(\d{1,3}[A-Z]{0,3})\s*((?:\(\s*[0-9a-zA-Z]{1,6}\s*\)\s*)*)(?=$|[\s.,:;\-–—(]|[A-Z][a-z])/;

function parseRef(text) {
  const m = text.match(REF);
  if (!m) return null;
  const sub = m[2].replace(/\s+/g, "");
  return { section: m[1], ref: `${m[1]}${sub}` };
}

/**
 * @returns {{ rows: {newSection:string, newRef:string, newHeading:string|null, changed:boolean,
 *   old: {section:string, ref:string, text:string}[], kind:"mapped"|"new"}[],
 *   deleted: {section:string, ref:string, text:string}[] }}
 */
export function parseNcrbTable(html, newActHeader) {
  // Each page has two tables: new code → old code, then the same pairs ordered by the old
  // code with the columns swapped. Use the table whose first column is the new code.
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  const table = tables.find((t) => {
    const firstTh = t.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
    return firstTh && newActHeader.test(clean(firstTh[1]));
  });
  if (!table) throw new Error("NCRB table with the new code in the first column not found");
  const body = table.slice(table.indexOf("<tbody"), table.lastIndexOf("</tbody>"));
  const rows = [];
  const deleted = [];
  let lastHeading = new Map();
  for (const m of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const [left, right] = cells(m[1]);
    if (!left || !right) continue;
    const leftText = left.paras.filter(Boolean);
    const rightText = right.paras.filter(Boolean);
    // Left reference: the cell id ("318", "318.4") or a leading section number ("23. Proviso").
    let newSection = null;
    let newRef = null;
    if (left.id && /^\d{1,3}[A-Z]{0,3}(\.\d+)?$/.test(left.id)) {
      newSection = left.id.split(".")[0];
      const sub = leftText.map((t) => t.match(/^(\d{1,3}[A-Z]{0,3})\s*((?:\(\s*\w{1,6}\s*\)\s*)+)/)).find(Boolean);
      newRef = left.id.includes(".") && sub ? `${sub[1]}${sub[2].replace(/\s+/g, "")}` : newSection;
    } else if (leftText[0] && !/^deleted$/i.test(leftText[0])) {
      const r = parseRef(leftText[0]);
      if (r && /^\d{1,3}[A-Z]{0,3}\s*[.(]/.test(leftText[0])) {
        newSection = r.section;
        newRef = leftText[0].replace(/\s+/g, " ").slice(0, 60);
      }
    }
    const headLine = leftText.find((t) => /^\d{1,3}[A-Z]{0,3}\.\s+\S/.test(t));
    let newHeading = null;
    let changed = leftText.some((t) => /\(Change\)/i.test(t));
    if (headLine && newSection && headLine.startsWith(`${newSection}.`)) {
      newHeading = headLine.replace(/^\d{1,3}[A-Z]{0,3}\.\s+/, "").replace(/\s*\(Change\)\s*/i, "").replace(/\.\s*$/, "").trim();
      lastHeading.set(newSection, newHeading);
    } else if (newSection) {
      newHeading = lastHeading.get(newSection) ?? null;
    }

    const old = [];
    for (const t of rightText) {
      if (/^new (sub-)?section/i.test(t) || /^chapter\b/i.test(t)) continue;
      const r = parseRef(t);
      if (r) old.push({ ...r, text: t.replace(/\s+/g, " ").slice(0, 200) });
    }

    if (left.paras.some((t) => /^deleted$/i.test(t))) {
      for (const o of old) deleted.push(o);
      continue;
    }
    if (!newSection) continue;
    if (old.length === 0 && rightText.some((t) => /^new (sub-)?section/i.test(t))) {
      rows.push({ newSection, newRef, newHeading, changed, old: [], kind: "new" });
      continue;
    }
    if (old.length) rows.push({ newSection, newRef, newHeading, changed, old, kind: "mapped" });
  }
  return { rows, deleted };
}
