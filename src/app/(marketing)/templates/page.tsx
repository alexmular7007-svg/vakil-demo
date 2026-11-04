import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { Button } from "@/components/ui/button";
import { PublicTemplateBrowser } from "@/components/drafting/public-template-browser";
import { templateCatalog } from "@/lib/drafting/catalog";
import { templateCategories } from "@/lib/drafting/types";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Indian legal drafting templates",
  description:
    "Free formats for Indian legal drafts: Section 138 cheque bounce notice, bail applications under the BNSS, affidavits, rent agreements, NDAs, RTI applications and more, in English and Hindi.",
  alternates: { canonical: "/templates" },
  openGraph: {
    title: "Indian legal drafting templates · Vaakil AI",
    description: "Court and contract formats for Indian advocates, with guided intake, Hindi versions and Word export.",
    url: "/templates",
    type: "website",
  },
};

export default function TemplatesPage() {
  const cards = templateCatalog.map((t) => ({
    slug: t.slug,
    title: t.title,
    titleHi: t.titleHi,
    category: t.category,
    summary: t.summary,
    lawRefs: t.lawRefs,
    hasHindi: Boolean(t.bodyHi),
  }));
  const categories = templateCategories.filter((c) => templateCatalog.some((t) => t.category === c));

  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: site.url },
              { "@type": "ListItem", position: 2, name: "Templates", item: `${site.url}/templates` },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Indian legal drafting templates",
            itemListElement: templateCatalog.map((t, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: t.title,
              url: `${site.url}/templates/${t.slug}`,
            })),
          },
        ]}
      />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-ink">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink">
              Templates
            </li>
          </ol>
        </nav>

        <div className="max-w-3xl">
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">Drafting templates for Indian practice</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-2">
            Notices, bail applications, petitions, affidavits and agreements in conventional Indian formats. Answer a few questions and get a
            draft you can edit, translate and export to Word or PDF.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup">
                Start free <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/app/drafts/new">Open the drafting studio</Link>
            </Button>
          </div>
          <p className="mt-5 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-ink-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              These templates have not yet been reviewed by an advocate. Check every draft against current law and your court&apos;s rules before
              use.
            </span>
          </p>
        </div>

        <div className="mt-12">
          <PublicTemplateBrowser templates={cards} categories={[...categories]} />
        </div>

        <p className="mt-12 max-w-3xl text-xs leading-relaxed text-muted">{site.disclaimer}</p>
      </div>
    </>
  );
}
