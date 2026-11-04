import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpenText, CalendarDays, FilePen, Inbox, ReceiptIndianRupee, Scale, Signature, Sparkles } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, IconTile, ListRow, PageHeader, SectionHeader, type TileTone } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };

const colors = [
  ["bg", "Page background"],
  ["surface", "Cards"],
  ["surface-2", "Subtle fill"],
  ["ink", "Text"],
  ["muted", "Secondary text"],
  ["primary", "Actions"],
  ["primary-soft", "Selected"],
  ["brand", "Navy surfaces"],
  ["gold", "Brass accent"],
  ["success", "Done, paid"],
  ["warning", "Due, adjourned"],
  ["danger", "Overdue, delete"],
  ["info", "Listed, scheduled"],
] as const;

const tones: TileTone[] = ["navy", "gold", "green", "maroon", "teal", "slate", "brand"];
const tileIcons = [Scale, Sparkles, CalendarDays, Signature, FilePen, BookOpenText, ReceiptIndianRupee];

/** Living reference of the design system (development only). See docs/DESIGN-SYSTEM.md. */
export default function DesignSystemPage() {
  if (env.isProd) notFound();
  return (
    <main className="ambient-bg min-h-dvh">
      <div className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6">
        <PageHeader
          eyebrow="Development"
          icon={Scale}
          title="Vaakil AI design system"
          description="Every token and component in one place. Change tokens in src/app/globals.css; components live in src/components/ui."
        />

        <section>
          <SectionHeader title="Brand" />
          <div className="flex flex-wrap items-center gap-6">
            <LogoMark className="size-16" />
            <Wordmark />
            <div className="brand-surface flex items-center gap-3 rounded-lg px-5 py-4">
              <LogoMark />
              <Wordmark tone="onBrand" />
            </div>
          </div>
        </section>

        <section>
          <SectionHeader title="Colour tokens" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {colors.map(([token, use]) => (
              <div key={token} className="overflow-hidden rounded-md border border-border bg-surface">
                <div className="h-14 border-b border-border" style={{ background: `var(--${token})` }} />
                <div className="p-2">
                  <p className="font-mono text-[11px] text-ink">--{token}</p>
                  <p className="text-[11px] text-muted">{use}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="Type" />
          <Card className="space-y-2 p-5">
            <p className="font-serif text-4xl font-semibold text-ink">Newsreader display, 600</p>
            <p className="font-serif text-2xl font-semibold text-ink">Page titles and card headings</p>
            <p className="text-base text-ink">Inter body text at 16px on phones (no iOS zoom), 14–15px on desktop.</p>
            <p className="text-sm text-muted">Muted secondary text for metadata.</p>
            <p className="tabular text-sm text-ink-2">Tabular figures: ₹1,20,000 · 03/11/2026 · Item 14</p>
            <p lang="hi" className="font-serif text-xl text-ink">हिन्दी शीर्षक · Devanagari serif</p>
          </Card>
        </section>

        <section>
          <SectionHeader title="Buttons" />
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="gold">Gold</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="link">Link</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </section>

        <section>
          <SectionHeader title="Status chips and icon tiles" />
          <div className="flex flex-wrap gap-2">
            <Badge tone="info" dot>Listed today</Badge>
            <Badge tone="warning" dot>Adjourned</Badge>
            <Badge tone="success" dot>Paid</Badge>
            <Badge tone="danger" dot>Overdue</Badge>
            <Badge tone="neutral" dot>Draft</Badge>
            <Badge tone="accent" dot>AI draft · verify</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {tones.map((t, i) => (
              <IconTile key={t} icon={tileIcons[i]} tone={t} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="List rows" action={<span>See all</span>} />
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              <ListRow href="#" icon={CalendarDays} tone="green" title="Recovery suit · Commercial Court" subtitle="10:30 · Item 14 · Court 12" trailing={<Badge tone="info" dot>Listed today</Badge>} />
              <ListRow href="#" icon={ReceiptIndianRupee} tone="gold" title="INV/2026-27/0001" subtitle="₹1,20,000 · due 18 Nov" trailing={<Badge tone="warning" dot>Partly paid</Badge>} />
              <ListRow icon={Signature} tone="maroon" title="NDA: Sharma & Verma" subtitle="Awaiting 2 signatures" />
            </ul>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Form fields</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Case title" htmlFor="ds-title" hint="Shown in the diary and on alerts.">
                <Input id="ds-title" placeholder="e.g. Sharma v. State of UP" />
              </Field>
              <Field label="Court" htmlFor="ds-court" error="Choose a court">
                <Select id="ds-court" aria-invalid defaultValue="">
                  <option value="">Choose</option>
                </Select>
              </Field>
              <Field label="Notes" htmlFor="ds-notes">
                <Textarea id="ds-notes" />
              </Field>
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Alert tone="info" title="Information">Neutral guidance.</Alert>
            <Alert tone="success" title="Done">The action worked.</Alert>
            <Alert tone="warning" title="Check this">Something needs attention.</Alert>
            <Alert tone="danger" title="Problem">Something failed.</Alert>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="brand-surface rounded-2xl p-6 shadow-brand">
            <p className="text-[11px] font-bold tracking-[0.16em] text-gold-bright uppercase">Brand surface</p>
            <p className="mt-1 font-serif text-3xl font-semibold">Today&apos;s board</p>
            <div className="glass-on-brand mt-4 rounded-lg p-4 text-sm">glass-on-brand panel</div>
          </div>
          <div className="glass rounded-xl p-6">
            <p className="text-sm font-bold text-ink">glass</p>
            <p className="mt-1 text-sm text-muted">For floating UI only: bars, pop-ups, sheets. Never for long reading text.</p>
          </div>
        </section>

        <section>
          <EmptyState icon={Inbox} title="Empty state" description="One sentence on what will appear here, and one action." action={<Button>Primary action</Button>} />
        </section>
      </div>
    </main>
  );
}
