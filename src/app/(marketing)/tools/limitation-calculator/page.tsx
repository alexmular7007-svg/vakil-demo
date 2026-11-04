import type { Metadata } from "next";
import { CalendarCheck2, CalendarX2, FileClock, Hourglass } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { LimitationCalculator } from "@/components/calculators/limitation-calculator";
import { FaqSection, faqJsonLd, RuleCards, SignupBand, ToolHero, toolJsonLd, type FaqItem } from "@/components/calculators/public-sections";
import { KIND_LABEL, LIMITATION_ARTICLES, LIMITATION_SCHEDULE_URL, type ProceedingKind } from "@/lib/calculators/limitation-articles";
import { breadcrumbJsonLd } from "@/lib/corpus/seo";

const PATH = "/tools/limitation-calculator";
const TITLE = "Limitation calculator (Limitation Act, 1963)";
const DESCRIPTION =
  "Free limitation calculator for Indian advocates. Pick an article of the Limitation Act Schedule, enter the date, and get the last day to file with s. 12 exclusions, certified-copy time and s. 4 court holidays applied, step by step.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { url: PATH, type: "website", title: TITLE, description: DESCRIPTION },
};

const rules = [
  {
    icon: CalendarX2,
    title: "First day excluded",
    body: "The day from which the period is reckoned is not counted, so a 30-day appeal from a decree of 1 January ends on 31 January.",
    cite: "s. 12(1), Limitation Act",
  },
  {
    icon: FileClock,
    title: "Copy time excluded",
    body: "For appeals, leave to appeal, revision and review, the time requisite for obtaining a certified copy is added back.",
    cite: "s. 12(2) and (3)",
  },
  {
    icon: CalendarCheck2,
    title: "Court closed on the last day",
    body: "If the period expires on a day the court is closed, you may file on the day it reopens. Enter your court's holidays.",
    cite: "s. 4",
  },
  {
    icon: Hourglass,
    title: "British calendar",
    body: "Months and years end on the corresponding date. If that month has no such day, the period ends on its last day.",
    cite: "s. 3(35) and (66), General Clauses Act",
  },
];

const faqs: FaqItem[] = [
  {
    q: "How is the limitation period counted?",
    a: "The day from which the period is reckoned is excluded (s. 12(1), Limitation Act, 1963). Months and years follow the British calendar (s. 3(35) and (66), General Clauses Act, 1897), so a three-year period from 10 March 2023 ends on 10 March 2026, and a 30-day appeal from a decree of 1 January ends on 31 January.",
  },
  {
    q: "What if the last day is a court holiday?",
    a: "If the prescribed period expires on a day the court is closed, the suit, appeal or application may be filed on the day the court reopens (s. 4). A court counts as closed on a day if it is closed during any part of its normal working hours. Add your court's holidays and vacation to the calculator to apply this.",
  },
  {
    q: "Is the time taken to get a certified copy excluded?",
    a: "For an appeal, an application for leave to appeal, a revision or a review, the day the judgment was pronounced and the time requisite for obtaining a copy of the decree, sentence or order, and of the judgment, are excluded (s. 12(2) and (3)). Time the court took to prepare the decree or order before the copy was applied for is not excluded (Explanation to s. 12).",
  },
  {
    q: "Can a delay be condoned?",
    a: "An appeal or application, other than an application under Order XXI of the Code of Civil Procedure, 1908, may be admitted after the period if the court is satisfied there was sufficient cause (s. 5). Section 5 does not apply to suits: a suit filed after the prescribed period must be dismissed even if limitation is not raised as a defence (s. 3).",
  },
  {
    q: "Does an acknowledgment or part payment extend limitation?",
    a: "A written acknowledgment of liability, signed before the period expires, starts a fresh period from the date it was signed (s. 18). A payment on account of a debt made before expiry starts a fresh period from the date of payment, if the payment is acknowledged in writing by the person who made it (s. 19). The calculator flags these but does not compute them.",
  },
  {
    q: "Do special laws change the period?",
    a: "Yes. Where a special or local law prescribes a different period, that period applies, and sections 4 to 24 apply only so far as that law does not expressly exclude them (s. 29(2)). Special laws may prescribe different periods; verify before filing.",
  },
];

const KINDS: ProceedingKind[] = ["suit", "appeal", "application"];

export default function LimitationCalculatorPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Limitation calculator", path: PATH },
          ]),
          toolJsonLd("Limitation calculator", PATH, DESCRIPTION),
          faqJsonLd(faqs),
        ]}
      />
      <ToolHero
        crumb="Limitation calculator"
        title="Limitation calculator"
        intro="Choose the article of the Limitation Act, 1963 that fits your case, enter the date time runs from, and get the last day to file with each step of the working and the section it comes from."
      />

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-8 sm:px-6 sm:py-10">
        <LimitationCalculator />

        <section aria-labelledby="rules" className="space-y-4">
          <h2 id="rules" className="font-serif text-2xl font-semibold tracking-tight text-ink">
            How the calculator counts
          </h2>
          <RuleCards items={rules} />
        </section>

        <section aria-labelledby="articles" className="space-y-4">
          <div>
            <h2 id="articles" className="font-serif text-2xl font-semibold tracking-tight text-ink">
              Articles covered
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              {LIMITATION_ARTICLES.length} entries, each checked against the{" "}
              <a href={LIMITATION_SCHEDULE_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                Schedule on India Code
              </a>
              . Articles not listed here are not yet in the calculator.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {KINDS.map((k) => (
              <div key={k} className="rounded-lg border border-border bg-surface shadow-sm">
                <h3 className="border-b border-border px-4 py-3 text-[13px] font-bold tracking-[0.08em] text-muted uppercase">{KIND_LABEL[k]}</h3>
                <ul className="divide-y divide-border">
                  {LIMITATION_ARTICLES.filter((a) => a.kind === k).map((a) => (
                    <li key={a.id} className="px-4 py-3">
                      <p className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-semibold text-ink">
                          Art. {a.article} <span className="font-normal text-ink-2">{a.title}</span>
                        </span>
                        <span className="shrink-0 font-semibold text-accent tabular">{a.periodText.replace(".", "")}</span>
                      </p>
                      <p className="mt-0.5 text-[13px] text-muted">From: {a.runsFrom}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <FaqSection items={faqs} />

        <SignupBand
          title="Use it inside your workspace"
          body="Vaakil AI brings these calculators together with statute research, bilingual drafting and e-sign for Indian advocates. Free to start."
        />
      </div>
    </>
  );
}
