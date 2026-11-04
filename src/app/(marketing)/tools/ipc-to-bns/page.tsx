import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CalendarClock, FileSearch } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { Badge } from "@/components/ui/display";
import { Converter } from "@/components/research/converter";
import { SourceNotice } from "@/components/research/source-notice";
import { converterData } from "@/lib/corpus/data";
import { absoluteUrl, breadcrumbJsonLd } from "@/lib/corpus/seo";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "IPC to BNS converter (and CrPC to BNSS, Evidence Act to BSA)",
  description:
    "Find the Bharatiya Nyaya Sanhita section for any IPC section, and BNSS for CrPC, BSA for the Evidence Act, from the official NCRB correspondence table. Enter a date to see which code governs.",
  alternates: { canonical: "/tools/ipc-to-bns" },
  openGraph: { url: "/tools/ipc-to-bns", type: "website" },
};

const facts = [
  { icon: BadgeCheck, title: "Official correspondence", body: "Pairs come from the NCRB SANKALAN tables published by the National Crime Records Bureau, Ministry of Home Affairs." },
  { icon: CalendarClock, title: "Date decides the code", body: "Offences before 1 July 2024 stay under the IPC. Pending proceedings stay under the CrPC and Evidence Act." },
  { icon: FileSearch, title: "Full text on both sides", body: "Every result links to the bare-act section from India Code, so you can compare wording and punishment." },
];

export default function IpcToBnsPage() {
  const data = converterData();
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "IPC to BNS converter", path: "/tools/ipc-to-bns" },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "IPC to BNS converter",
            url: absoluteUrl("/tools/ipc-to-bns"),
            applicationCategory: "ReferenceApplication",
            operatingSystem: "Web",
            inLanguage: "en-IN",
            isAccessibleForFree: true,
            publisher: { "@type": "Organization", name: site.name, url: site.url },
            offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
          },
        ]}
      />
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[radial-gradient(ellipse_at_top,var(--primary-soft),transparent_65%)]" />
        <div className="relative mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-6 sm:pt-14">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <Link href="/" className="hover:text-ink">
              Home
            </Link>{" "}
            / <span className="text-ink-2">IPC to BNS converter</span>
          </nav>
          <Badge tone="primary" className="mt-4">
            Free tool · no sign-in
          </Badge>
          <h1 className="mt-3 max-w-3xl font-serif text-[34px] leading-tight font-semibold tracking-tight text-ink sm:text-5xl">IPC → BNS converter</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2">
            Type an old section to get its new number, or the other way round. Works for the IPC and BNS, CrPC and BNSS, and the Evidence Act and
            BSA.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {data.pairs.length === 0 ? (
          <p className="text-muted">The correspondence data has not been generated yet.</p>
        ) : (
          <Converter data={data} />
        )}

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-surface p-5">
              <f.icon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-semibold text-ink">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>

        <SourceNotice className="mt-10" note="Section text: India Code. Correspondence: NCRB SANKALAN section tables (National Crime Records Bureau, Ministry of Home Affairs)." />
      </div>
    </>
  );
}
