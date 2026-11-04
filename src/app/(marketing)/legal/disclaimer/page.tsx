import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import { LegalDoc, type LegalSection } from "../_components/legal-doc";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "Vaakil AI provides legal information and drafting assistance, not legal advice. Read how to use AI output, bare acts and the code converter responsibly.",
  alternates: { canonical: "/legal/disclaimer" },
};

const sections: LegalSection[] = [
  {
    id: "not-advice",
    title: "Not legal advice",
    body: (
      <>
        <p>{site.disclaimer}</p>
        <p>
          Information on this site, including AI answers, drafts, summaries and converter results, is general legal information. It is not advice on
          your facts and does not create an advocate-client relationship.
        </p>
      </>
    ),
  },
  {
    id: "advocates-act",
    title: "The Advocates Act, 1961",
    body: (
      <p>
        Under the Advocates Act, 1961, only advocates enrolled with a State Bar Council are entitled to practise law in India. Vaakil AI is software,
        not an advocate or a law firm. Advocates who use it remain responsible for their professional work and for checking anything it produces.
      </p>
    ),
  },
  {
    id: "bci",
    title: "Bar Council of India Rule 36",
    body: (
      <p>
        Rule 36 of the Bar Council of India Rules bars advocates from soliciting work or advertising. Vaakil AI does not advertise for, rank, rate or
        sell leads to advocates. Advocate profiles appear for information only, at the advocate&apos;s request, and contain only the details the Rules
        permit. Nothing on this site is an invitation to engage a particular advocate.
      </p>
    ),
  },
  {
    id: "ai",
    title: "AI output can be wrong",
    body: (
      <ul>
        <li>AI can misstate the law, misread a document or produce a citation that does not support the point made.</li>
        <li>Read the cited section or judgment yourself before relying on it, and never file an AI-generated citation you have not verified.</li>
        <li>Where the workspace marks a citation as unverified, treat it as unsupported.</li>
      </ul>
    ),
  },
  {
    id: "bare-acts",
    title: "Bare acts and the code converter",
    body: (
      <ul>
        <li>
          Bare-act text is taken from India Code, the Government of India&apos;s official repository, and may lag behind recent amendments or contain
          typographical errors. Verify against the Gazette of India for legal use.
        </li>
        <li>
          Old-to-new correspondence (IPC to BNS, CrPC to BNSS, Evidence Act to BSA) comes from the NCRB SANKALAN tables. A matching section is a
          starting point: wording, ingredients and punishments often changed.
        </li>
        <li>
          Which code applies depends on dates and savings clauses. Offences committed before 1 July 2024 stay under the IPC, and proceedings pending
          on that date continue under the CrPC and Evidence Act. Apply this to your facts with care.
        </li>
      </ul>
    ),
  },
  {
    id: "contact",
    title: "Questions",
    body: (
      <p>
        Write to <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>, or see our <Link href="/legal/terms">terms of use</Link>.
      </p>
    ),
  },
];

export default function DisclaimerPage() {
  return (
    <LegalDoc
      title="Disclaimer"
      path="/legal/disclaimer"
      intro={<p>Vaakil AI helps with legal research and drafting. Here is what it is not, and how to use what it gives you.</p>}
      sections={sections}
    />
  );
}
