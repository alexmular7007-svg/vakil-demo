import Link from "next/link";
import { FileClock } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { absoluteUrl, breadcrumbJsonLd } from "@/lib/corpus/seo";

export const LEGAL_LAST_UPDATED = "2 November 2026";
export const LEGAL_LAST_UPDATED_ISO = "2026-11-02";

/** Placeholder the owner must fill before launch. Rendered visibly so it cannot be missed. */
export function Placeholder({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-warning-soft px-1 font-medium text-warning">[{children}]</mark>;
}

export type LegalSection = { id: string; title: string; body: React.ReactNode };

/** Shared layout for terms, privacy, disclaimer, grievance and security pages. */
export function LegalDoc({
  title,
  intro,
  path,
  sections,
  reviewNote = true,
}: {
  title: string;
  intro: React.ReactNode;
  path: string;
  sections: LegalSection[];
  reviewNote?: boolean;
}) {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: title, path },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: title,
            url: absoluteUrl(path),
            inLanguage: "en-IN",
            dateModified: LEGAL_LAST_UPDATED_ISO,
          },
        ]}
      />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/" className="hover:text-ink">
            Home
          </Link>{" "}
          / <span className="text-ink-2">{title}</span>
        </nav>
        <header className="mt-4 max-w-3xl">
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{title}</h1>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <FileClock className="size-4" aria-hidden /> Last updated: <time dateTime={LEGAL_LAST_UPDATED_ISO}>{LEGAL_LAST_UPDATED}</time>
          </p>
          {reviewNote ? (
            <p className="mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink-2">
              This document will be reviewed by counsel before launch.
            </p>
          ) : null}
          <div className="mt-5 text-lg leading-relaxed text-ink-2">{intro}</div>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">On this page</p>
              <ol className="space-y-1 text-sm">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-ink-2 hover:bg-surface-2 hover:text-ink">
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
          <div className="prose-legal max-w-3xl min-w-0">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2>
                  {i + 1}. {s.title}
                </h2>
                {s.body}
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
