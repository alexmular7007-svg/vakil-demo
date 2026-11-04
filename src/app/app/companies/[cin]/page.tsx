import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, EyeOff, PlugZap, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { features } from "@/lib/env";
import { DirectoryUnavailableError, getCompanyByCin } from "@/lib/directory/companies";
import { RateLimitError, rateLimit } from "@/lib/rate-limit";
import { Alert, Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { CompanySourceNote } from "@/components/directory/company-source-note";

export const metadata: Metadata = { title: "Company" };

type Props = { params: Promise<{ cin: string }> };

export default async function CompanyPage({ params }: Props) {
  const user = await requireUser("/app/companies");
  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link href="/app/companies">
        <ArrowLeft /> Company search
      </Link>
    </Button>
  );
  if (!features.directory) {
    return (
      <div className="space-y-6">
        {back}
        <EmptyState icon={PlugZap} title="Company directory not connected" description="An administrator needs to connect the company directory first." />
      </div>
    );
  }

  const { cin: raw } = await params;
  const cin = raw.toUpperCase();
  if (!/^[A-Z0-9-]{6,25}$/.test(cin)) notFound();

  let result: Awaited<ReturnType<typeof getCompanyByCin>> = null;
  let error: string | null = null;
  try {
    const rl = await rateLimit(`directory-view:${user.id}`, 60, 60);
    if (!rl.ok) throw new RateLimitError(rl.resetAt);
    result = await getCompanyByCin(cin);
  } catch (err) {
    error =
      err instanceof RateLimitError
        ? "Too many lookups. Wait a minute and try again."
        : err instanceof DirectoryUnavailableError
          ? err.message
          : "This company could not be loaded.";
  }
  if (error) {
    return (
      <div className="space-y-6">
        {back}
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }
  if (!result) notFound();
  const { company: c, directors, hiddenDirectors } = result;

  const facts: [string, string | null][] = [
    ["CIN / LLPIN", c.cin],
    ["Status", c.status],
    ["Incorporated", c.incorporatedOn],
    ["Age", c.ageOfCompany],
    ["Registrar (ROC)", c.roc],
    ["Business activity", c.activity],
    ["Partners", c.partners],
    ["Designated partners", c.designatedPartners],
    ["Obligation of contribution", c.obligationOfContribution],
    ["Charges (secured loans)", c.securedLoans],
    ["Email", c.email],
    ["Address", [c.address, c.city, c.state, c.pincode].filter(Boolean).join(", ") || null],
    ["Last updated in source", c.lastUpdate],
  ];

  return (
    <div className="space-y-6">
      {back}
      <PageHeader
        title={c.companyName ?? c.cin ?? "Company"}
        description={[c.city, c.state].filter(Boolean).join(", ") || undefined}
        actions={c.status ? <Badge tone={c.status.toLowerCase().startsWith("active") ? "success" : "neutral"}>{c.status}</Badge> : null}
      />

      <Card className="p-5">
        <h2 className="text-base font-semibold text-ink">Company details</h2>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-muted">{k}</dt>
                <dd className={k === "CIN / LLPIN" ? "font-mono break-all text-ink" : "break-words text-ink"}>{v}</dd>
              </div>
            ))}
        </dl>
        {c.description ? <p className="mt-4 text-sm text-ink-2">{c.description}</p> : null}
      </Card>

      <section aria-labelledby="directors-heading" className="space-y-3">
        <h2 id="directors-heading" className="text-base font-semibold text-ink">
          Directors and designated partners
        </h2>
        {hiddenDirectors > 0 ? (
          <Alert tone="warning" title={`${hiddenDirectors} unverified ${hiddenDirectors === 1 ? "entry" : "entries"} hidden`}>
            <span className="inline-flex items-start gap-1.5">
              <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
              The old directory generated placeholder directors for companies without director data. Those entries are not
              real records, so we do not show them.
            </span>
          </Alert>
        ) : null}
        {directors.length === 0 ? (
          <EmptyState icon={UserRound} title="No verified director records" description="Check the MCA portal for the current list of directors." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>DIN / DPIN</Th>
                <Th className="hidden sm:table-cell">Designation</Th>
                <Th className="hidden md:table-cell">Appointed</Th>
              </tr>
            </thead>
            <tbody>
              {directors.map((d) => (
                <tr key={d.id}>
                  <Td className="text-ink">
                    {d.name ?? "—"}
                    <span className="block text-xs text-muted sm:hidden">{d.designation}</span>
                  </Td>
                  <Td className="font-mono text-xs">{d.din ?? "—"}</Td>
                  <Td className="hidden sm:table-cell">{d.designation ?? "—"}</Td>
                  <Td className="hidden md:table-cell">{d.appointedOn ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <CompanySourceNote />
    </div>
  );
}
