import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Logo } from "@/components/brand";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Review and sign",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default function SignerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo />
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Lock className="size-3.5" aria-hidden /> Secure signing
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl space-y-2 px-4 py-5 text-xs text-muted sm:px-6">
          <p>{site.disclaimer}</p>
          <p>
            <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-ink">
              Privacy notice
            </Link>{" "}
            · Grievance officer:{" "}
            <a href={`mailto:${site.grievanceEmail}`} className="underline underline-offset-2 hover:text-ink">
              {site.grievanceEmail}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
