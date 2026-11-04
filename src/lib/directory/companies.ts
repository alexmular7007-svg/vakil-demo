import "server-only";
import { env, features } from "@/lib/env";

/**
 * Read-only client for the search.vaakil.com company directory (Supabase PostgREST,
 * tables `companies` and `directors`). The key stays on the server. Only GET
 * requests are ever made.
 *
 * The old directory front end inserted invented directors for companies that had
 * none: director_id "D-<CIN>-1" ("<word> Kumar") and "D-<CIN>-2" ("<word> Singh")
 * with hash-generated DINs. Those rows are filtered out here and never shown.
 */

export class DirectoryUnavailableError extends Error {
  constructor(message = "The company directory is not reachable right now. Please try again later.") {
    super(message);
  }
}

export type CompanySummary = {
  id: string;
  companyName: string | null;
  cin: string | null;
  status: string | null;
  incorporatedOn: string | null;
  city: string | null;
  state: string | null;
  roc: string | null;
  activity: string | null;
};

export type CompanyDetail = CompanySummary & {
  pincode: string | null;
  address: string | null;
  email: string | null;
  ageOfCompany: string | null;
  partners: string | null;
  designatedPartners: string | null;
  obligationOfContribution: string | null;
  securedLoans: string | null;
  lastUpdate: string | null;
  description: string | null;
};

export type Director = {
  id: string;
  name: string | null;
  din: string | null;
  designation: string | null;
  appointedOn: string | null;
};

const SUMMARY_COLUMNS =
  "id,company_name,cin_llpin,llp_status,date_of_incorporation,city,state,roc,principal_business_activity";
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS},pincode,address,email,age_of_company,number_of_partners,number_of_designated_partners,total_obligation_of_contribution,charges_secured_loans,last_update,description`;

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function toSummary(r: Row): CompanySummary {
  return {
    id: String(r.id),
    companyName: str(r.company_name),
    cin: str(r.cin_llpin),
    status: str(r.llp_status),
    incorporatedOn: str(r.date_of_incorporation),
    city: str(r.city),
    state: str(r.state),
    roc: str(r.roc),
    activity: str(r.principal_business_activity),
  };
}

function toDetail(r: Row): CompanyDetail {
  return {
    ...toSummary(r),
    pincode: str(r.pincode),
    address: str(r.address),
    email: str(r.email),
    ageOfCompany: str(r.age_of_company),
    partners: str(r.number_of_partners),
    designatedPartners: str(r.number_of_designated_partners),
    obligationOfContribution: str(r.total_obligation_of_contribution),
    securedLoans: str(r.charges_secured_loans),
    lastUpdate: str(r.last_update),
    description: str(r.description),
  };
}

/** True for rows the old front end fabricated: D-<CIN>-1 / D-<CIN>-2. */
export function isSyntheticDirector(directorId: string | null | undefined, companyCin: string | null | undefined) {
  if (!directorId) return false;
  const id = directorId.trim().toUpperCase();
  if (companyCin) {
    const cin = companyCin.trim().toUpperCase();
    if (id === `D-${cin}-1` || id === `D-${cin}-2`) return true;
  }
  return /^D-[A-Z0-9][A-Z0-9-]{4,}-[12]$/.test(id);
}

/** Strips characters that have meaning in PostgREST filter syntax. */
export function sanitizeTerm(input: string, max = 80) {
  return input
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s&.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function rest(path: string, params: URLSearchParams): Promise<{ rows: Row[]; total: number | null }> {
  if (!features.directory || !env.DIRECTORY_SUPABASE_URL || !env.DIRECTORY_SUPABASE_KEY) {
    throw new DirectoryUnavailableError("The company directory is not connected.");
  }
  const url = `${env.DIRECTORY_SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${path}?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: env.DIRECTORY_SUPABASE_KEY,
        Authorization: `Bearer ${env.DIRECTORY_SUPABASE_KEY}`,
        Accept: "application/json",
        Prefer: "count=estimated",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error("[directory] request failed", err instanceof Error ? err.message : err);
    throw new DirectoryUnavailableError();
  }
  if (!res.ok) {
    console.error("[directory] HTTP", res.status, path);
    throw new DirectoryUnavailableError();
  }
  const rows = (await res.json()) as Row[];
  const range = res.headers.get("content-range");
  const total = range && range.includes("/") ? Number(range.split("/")[1]) : NaN;
  return { rows: Array.isArray(rows) ? rows : [], total: Number.isFinite(total) ? total : null };
}

export const COMPANY_PAGE_SIZE = 20;

export async function searchCompanies(input: { q?: string; cin?: string; state?: string; page?: number }) {
  const params = new URLSearchParams();
  params.set("select", SUMMARY_COLUMNS);
  const q = input.q ? sanitizeTerm(input.q) : "";
  const cin = input.cin ? input.cin.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 25) : "";
  const state = input.state ? sanitizeTerm(input.state, 60) : "";
  // Values are sanitised above and double-quoted inside or(), because "." is reserved there.
  if (q) params.append("or", `(company_name.ilike."%${q}%",cin_llpin.ilike."%${q}%")`);
  if (cin) params.append("cin_llpin", `ilike.${cin}%`);
  if (state) params.append("state", `ilike.%${state}%`);
  params.set("order", "company_name.asc.nullslast,id.asc");
  const page = Math.max(1, input.page ?? 1);
  params.set("limit", String(COMPANY_PAGE_SIZE + 1));
  params.set("offset", String((page - 1) * COMPANY_PAGE_SIZE));
  const { rows, total } = await rest("companies", params);
  return {
    rows: rows.slice(0, COMPANY_PAGE_SIZE).map(toSummary),
    hasMore: rows.length > COMPANY_PAGE_SIZE,
    total,
  };
}

export async function getCompanyByCin(cinRaw: string) {
  const cin = cinRaw.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 25);
  if (cin.length < 6) return null;
  const params = new URLSearchParams({ select: DETAIL_COLUMNS, cin_llpin: `eq.${cin}`, limit: "1" });
  const { rows } = await rest("companies", params);
  const row = rows[0];
  if (!row) return null;
  const company = toDetail(row);

  const dparams = new URLSearchParams({
    select: "id,director_id,director_name,din,designation,appointment_date",
    company_id: `eq.${company.id}`,
    order: "director_name.asc.nullslast,id.asc",
    limit: "200",
  });
  const { rows: drows } = await rest("directors", dparams);
  let hidden = 0;
  const directors: Director[] = [];
  for (const d of drows) {
    if (isSyntheticDirector(str(d.director_id), company.cin)) {
      hidden++;
      continue;
    }
    directors.push({
      id: String(d.id),
      name: str(d.director_name),
      din: str(d.din),
      designation: str(d.designation),
      appointedOn: str(d.appointment_date),
    });
  }
  return { company, directors, hiddenDirectors: hidden };
}
