import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Bot,
  Calculator,
  CalendarClock,
  CalendarDays,
  FilePen,
  FileSearch,
  FileSignature,
  Fingerprint,
  KeyRound,
  Landmark,
  Languages,
  Lock,
  MessageSquareText,
  ReceiptIndianRupee,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/brand";
import { AppPhone } from "@/components/marketing/app-phone";
import { Button } from "@/components/ui/button";
import { Badge, IconTile, type TileTone } from "@/components/ui/display";
import { JsonLd } from "@/components/json-ld";
import { site } from "@/lib/site";

const featureGroups: { title: string; items: { icon: LucideIcon; tone: TileTone; title: string; body: string }[] }[] = [
  {
    title: "Research & AI",
    items: [
      { icon: MessageSquareText, tone: "brand", title: "Ask AI, with sources", body: "Answers on Indian law with the position of law and citations to the section. If no source supports a point, the answer says so." },
      { icon: BookOpenText, tone: "navy", title: "Bare acts and the new codes", body: "BNS, BNSS and BSA next to the IPC, CrPC and Evidence Act. The right code is picked from the offence date." },
      { icon: Bot, tone: "slate", title: "Your own assistants", body: "Build assistants with standing instructions and your documents as knowledge, under Vaakil's citation rules." },
    ],
  },
  {
    title: "Drafting & signing",
    items: [
      { icon: FilePen, tone: "teal", title: "Drafting in Indian formats", body: "Legal notices, bail applications, affidavits and agreements in English or Hindi. Export to Word or PDF." },
      { icon: FileSearch, tone: "slate", title: "Document review", body: "Summarise a PDF or Word file, flag risky clauses, or compare two versions side by side." },
      { icon: FileSignature, tone: "maroon", title: "Multi-party e-sign", body: "Lawyer reviews, then sender and receiver sign, with a hash-chained audit trail and a completion certificate." },
    ],
  },
  {
    title: "Practice",
    items: [
      { icon: CalendarDays, tone: "green", title: "Case diary", body: "Today's board, next dates, court and item numbers, tasks, calendar export and a one-tap WhatsApp update for the client." },
      { icon: ReceiptIndianRupee, tone: "gold", title: "Clients and fee book", body: "Client register with a conflict check, fee invoices with GST reverse-charge notes, receipts and UPI payment links." },
      { icon: Calculator, tone: "maroon", title: "Legal calculators", body: "Limitation, cheque-bounce (NI Act s.138) timelines, interest and day counts, with the working shown step by step." },
    ],
  },
];

const proof: { icon: LucideIcon; tone: TileTone; value: string; label: string }[] = [
  { icon: BookOpenText, tone: "navy", value: "2,680", label: "Bare-act sections, from India Code" },
  { icon: ArrowLeftRight, tone: "gold", value: "1,236", label: "Old ↔ new code mappings (NCRB)" },
  { icon: FilePen, tone: "teal", value: "15", label: "Indian drafting templates" },
  { icon: Languages, tone: "green", value: "2", label: "Languages: English and हिन्दी" },
];

const freeTools: { href: string; icon: LucideIcon; tone: TileTone; title: string; body: string }[] = [
  { href: "/tools/ipc-to-bns", icon: ArrowLeftRight, tone: "gold", title: "IPC → BNS converter", body: "Find the matching section, by offence date." },
  { href: "/tools/limitation-calculator", icon: CalendarClock, tone: "maroon", title: "Limitation calculator", body: "Last date to file, with the working shown." },
  { href: "/tools/cheque-bounce-timeline", icon: Landmark, tone: "teal", title: "Cheque-bounce timeline", body: "NI Act s.138 notice and complaint dates." },
  { href: "/law", icon: BookOpenText, tone: "navy", title: "Bare acts", body: "Ten central acts, section by section." },
];

const steps = [
  { n: "1", title: "Retrieve", body: "Your question is matched against the text of Indian statutes and judgments, and your own documents." },
  { n: "2", title: "Answer from sources", body: "The model writes only from the passages it was given and tags each claim with its source." },
  { n: "3", title: "Check every citation", body: "Before you see the answer, each cited section or judgment is checked against the corpus and marked verified or unverified." },
];

const security = [
  { icon: Lock, title: "Your rows, only yours", body: "The database itself refuses to show or change another user's data (row-level security), even if app code has a bug." },
  { icon: Fingerprint, title: "Tamper-evident records", body: "Audit events, draft versions and signature steps are hash-chained and append-only. Any edit or deletion breaks the chain." },
  { icon: KeyRound, title: "Two-factor sign-in", body: "Authenticator-app codes for advocates and admins. All provider keys stay on the server, never in your browser." },
  { icon: ShieldCheck, title: "Built for DPDP", body: "Consent records, a data-rights centre and a named grievance officer, following India's Digital Personal Data Protection Rules." },
];

