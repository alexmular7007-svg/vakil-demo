import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronLeft, ChevronRight, PlugZap, Search } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { features } from "@/lib/env";
import { DirectoryUnavailableError, searchCompanies, type CompanySummary } from "@/lib/directory/companies";
import { INDIAN_STATES } from "@/lib/directory/constants";
import { RateLimitError, rateLimit } from "@/lib/rate-limit";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { CompanySourceNote } from "@/components/directory/company-source-note";

export const metadata: Metadata = { title: "Companies" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined, max = 80) {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim().slice(0, max);
}

function statusTone(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s.startsWith("active")) return "success" as const;
  if (s.includes("strike") || s.includes("dissolved") || s.includes("liquidat")) return "danger" as const;
  return "neutral" as const;
}

export default async function CompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser("/app/companies");

  if (!features.directory) {
    return (
      <div className="space-y-6">
        <PageHeader title="Companies" description="Look up Indian companies and LLPs by name, CIN or state." />
        <EmptyState
          icon={PlugZap}
          title="Company directory not connected"
          description="An administrator needs to add read-only access to the company directory (DIRECTORY_SUPABASE_URL and DIRECTORY_SUPABASE_KEY) on the server. No company data is shown until then."
        />
      </div>
    );
  }

  const sp = await searchParams;
  const q = one(sp.q);
  const cin = one(sp.cin, 25);
  const stateParam = one(sp.state, 60);
  const state = (INDIAN_STATES as readonly string[]).includes(stateParam) ? stateParam : "";
  const page = Math.min(100, Math.max(1, Number.parseInt(one(sp.page, 3), 10) || 1));
  const searched = Boolean(q || cin || state);

  let rows: CompanySummary[] = [];
  let hasMore = false;
  let total: number | null = null;
  let error: string | null = null;
  if (searched) {
    try {
      const rl = await rateLimit(`directory-search:${user.id}`, 30, 60);
      if (!rl.ok) throw new RateLimitError(rl.resetAt);
      ({ rows, hasMore, total } = await searchCompanies({ q, cin, state, page }));
    } catch (err) {
      error =
        err instanceof RateLimitError
          ? "You are searching very quickly. Wait a minute and try again."
          : err instanceof DirectoryUnavailableError
            ? err.message
            : "The search failed. Please try again.";
      if (!(err instanceof RateLimitError) && !(err instanceof DirectoryUnavailableError)) console.error("[companies]", err);
    }
  }

  const qs = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cin) params.set("cin", cin);
    if (state) params.set("state", state);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Companies" description="Look up Indian companies and LLPs by name, CIN or state, with their listed directors." />

      <form method="get" role="search" aria-label="Search companies" className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
        <Field label="Company name" htmlFor="q">
          <Input id="q" name="q" defaultValue={q} placeholder="e.g. Tata Consultancy" maxLength={80} />
        </Field>
        <Field label="CIN / LLPIN" htmlFor="cin">
          <Input id="cin" name="cin" defaultValue={cin} placeholder="U72200MH…" maxLength={25} className="font-mono uppercase" autoCapitalize="characters" />
        </Field>
        <Field label="State" htmlFor="state">
          <Select id="state" name="state" defaultValue={state}>
            <option value="">Any</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            <Search /> Search
          </Button>
        </div>
      </form>

      <CompanySourceNote />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {!searched ? (
        <EmptyState icon={Building2} title="Search the company directory" description="Enter a company name, a CIN or LLPIN, or choose a state." />
      ) : !error && rows.length === 0 ? (
        <EmptyState icon={Building2} title="No companies found" description="Check the spelling, try part of the name, or search by CIN." />
      ) : rows.length > 0 ? (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {total !== null ? `About ${total.toLocaleString("en-IN")} matches. ` : ""}Showing {(page - 1) * 20 + 1}–{(page - 1) * 20 + rows.length}
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {rows.map((c) => (
              <li key={c.id}>
                {c.cin ? (
                  <Link href={`/app/companies/${encodeURIComponent(c.cin)}`} className="flex flex-col gap-1 p-4 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4">
                    <CompanyRow c={c} />
                  </Link>
                ) : (
                  <div className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4">
                    <CompanyRow c={c} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {page > 1 || hasMore ? (
            <nav aria-label="Pagination" className="flex items-center justify-between">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/companies${qs(page - 1)}`}>
                    <ChevronLeft /> Previous
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted">Page {page}</span>
              {hasMore ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/companies${qs(page + 1)}`}>
                    Next <ChevronRight />
                  </Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function CompanyRow({ c }: { c: CompanySummary }) {
  const place = [c.city, c.state].filter(Boolean).join(", ");
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{c.companyName ?? c.cin ?? "Unnamed entry"}</p>
        <p className="truncate text-sm text-muted">
          <span className="font-mono">{c.cin ?? "No CIN"}</span>
          {place ? ` · ${place}` : ""}
          {c.incorporatedOn ? ` · since ${c.incorporatedOn}` : ""}
        </p>
      </div>
      {c.status ? (
        <Badge tone={statusTone(c.status)} className="self-start sm:self-center">
          {c.status}
        </Badge>
      ) : null}
    </>
  );
}
