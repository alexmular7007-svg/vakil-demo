import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ListOrdered, ShieldCheck, UsersRound } from "lucide-react";
import { publicListedAdvocates } from "@/lib/directory/advocates";
import { AdvocateCard } from "@/components/directory/advocate-card";
import { BciNotice } from "@/components/directory/bci-notice";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";

export const metadata: Metadata = {
  title: "Verified advocates",
  description:
    "An unranked, alphabetical list of advocates who asked to be listed and whose enrolment Vaakil AI checked. Information only, as Bar Council of India Rule 36 requires.",
  alternates: { canonical: "/advocates" },
};

const points = [
  {
    icon: BadgeCheck,
    title: "Enrolment checked",
    body: "An administrator checks each enrolment number and State Bar Council before an advocate appears here.",
  },
  {
    icon: ListOrdered,
    title: "Never ranked",
    body: "Alphabetical order only. No ratings, reviews, fees, sponsored places or “top” lists.",
  },
  {
    icon: ShieldCheck,
    title: "Opt-in only",
    body: "Advocates choose whether to be listed and whether to accept consultation requests.",
  },
];

export default async function PublicAdvocatesPage() {
  const advocates = await publicListedAdvocates();
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Verified advocates</h1>
        <p className="mt-3 text-ink-2">
          When a matter needs a human, Vaakil AI users can send a short consultation request to an enrolled advocate. This
          page lists advocates who opted in, for information only.
        </p>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {points.map((p) => (
          <li key={p.title} className="rounded-lg border border-border bg-surface p-4">
            <p.icon className="size-5 text-primary" aria-hidden />
            <p className="mt-2 font-medium text-ink">{p.title}</p>
            <p className="mt-1 text-sm text-muted">{p.body}</p>
          </li>
        ))}
      </ul>

      <BciNotice className="mt-6" />

      <section aria-labelledby="list-heading" className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="list-heading" className="font-serif text-2xl font-semibold text-ink">
            Listed advocates
          </h2>
          <Button asChild variant="outline" size="sm">
            <Link href="/app/settings/advocate">Are you an advocate? Apply for verification</Link>
          </Button>
        </div>
        {advocates.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon={UsersRound}
            title="No advocates are listed yet"
            description="Verified advocates who choose to be listed will appear here in alphabetical order."
          />
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {advocates.map((a) => (
              <AdvocateCard
                key={a.userId}
                advocate={a}
                headingLevel="h3"
                href={a.acceptsConsultations ? `/app/advocates/${encodeURIComponent(a.userId)}` : undefined}
                actionLabel="Sign in to request a consultation"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
