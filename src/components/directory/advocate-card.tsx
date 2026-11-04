import Link from "next/link";
import { BadgeCheck, Gavel, Languages, MapPin } from "lucide-react";
import type { ListedAdvocate } from "@/lib/directory/advocates";
import { Avatar, Badge } from "@/components/ui/display";
import { cn } from "@/lib/utils";

export function VerifiedBadge() {
  return (
    <Badge tone="success" title="Enrolment checked by Vaakil AI against the details the advocate gave">
      <BadgeCheck /> Verified advocate
    </Badge>
  );
}

/** Factual directory card. No ratings, fees, rankings or promotional language (BCI Rule 36). */
export function AdvocateCard({
  advocate,
  href,
  actionLabel,
  className,
  headingLevel = "h2",
}: {
  advocate: ListedAdvocate;
  href?: string;
  actionLabel?: string;
  className?: string;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const place = [advocate.city, advocate.state].filter(Boolean).join(", ");
  return (
    <article className={cn("flex flex-col rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5", className)}>
      <div className="flex items-start gap-3">
        <Avatar name={advocate.displayName} className="size-11 text-sm" />
        <div className="min-w-0 flex-1">
          <Heading className="truncate font-semibold text-ink">{advocate.displayName}</Heading>
          <div className="mt-1">
            <VerifiedBadge />
          </div>
        </div>
      </div>
      <dl className="mt-4 grid gap-1.5 text-sm">
        <div>
          <dt className="sr-only">Enrolment number</dt>
          <dd>
            <span className="font-mono text-ink">{advocate.enrolmentNo}</span>
            {advocate.enrolmentYear ? <span className="text-muted"> · enrolled {advocate.enrolmentYear}</span> : null}
          </dd>
        </div>
        <div>
          <dt className="sr-only">State Bar Council</dt>
          <dd className="text-ink-2">{advocate.stateBarCouncil}</dd>
        </div>
        {place ? (
          <div className="text-ink-2">
            <dt className="sr-only">Location</dt>
            <dd className="flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0 text-muted" aria-hidden />
              {place}
            </dd>
          </div>
        ) : null}
        {advocate.languages.length ? (
          <div className="text-ink-2">
            <dt className="sr-only">Languages</dt>
            <dd className="flex items-center gap-1.5">
              <Languages className="size-3.5 shrink-0 text-muted" aria-hidden />
              {advocate.languages.join(", ")}
            </dd>
          </div>
        ) : null}
        {advocate.courts.length ? (
          <div className="text-ink-2">
            <dt className="sr-only">Courts</dt>
            <dd className="flex items-start gap-1.5">
              <Gavel className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="line-clamp-2">{advocate.courts.join(" · ")}</span>
            </dd>
          </div>
        ) : null}
      </dl>
      {advocate.practiceAreas.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Practice areas">
          {advocate.practiceAreas.map((a) => (
            <li key={a}>
              <Badge tone="outline">{a}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {href ? (
        <div className="mt-auto pt-4">
          <Link
            href={href}
            className="inline-flex h-10 w-full items-center justify-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2"
          >
            {actionLabel ?? "View profile"}
          </Link>
        </div>
      ) : null}
    </article>
  );
}
