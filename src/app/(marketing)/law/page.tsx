import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowLeftRight, BookOpenText, History, Scale } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { Badge } from "@/components/ui/display";
import { SourceNotice } from "@/components/research/source-notice";
import { ACT_INFO, formatActDate } from "@/lib/corpus/acts";
import { loadActs, type CorpusAct } from "@/lib/corpus/data";
import { absoluteUrl, breadcrumbJsonLd } from "@/lib/corpus/seo";

export const metadata: Metadata = {
  title: "Bare acts: BNS, BNSS, BSA, IPC, CrPC and more",
  description:
    "Read the official text of the Bharatiya Nyaya Sanhita, Bharatiya Nagarik Suraksha Sanhita, Bharatiya Sakshya Adhiniyam, IPC, CrPC, Evidence Act and other central Acts, section by section, with old and new code correspondence.",
  alternates: { canonical: "/law" },
  openGraph: { url: "/law", type: "website" },
};

function ActCard({ act }: { act: CorpusAct }) {
  const info = ACT_INFO[act.id];
  return (
    <Link
      href={`/law/${info.slug}`}
      className="group flex flex-col rounded-lg border border-border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-sm font-bold text-primary">
          {info.abbr.length <= 4 ? info.abbr : <BookOpenText className="size-5" aria-hidden />}
        </span>
        {act.repealedOn ? <Badge tone="warning">Repealed {formatActDate(act.repealedOn)}</Badge> : <Badge tone="success">In force</Badge>}
      </div>
      <h3 className="mt-4 font-serif text-lg leading-snug font-semibold text-ink group-hover:text-primary">{act.title}</h3>
      <p className="mt-1 text-sm text-muted">
        {act.actNo} · {act.sectionCount} sections
      </p>
      {act.replacedBy ? (
        <p className="mt-3 text-sm text-ink-2">Replaced by the {ACT_INFO[act.replacedBy].shortTitle}; still governs earlier matters.</p>
      ) : act.replaces ? (
        <p className="mt-3 text-sm text-ink-2">Replaced the {ACT_INFO[act.replaces].shortTitle} from 1 July 2024.</p>
      ) : null}
      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary">
        Read sections <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

export default function LawIndexPage() {
  const acts = loadActs();
  const groups = [
    { title: "New criminal laws", icon: Scale, note: "In force from 1 July 2024.", acts: acts.filter((a) => a.replaces) },
    { title: "Repealed criminal codes", icon: History, note: "Repealed on 1 July 2024, but still govern offences and pending proceedings from before that date.", acts: acts.filter((a) => a.repealedOn) },
    { title: "Other central Acts", icon: BookOpenText, note: "Frequently used civil, family and public-law statutes.", acts: acts.filter((a) => !a.replaces && !a.repealedOn) },
  ].filter((g) => g.acts.length > 0);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Bare acts", path: "/law" },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Bare acts",
            url: absoluteUrl("/law"),
            inLanguage: "en-IN",
            hasPart: acts.map((a) => ({ "@type": "Legislation", name: a.title, legislationIdentifier: a.actNo, url: absoluteUrl(`/law/${ACT_INFO[a.id].slug}`) })),
          },
        ]}
      />
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <Link href="/" className="hover:text-ink">
              Home
            </Link>{" "}
            / <span className="text-ink-2">Bare acts</span>
          </nav>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">Bare acts, section by section</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2">
            The official text of India&apos;s criminal codes, old and new, and other central Acts, taken from India Code. Each section of the
            new codes links to its counterpart in the old one.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/tools/ipc-to-bns"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-ink shadow-sm hover:bg-primary-hover"
            >
              <ArrowLeftRight className="size-4" aria-hidden /> IPC → BNS converter
            </Link>
            <Link href="/law/bns/103" className="inline-flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-5 text-sm font-medium text-ink hover:bg-surface-2">
              Example: BNS section 103
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-12 sm:px-6">
        {groups.length === 0 ? (
          <p className="text-muted">The bare-act data has not been generated yet.</p>
        ) : (
          groups.map((g) => (
            <section key={g.title} aria-labelledby={`g-${g.title}`}>
              <div className="mb-5 flex items-start gap-3">
                <g.icon className="mt-1 size-5 text-primary" aria-hidden />
                <div>
                  <h2 id={`g-${g.title}`} className="font-serif text-2xl font-semibold text-ink">
                    {g.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted">{g.note}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.acts.map((a) => (
                  <ActCard key={a.id} act={a} />
                ))}
              </div>
            </section>
          ))
        )}
        <SourceNotice />
      </div>
    </>
  );
}
