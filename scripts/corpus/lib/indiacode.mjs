// India Code (indiacode.gov.in, Legislative Department, Ministry of Law and Justice)
// is a DSpace repository. Central Acts are stored as an ACT item plus one SECTION item
// per section, each carrying the official section text as HTML.
import { getJson } from "./http.mjs";
import { INDIA_CODE } from "./indiacode-text.mjs";

export { INDIA_CODE, handleUrl, htmlToFootnotes, htmlToParagraphs, meta, tidy, toSuperscript } from "./indiacode-text.mjs";

const API = `${INDIA_CODE}/server/api`;

/** All items whose dc.identifier.act_id equals `actId` (the ACT item, sections, schedules). */
export async function itemsForAct(actId) {
  const out = [];
  for (let page = 0; ; page++) {
    const q = new URLSearchParams({ query: `dc.identifier.act_id:"${actId}"`, dsoType: "ITEM", size: "100", page: String(page) });
    const d = await getJson(`${API}/discover/search/objects?${q}`);
    const sr = d._embedded.searchResult;
    for (const o of sr._embedded.objects) out.push(o._embedded.indexableObject);
    if (page + 1 >= sr.page.totalPages) break;
  }
  return out;
}

export async function getItem(uuid) {
  return getJson(`${API}/core/items/${uuid}`);
}

/** Bitstreams of an item, grouped by bundle name (ORIGINAL holds the PDFs). */
export async function bitstreams(uuid) {
  const d = await getJson(`${API}/core/items/${uuid}/bundles?embed=bitstreams`);
  const out = [];
  for (const b of d._embedded.bundles) {
    for (const bs of b._embedded?.bitstreams?._embedded?.bitstreams ?? []) {
      out.push({ bundle: b.name, name: bs.name, size: bs.sizeBytes, url: bs._links.content.href });
    }
  }
  return out;
}
