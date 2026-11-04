import Link from "next/link";
import { Logo } from "@/components/brand";
import { site } from "@/lib/site";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/templates", label: "Drafting templates" },
      { href: "/security", label: "Security" },
    ],
  },
  {
    title: "Free tools",
    links: [
      { href: "/tools/ipc-to-bns", label: "IPC → BNS converter" },
      { href: "/tools/limitation-calculator", label: "Limitation calculator" },
      { href: "/tools/cheque-bounce-timeline", label: "Cheque-bounce timeline" },
      { href: "/law", label: "Bare acts" },
      { href: "/advocates", label: "Verified advocates" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/terms", label: "Terms of use" },
      { href: "/legal/privacy", label: "Privacy notice" },
      { href: "/legal/disclaimer", label: "Disclaimer" },
      { href: "/legal/grievance", label: "Grievance officer" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="h-px gold-rule" aria-hidden />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted">
            Legal AI for Indian advocates: research, drafting, review and e-sign in English and Hindi.
          </p>
          <p className="text-sm text-muted">
            Part of <a href={site.parentSite} className="text-primary hover:underline">vaakil.com</a>
          </p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <p className="mb-3 text-sm font-semibold text-ink">{c.title}</p>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-xs leading-relaxed text-muted sm:px-6">
          <p>{site.disclaimer}</p>
          <p>
            Bar Council of India rules: Vaakil AI does not advertise or solicit work for advocates. Advocate profiles are
            shown for information only, unranked, at the advocate&apos;s request.
          </p>
          <p>© Vaakil.com. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
