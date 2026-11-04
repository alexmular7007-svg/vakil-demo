import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, IconTile } from "@/components/ui/display";
import { absoluteUrl } from "@/lib/corpus/seo";
import { site } from "@/lib/site";
import type { LucideIcon } from "lucide-react";

export type FaqItem = { q: string; a: string };

/** schema.org FAQPage. Answers must match the visible text. */
export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: it.a } })),
  };
}

export function toolJsonLd(name: string, path: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    description,
    url: absoluteUrl(path),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "en-IN",
    isAccessibleForFree: true,
    publisher: { "@type": "Organization", name: site.name, url: site.url },
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
  };
}

/** Hero band for a free public tool page. */
export function ToolHero({ crumb, title, intro }: { crumb: string; title: string; intro: string }) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[radial-gradient(ellipse_at_top,var(--primary-soft),transparent_65%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-6 sm:pt-14">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/" className="hover:text-ink">
            Home
          </Link>{" "}
          / <span className="text-ink-2">{crumb}</span>
        </nav>
        <Badge tone="primary" className="mt-4">
          Free tool · no sign-in
        </Badge>
        <h1 className="mt-3 max-w-3xl font-serif text-[34px] leading-tight font-semibold tracking-tight text-ink sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2">{intro}</p>
      </div>
    </section>
  );
}

export function RuleCards({ items }: { items: { icon: LucideIcon; title: string; body: string; cite: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((f) => (
        <div key={f.title} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <IconTile icon={f.icon} size="sm" />
          <h3 className="mt-3 font-semibold text-ink">{f.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
          <p className="mt-2 text-xs font-medium text-accent">{f.cite}</p>
        </div>
      ))}
    </div>
  );
}

export function FaqSection({ items }: { items: FaqItem[] }) {
  return (
    <section aria-labelledby="faq" className="space-y-4">
      <h2 id="faq" className="font-serif text-2xl font-semibold tracking-tight text-ink">
        Questions advocates ask
      </h2>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface shadow-sm">
        {items.map((it) => (
          <details key={it.q} className="group px-4 sm:px-5">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <span>{it.q}</span>
              <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="pb-4 text-sm leading-relaxed text-ink-2">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function SignupBand({ title, body }: { title: string; body: string }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <h2 className="font-serif text-xl font-semibold text-ink">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{body}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button asChild>
          <Link href="/signup">
            Start free <ArrowRight aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    </section>
  );
}
