import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import { LegalDoc, Placeholder, type LegalSection } from "../_components/legal-doc";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms that apply when you use Vaakil AI for legal research, drafting, document review and e-sign.",
  alternates: { canonical: "/legal/terms" },
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "These terms",
    body: (
      <p>
        These terms are an agreement between you and <Placeholder>Legal entity name and CIN, to be added by Vaakil.com</Placeholder> (&ldquo;we&rdquo;),
        which operates Vaakil AI. By creating an account or using the service you accept them. Our <Link href="/legal/privacy">privacy notice</Link>{" "}
        and <Link href="/legal/disclaimer">disclaimer</Link> form part of these terms.
      </p>
    ),
  },
  {
    id: "service",
    title: "What Vaakil AI is",
    body: (
      <>
        <p>
          Vaakil AI is a legal-information and drafting assistant built mainly for advocates. It offers AI-assisted research, bare-act search, an old
          and new criminal code converter, drafting templates, document review and electronic signatures.
        </p>
        <p>
          It is <strong>not a law firm and does not give legal advice</strong>. Using it does not create an advocate-client relationship with us.
          Only an advocate enrolled under the Advocates Act, 1961 may advise you on your matter.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Accounts",
    body: (
      <ul>
        <li>You must be at least 18 and able to enter a binding contract.</li>
        <li>Give accurate details and keep them up to date. Advocates who apply for a listing must give their real enrolment details.</li>
        <li>
          Keep your password secret and turn on two-factor authentication. You are responsible for activity under your account; tell us at once at{" "}
          <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> if you suspect misuse.
        </li>
      </ul>
    ),
  },
  {
    id: "ai",
    title: "AI output and your responsibility",
    body: (
      <ul>
        <li>AI answers and drafts can be incomplete, out of date or wrong, even when a source is shown.</li>
        <li>
          Check every citation, section and quotation against the official text before you file, send or rely on it. Courts expect advocates to verify
          what they cite.
        </li>
        <li>Bare-act text comes from India Code and must be verified against the Gazette of India for legal use.</li>
        <li>Old-to-new code correspondence comes from the NCRB tables and is a starting point, not a statement that two provisions are identical.</li>
      </ul>
    ),
  },
  {
    id: "content",
    title: "Your content",
    body: (
      <>
        <p>
          You keep all rights in the documents, questions and drafts you put into Vaakil AI. You give us permission to store and process them only to
          provide the service to you, including sending them to our AI providers as our privacy notice describes.
        </p>
        <p>
          You confirm you have the right to upload what you upload, including your clients&apos; information, and that doing so does not breach any duty
          of confidentiality you owe.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>You must not use Vaakil AI to:</p>
        <ul>
          <li>break any law, or help anyone else do so;</li>
          <li>create forged, misleading or fraudulent documents or signatures;</li>
          <li>advertise or solicit legal work in breach of the Bar Council of India Rules;</li>
          <li>upload malware, probe or overload our systems, or bypass security, rate or fair-use limits;</li>
          <li>scrape the service or resell access without our written permission.</li>
        </ul>
      </>
    ),
  },
  {
    id: "esign",
    title: "Electronic signatures",
    body: (
      <ul>
        <li>
          Signatures collected with an email one-time passcode are electronic records whose evidential weight a court decides. Aadhaar eSign, where
          available, is performed by a licensed eSign service provider.
        </li>
        <li>
          Documents listed in the First Schedule to the Information Technology Act, 2000, such as wills, trusts, powers of attorney, negotiable
          instruments other than cheques, and contracts for the sale or conveyance of immovable property, cannot be signed electronically. Our
          templates for them are marked accordingly.
        </li>
        <li>You are responsible for stamp duty and registration where they apply.</li>
      </ul>
    ),
  },
  {
    id: "advocates",
    title: "Advocate listings and hand-offs",
    body: (
      <p>
        Advocate profiles are shown for information only, at the advocate&apos;s request, without ranking, ratings or paid placement, to respect Rule 36
        of the Bar Council of India Rules. We check enrolment details before listing, but we do not recommend or endorse any advocate, and any
        engagement is between you and the advocate.
      </p>
    ),
  },
  {
    id: "plans",
    title: "Plans, fair use and payments",
    body: (
      <ul>
        <li>Plan features and prices are shown on the <Link href="/pricing">pricing page</Link>.</li>
        <li>
          &ldquo;Unlimited&rdquo; plans are subject to fair use: very heavy daily use may be moved to a faster, lighter model or paused until the next day, as
          the workspace explains when it happens.
        </li>
        <li>Paid plans are billed in advance through our payment provider once payments are switched on. Refunds follow the terms shown at checkout.</li>
      </ul>
    ),
  },
  {
    id: "ip",
    title: "Our service and third-party sources",
    body: (
      <p>
        The software, design and our own text belong to us. Statutes are public law obtained from India Code; correspondence tables are published by
        the National Crime Records Bureau; judgments are used under their licences with credit. We make no claim to own government works.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Disclaimers and liability",
    body: (
      <>
        <p>
          The service is provided &ldquo;as is&rdquo;. To the extent the law allows, we are not liable for loss arising from reliance on AI output, bare-act
          text or correspondence tables without independent verification, or for indirect or consequential loss.
        </p>
        <p>
          Our total liability for any claim is limited to the fees you paid us in the three months before the claim. Nothing in these terms limits
          liability that cannot be limited by law.
        </p>
      </>
    ),
  },
  {
    id: "termination",
    title: "Suspension and closure",
    body: (
      <p>
        You can close your account at any time from Settings → Privacy. We may suspend or close accounts that breach these terms, with notice where
        practical. On closure we handle your data as our privacy notice describes.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <p>
        These terms are governed by the laws of India. Courts at <Placeholder>City, to be added by Vaakil.com</Placeholder> have exclusive jurisdiction,
        subject to any consumer protection rights you have. Please raise concerns with us first through the <Link href="/legal/grievance">grievance officer</Link>.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: <p>We may update these terms. We will tell you about material changes before they apply; continuing to use the service means you accept them.</p>,
  },
];

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of use"
      path="/legal/terms"
      intro={<p>Please read these terms before using Vaakil AI. They explain what the service does, what it does not do, and what we each owe the other.</p>}
      sections={sections}
    />
  );
}
