import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, BookOpenText, Home } from "lucide-react";
import { Logo } from "@/components/brand";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/law", label: "Bare acts", icon: BookOpenText },
  { href: "/tools/ipc-to-bns", label: "IPC → BNS converter", icon: ArrowLeftRight },
];

export default function NotFound() {
  return (
    <main id="content" className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
      <Logo />
      <p className="mt-10 font-serif text-6xl font-semibold text-primary">404</p>
      <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink">This page does not exist</h1>
      <p className="mt-3 max-w-md text-ink-2">
        The link may be old or mistyped. If you were looking for a section of an Act, check the number, including any letter such as 304A.
      </p>
      <nav aria-label="Helpful links" className="mt-8 flex flex-col gap-3 sm:flex-row">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-5 text-sm font-medium text-ink shadow-sm hover:bg-surface-2"
          >
            <l.icon className="size-4 text-primary" aria-hidden /> {l.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
