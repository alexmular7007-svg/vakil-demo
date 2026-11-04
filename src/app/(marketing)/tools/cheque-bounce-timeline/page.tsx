import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Banknote, Gavel, Hourglass, Mail } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { ChequeBounceCalculator } from "@/components/calculators/cheque-bounce-calculator";
import { FaqSection, faqJsonLd, RuleCards, SignupBand, ToolHero, toolJsonLd, type FaqItem } from "@/components/calculators/public-sections";
import { getTemplate } from "@/lib/drafting/catalog";
import { breadcrumbJsonLd } from "@/lib/corpus/seo";

const PATH = "/tools/cheque-bounce-timeline";
const TITLE = "Cheque bounce (Section 138) deadline calculator";
const DESCRIPTION =
  "Free Section 138 NI Act timeline: cheque validity, the 30-day demand notice, the drawer's 15 days to pay, the cause of action and the one-month deadline for the complaint under Section 142, with the working shown.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { url: PATH, type: "website", title: TITLE, description: DESCRIPTION },
};

const rules = [
  {
    icon: Banknote,
    title: "Present within validity",
    body: "Within six months of the cheque's date or its validity, whichever is earlier. RBI: three months for cheques dated from 1 April 2012.",
    cite: "s. 138, proviso (a)",
  },
  {
    icon: Mail,
    title: "Notice within 30 days",
    body: "A written demand to the drawer within thirty days of receiving the bank's information that the cheque was returned unpaid.",
    cite: "s. 138, proviso (b)",
  },
  {
    icon: Hourglass,
    title: "15 days to pay",
    body: "The drawer has fifteen days from receipt of the notice. If unpaid, the cause of action arises the next day.",
    cite: "s. 138, proviso (c)",
  },
  {
    icon: Gavel,
    title: "Complaint within one month",
    body: "One month from the cause of action, to the corresponding date. A later complaint needs sufficient cause.",
    cite: "s. 142(1)(b) and proviso",
  },
];

const faqs: FaqItem[] = [
  {
    q: "How long is a cheque valid for presentation?",
    a: "Section 138 applies only if the cheque was presented within six months from the date on which it is drawn or within its period of validity, whichever is earlier (proviso (a)). From 1 April 2012 the Reserve Bank of India directed banks not to pay cheques presented beyond three months from the date of the instrument, so for most cheques the limit is three months.",
  },
  {
    q: "When must the demand notice be sent?",
    a: "The payee must demand payment by a notice in writing to the drawer within thirty days of receiving information from the bank that the cheque was returned unpaid (proviso (b) to s. 138). The calculator excludes the day the information was received.",
  },
  {
    q: "When does the cause of action arise?",
    a: "When the drawer fails to pay within fifteen days of receiving the notice (proviso (c) to s. 138). Excluding the day of receipt, the fifteen days end on the fifteenth day after it, and the cause of action arises the next day. In Saketh India Ltd v India Securities Ltd (Supreme Court, 1999), notices served on 29 September 1995 gave a cause of action on 15 October 1995.",
  },
  {
    q: "What is the deadline for filing the complaint?",
    a: "The complaint must be made within one month of the date on which the cause of action arises (s. 142(1)(b)). In Saketh India the Supreme Court excluded the day the cause of action arose and read a month as a British-calendar month, so a cause of action on 15 October 1995 gave a last day of 15 November 1995.",
  },
  {
    q: "What if the complaint is filed late?",
    a: "The court may take cognizance after the prescribed period if the complainant satisfies it that there was sufficient cause for not filing in time (proviso to s. 142(1)(b)). File an application explaining the delay with the complaint.",
  },
  {
    q: "Which court can try the complaint?",
    a: "If the cheque was delivered for collection through an account, a court within whose local jurisdiction the payee's branch maintaining that account is situated. If it was presented otherwise than through an account, a court within whose jurisdiction the drawee branch where the drawer maintains the account is situated (s. 142(2)).",
  },
];

const NOTICE_TEMPLATE = "cheque-bounce-notice-section-138";

export default function ChequeBounceTimelinePage() {
  const template = getTemplate(NOTICE_TEMPLATE);
  const templateHref = template ? `/templates/${template.slug}` : null;
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Cheque bounce timeline", path: PATH },
          ]),
          toolJsonLd("Cheque bounce (Section 138) timeline", PATH, DESCRIPTION),
          faqJsonLd(faqs),
        ]}
      />
      <ToolHero
        crumb="Cheque bounce timeline"
        title="Cheque bounce timeline (Section 138)"
        intro="Enter the dates as they happen: cheque, presentation, the bank's return memo, the demand notice and its service. See every deadline up to the complaint under Section 142, and how each one was worked out."
      />

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-8 sm:px-6 sm:py-10">
        <ChequeBounceCalculator noticeTemplateHref={templateHref} />

        <section aria-labelledby="steps" className="space-y-4">
          <h2 id="steps" className="font-serif text-2xl font-semibold tracking-tight text-ink">
            The four deadlines
          </h2>
          <RuleCards items={rules} />
          {templateHref ? (
            <p className="text-sm text-ink-2">
              Need the notice itself?{" "}
              <Link href={templateHref} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                Section 138 demand notice template <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </p>
          ) : null}
        </section>

        <FaqSection items={faqs} />

        <SignupBand
          title="Run the whole cheque case in one place"
          body="In the Vaakil AI workspace you can draft the demand notice from this template, keep the matter in your diary and send documents for e-signature. Free to start."
        />
      </div>
    </>
  );
}
