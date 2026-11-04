import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Fingerprint, KeyRound, ShieldCheck } from "lucide-react";
import { Logo, LogoMark, Wordmark } from "@/components/brand";

export const metadata: Metadata = { robots: { index: false, follow: true } };

const assurances = [
  { icon: ShieldCheck, title: "Row-level security", body: "The database itself keeps your matters and documents to you." },
  { icon: KeyRound, title: "Two-factor sign-in", body: "Authenticator-app codes and backup codes for every account." },
  { icon: Fingerprint, title: "Tamper-evident records", body: "Audit events and signatures are hash-chained and append-only." },
  { icon: BadgeCheck, title: "Citations checked", body: "Every AI citation is checked against the actual text." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col">
        {/* Phones: a navy brand band above the form, as on banking sign-in screens */}
        <div className="brand-surface px-5 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-16 lg:hidden">
          <Link href="/" aria-label="Vaakil AI home" className="inline-flex items-center gap-2.5">
            <LogoMark className="size-10" />
            <Wordmark tone="onBrand" />
          </Link>
          <p className="mt-5 font-serif text-2xl leading-snug font-semibold">Your legal workspace, secured.</p>
        </div>
        <div className="hidden px-8 pt-7 lg:block">
          <Logo />
        </div>
        <div className="-mt-10 flex flex-1 items-start justify-center px-4 pb-8 sm:px-8 lg:mt-0 lg:items-center lg:py-10">
          <div className="glass w-full max-w-[400px] rounded-xl p-6 shadow-lg sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            {children}
          </div>
        </div>
        <p className="px-4 pb-6 text-center text-xs text-muted">
          By continuing you agree to the{" "}
          <Link href="/legal/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="underline">
            Privacy notice
          </Link>
          .
        </p>
      </div>

      <div className="brand-surface relative hidden overflow-hidden lg:block">
        <div className="absolute inset-y-0 left-0 w-px bg-gold/30" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <p className="text-xs font-bold tracking-[0.18em] text-gold-bright uppercase">Vaakil AI · Legal workspace</p>
          <div>
            <h2 className="max-w-md font-serif text-[40px] leading-[1.1] font-semibold">
              Every citation traced. <em className="text-gold-bright">Every signature on record.</em>
            </h2>
            <ul className="mt-10 grid max-w-lg gap-5 sm:grid-cols-2">
              {assurances.map((a) => (
                <li key={a.title} className="flex gap-3">
                  <span className="glass-on-brand inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] text-gold-bright">
                    <a.icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{a.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-on-brand-muted">{a.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-on-brand-muted">A legal assistant for advocates, not a substitute for one.</p>
        </div>
      </div>
    </div>
  );
}
