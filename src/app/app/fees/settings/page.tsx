import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, Info, Settings2 } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getBillingProfile } from "@/lib/fees/queries";
import { financialYearOf, istToday } from "@/lib/fees/fy";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from "@/components/ui/display";
import { BillingProfileForm } from "@/components/fees/profile-form";

export const metadata: Metadata = { title: "Billing profile" };

export default async function BillingProfilePage() {
  const user = await requireUser("/app/fees/settings");
  await connection();
  const profile = await getBillingProfile(user.id, user.name);
  const fyLabel = financialYearOf(istToday()).label;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/fees" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Fee book
      </Link>
      <PageHeader eyebrow="Fee book" icon={Settings2} title="Billing profile" description="The letterhead, payment details and numbering used on your fee memos." />
      <Card>
        <CardHeader>
          <CardTitle>Letterhead and payment</CardTitle>
          <CardDescription>
            Memos are numbered per financial year (April to March), e.g. <span className="tabular">INV/{fyLabel}/0001</span>. Changing the prefix does
            not restart the count.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BillingProfileForm profile={profile} fyLabel={fyLabel} />
        </CardContent>
      </Card>
      <p className="mt-4 flex gap-2 text-xs text-muted">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          On GST: legal services by an advocate to a business entity are taxed under reverse charge, so the client pays the GST; services to
          individuals are generally exempt. Charge GST yourself only if you are registered and that applies to you. Check with your CA.
        </span>
      </p>
    </div>
  );
}