export default function HomePage() {
  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: site.name,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: site.description,
            url: site.url,
            inLanguage: ["en-IN", "hi-IN"],
            offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
          },
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Vaakil.com",
            url: site.parentSite,
          },
        ]}
      />

      {/* Hero */}
      <section className="brand-surface relative overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 h-px gold-rule" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 md:pt-16 lg:grid-cols-[1.1fr_1fr] lg:pt-20 lg:pb-20">
          <div>
            <p className="glass-on-brand mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-gold-bright">
              <BadgeCheck className="size-3.5" /> Built for Indian courts · English &amp; <span lang="hi">हिन्दी</span>
            </p>
            <h1 className="font-serif text-[40px] leading-[1.06] font-semibold tracking-tight sm:text-5xl lg:text-[60px]">
              The legal workspace that <em className="text-gold-bright">shows its sources.</em>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-on-brand-muted">
              Research Indian law, draft court-ready documents, run your case diary and collect signatures, with every citation checked
              against the actual text before you rely on it.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="gold">
                <Link href="/signup">
                  Start free <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="border border-white/20 text-on-brand hover:bg-white/10 hover:text-on-brand">
                <Link href="/tools/ipc-to-bns">Try the IPC → BNS converter</Link>
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-on-brand-muted">
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-gold-bright" /> Row-level data security
              </li>
              <li className="flex items-center gap-2">
                <BadgeCheck className="size-4 text-gold-bright" /> Citations checked
              </li>
              <li className="flex items-center gap-2">
                <Smartphone className="size-4 text-gold-bright" /> Installs like an app
              </li>
            </ul>
          </div>

          <div className="relative mx-auto flex justify-center lg:justify-end">
            <AppPhone className="rotate-[-2deg]" />
            <div className="glass absolute bottom-10 -left-4 hidden w-64 rounded-lg p-3.5 text-ink shadow-lg sm:block lg:-left-16">
              <p className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Ask AI · Source check</p>
              <p className="mt-1.5 text-[13px] leading-snug text-ink-2">
                Culpable homicide not amounting to murder: <span className="rounded bg-primary-soft px-1 font-semibold text-primary">BNS s.105</span> (formerly IPC s.304).
              </p>
              <Badge tone="success" dot className="mt-2">
                Verified in corpus
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Proof strip: real figures from the shipped corpus and templates */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 py-8 sm:px-6 lg:grid-cols-4">
          {proof.map((p) => (
            <div key={p.label} className="flex items-center gap-3 py-2">
              <IconTile icon={p.icon} tone={p.tone} />
              <div>
                <p className="tabular font-serif text-2xl leading-none font-semibold text-ink">{p.value}</p>
                <p className="mt-1 text-xs font-semibold text-muted">{p.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features, grouped like the app */}
      <section id="features" className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-bold tracking-[0.16em] text-accent uppercase">One workspace</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-[42px] sm:leading-tight">Everything a chamber runs on, in one place</h2>
            <p className="mt-3 text-ink-2">From the first question to the signed agreement and the next date of hearing, without copying text between five tools.</p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {featureGroups.map((g) => (
              <div key={g.title} className="rounded-lg border border-border/80 bg-surface p-6 shadow-sm">
                <p className="font-serif text-xl font-semibold text-ink">{g.title}</p>
                <ul className="mt-5 space-y-5">
                  {g.items.map((f) => (
                    <li key={f.title} className="flex gap-3.5">
                      <IconTile icon={f.icon} tone={f.tone} size="sm" />
                      <div>
                        <h3 className="text-[15px] font-bold text-ink">{f.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted">{f.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How citations are checked */}
      <section className="border-y border-border bg-surface py-16 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-accent uppercase">Why this matters</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-[42px] sm:leading-tight">Courts have zero tolerance for invented citations</h2>
            <p className="mt-4 text-ink-2">
              In 2026 the Supreme Court of India declared zero tolerance for unverified AI-generated precedents. Vaakil AI is designed around that:
              answers come from retrieved text, and every citation is checked before it reaches you.
            </p>
          </div>
          <ol className="grid gap-4">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-4 rounded-lg border border-border/80 bg-bg p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-2 to-brand font-serif text-lg font-semibold text-gold-bright">
                  {s.n}
                </span>
                <div>
                  <h3 className="font-bold text-ink">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Free tools */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-xs font-bold tracking-[0.16em] text-accent uppercase">Free tools</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-[42px]">Useful before you even sign up</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {freeTools.map((t) => (
              <Link key={t.href} href={t.href} className="pressable group rounded-lg border border-border/80 bg-surface p-5 shadow-sm hover:shadow-md">
                <IconTile icon={t.icon} tone={t.tone} />
                <p className="mt-4 font-bold text-ink">{t.title}</p>
                <p className="mt-1 text-sm text-muted">{t.body}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="brand-surface py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-xs font-bold tracking-[0.16em] text-gold-bright uppercase">Security</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-[42px]">Nobody can quietly change your records</h2>
          <p className="mt-3 max-w-2xl text-on-brand-muted">Security is built into the database, not bolted on in the browser.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {security.map((s) => (
              <div key={s.title} className="glass-on-brand rounded-lg p-5">
                <span className="inline-flex size-11 items-center justify-center rounded-[14px] bg-gold-bright/15 text-gold-bright">
                  <s.icon className="size-[22px]" />
                </span>
                <h3 className="mt-4 font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-on-brand-muted">{s.body}</p>
              </div>
            ))}
          </div>
          <Link href="/security" className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-bright hover:underline">
            Read how security works <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="rounded-2xl border border-border/80 bg-surface p-8 text-center shadow-md sm:p-12">
            <LogoMark className="mx-auto size-14" />
            <h2 className="mt-5 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Start with your next matter</h2>
            <p className="mt-3 text-ink-2">Free to start. Advocate Pro gives unlimited questions under a fair-use policy.</p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">Create free account</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted">No card needed. A legal assistant for advocates, not a substitute for one.</p>
          </div>
        </div>
      </section>
    </>
  );
}
