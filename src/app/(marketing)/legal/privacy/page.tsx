import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import { RIGHTS_RESPONSE_DAYS, consentPurposes } from "@/lib/privacy";
import { LegalDoc, Placeholder, type LegalSection } from "../_components/legal-doc";

export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "How Vaakil AI collects, uses, shares and protects personal data under the Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025, and how to exercise your rights.",
  alternates: { canonical: "/legal/privacy" },
};

const sections: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <>
        <p>
          Vaakil AI is operated by <Placeholder>Legal entity name and CIN, to be added by Vaakil.com</Placeholder>, registered office at{" "}
          <Placeholder>Registered address, to be added by Vaakil.com</Placeholder> (&ldquo;we&rdquo;, &ldquo;us&rdquo;). For your account data we are the
          <strong> Data Fiduciary</strong> under the Digital Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;) and the Digital Personal Data
          Protection Rules, 2025 (&ldquo;DPDP Rules&rdquo;).
        </p>
        <p>
          When an advocate uploads a client&apos;s documents or enters a client&apos;s details, the advocate decides why and how that data is used.
          For that client data we process on the advocate&apos;s instructions, and the advocate is responsible for having a lawful basis to share it
          with us.
        </p>
      </>
    ),
  },
  {
    id: "data",
    title: "Personal data we process",
    body: (
      <ul>
        <li>
          <strong>Account data:</strong> name, email address, optional phone number, preferred language, a one-way hash of your password, two-factor
          authentication secrets and backup codes, and your role (user, advocate or administrator).
        </li>
        <li>
          <strong>Sign-in and security data:</strong> session records, IP address, browser user agent, and audit events such as sign-ins, consent
          changes and important edits.
        </li>
        <li>
          <strong>Your work:</strong> questions you ask, AI answers, matters, drafts and their version history, documents you upload, prompts and
          custom assistants you create.
        </li>
        <li>
          <strong>E-sign data:</strong> the documents you send, names, email addresses and (if given) phone numbers of signers, one-time passcodes
          (stored only as hashes), signature images, IP address, user agent and time of each signing step, and document hashes.
        </li>
        <li>
          <strong>Advocate profile data</strong> (only if you apply to be listed): enrolment number, State Bar Council, practice areas, the details
          you choose to publish, and the result of our verification.
        </li>
        <li>
          <strong>Billing data</strong> (when payments are switched on): plan, amounts, invoices and the payment provider&apos;s transaction
          references. We do not store card or bank details.
        </li>
        <li>
          <strong>Usage data:</strong> counts of AI requests and tokens used, for fair-use limits and cost tracking.
        </li>
      </ul>
    ),
  },
  {
    id: "purposes",
    title: "Why we process it",
    body: (
      <>
        <p>We ask for your consent, through a clear notice when you start using the workspace, for these purposes:</p>
        <ul>
          <li>
            <strong>Service:</strong> {consentPurposes.service}.
          </li>
          <li>
            <strong>AI processing:</strong> {consentPurposes.ai_processing}.
          </li>
          <li>
            <strong>Marketing (optional):</strong> {consentPurposes.marketing}.
          </li>
        </ul>
        <p>
          We also process personal data without consent where the DPDP Act allows it as a legitimate use, for example to comply with a law or a
          court order, or to keep records the law requires. We do not sell personal data and we do not use it for advertising.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "How AI processing works",
    body: (
      <>
        <p>
          When you ask a question, draft with AI or review a document, we send the text of your request, the statute or judgment passages we
          retrieved for it, and any document you chose to include, to one of our AI providers: <strong>Anthropic</strong> or <strong>Google</strong>.
          The provider returns an answer, which we store in your workspace.
        </p>
        <p>
          We use these providers&apos; paid API services. Their published commercial terms say API inputs are not used to train their models, and we
          have not opted in to any programme that would allow it. Only the text needed for the request is sent; your password, payment data and
          other workspace files are not.
        </p>
        <p>AI answers can be wrong. Check every citation against the source before relying on it.</p>
      </>
    ),
  },
  {
    id: "processors",
    title: "Who we share it with",
    body: (
      <>
        <p>We share personal data only with processors that help us run the service, under contracts that limit them to our instructions:</p>
        <ul>
          <li>
            <strong>AI providers:</strong> Anthropic PBC and Google LLC, to generate answers, drafts and document reviews.
          </li>
          <li>
            <strong>Hosting and database:</strong> our application host <Placeholder>Hosting provider, to be added by Vaakil.com</Placeholder> and our
            managed Postgres database provider (Supabase), which store the workspace data.
          </li>
          <li>
            <strong>Email:</strong> Resend, to send sign-in, verification, e-sign and notification emails.
          </li>
          <li>
            <strong>Payments and identity checks</strong> (only once switched on): our payment and KYC provider CGPEY, for subscription payments and,
            for advocates who apply to be listed, identity checks.
          </li>
          <li>
            <strong>Aadhaar eSign</strong> (only once switched on, and only for signers who choose it): a licensed eSign service provider that
            performs the Aadhaar-based signature.
          </li>
        </ul>
        <p>
          When you send a document for signature, the signers you name see the document and the signing trail. If you ask for a hand-off to an
          advocate, that advocate sees what you choose to send. We may disclose data to authorities when the law requires it.
        </p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "Cross-border processing",
    body: (
      <p>
        Our AI providers may process requests on servers outside India, including in the United States. The DPDP Act permits transfers outside India
        except to countries the Central Government restricts by notification; we will stop or re-route any transfer that becomes restricted. Our
        database region is <Placeholder>Database region, to be confirmed by Vaakil.com</Placeholder>.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Account data and your work: while your account is open. When you ask us to erase your data, we delete it and close the account.</li>
        <li>
          Signed documents and e-sign audit trails: for as long as they may be needed as evidence of the signature, because their value depends on
          being kept unaltered.
        </li>
        <li>Billing records: for the period tax and company law require.</li>
        <li>
          Security and audit logs: at least one year, as the DPDP Rules require, and longer where needed to investigate an incident. Audit records
          are append-only.
        </li>
        <li>Data we no longer need for its purpose, and that no law requires us to keep, is erased.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the DPDP Act you can ask us to:</p>
        <ul>
          <li>give you a summary of the personal data we process about you and how, and who we have shared it with;</li>
          <li>correct, complete or update it;</li>
          <li>erase it, unless a law requires us to keep it;</li>
          <li>resolve a grievance about how we handle it; and</li>
          <li>record a nominee to exercise these rights if you die or become incapacitated.</li>
        </ul>
        <p>
          Signed-in users can make a request in <Link href="/app/settings/privacy">Settings → Privacy</Link>, which also lets you download your data.
          Anyone can write to <a href={`mailto:${site.grievanceEmail}`}>{site.grievanceEmail}</a>. We respond within {RIGHTS_RESPONSE_DAYS} days, as the
          DPDP Rules require, and may need to confirm your identity first.
        </p>
      </>
    ),
  },
  {
    id: "consent",
    title: "Withdrawing consent",
    body: (
      <p>
        You can withdraw consent as easily as you gave it. Marketing can be switched off at any time in Settings → Privacy. Withdrawing consent for the
        service or for AI processing means we stop that processing; because the workspace cannot run without it, we will then close your account on
        request. Withdrawal does not affect processing done before it. We may also accept consent through a registered Consent Manager once such a
        service is available to us.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children's data",
    body: (
      <p>
        Vaakil AI is meant for advocates and adults. Do not create an account if you are under 18; we do not offer the verifiable parental consent
        the DPDP Act requires for children, and we close accounts we learn belong to a child. Where a matter involves a child (for example a custody
        dispute), the advocate handling it is responsible for the lawful basis to process that data, and we do not use it for tracking, behavioural
        monitoring or targeted advertising.
      </p>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <p>
        Row-level security in the database keeps each user&apos;s records separate, legal records are append-only and hash-chained, sign-in supports
        two-factor authentication, and keys stay on the server. <Link href="/security">Read how security works</Link>. If a personal data breach
        occurs we will inform affected users and the Data Protection Board of India as the DPDP Rules require.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        We use only cookies needed to keep you signed in and secure. Your light or dark theme choice is stored in your browser. We do not use
        advertising or third-party analytics cookies.
      </p>
    ),
  },
  {
    id: "grievance",
    title: "Grievance officer",
    body: (
      <p>
        Our grievance officer is <Placeholder>Name of grievance officer, to be added by Vaakil.com</Placeholder>, reachable at{" "}
        <a href={`mailto:${site.grievanceEmail}`}>{site.grievanceEmail}</a>. See the <Link href="/legal/grievance">grievance page</Link> for how to raise
        a complaint. If you are not satisfied with our response, you may complain to the Data Protection Board of India.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this notice",
    body: (
      <p>
        If we change this notice materially, we will tell you in the workspace or by email before the change applies and, where the law requires,
        ask for your consent again.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy notice"
      path="/legal/privacy"
      intro={
        <p>
          This notice explains what personal data Vaakil AI processes, why, who else sees it, how long we keep it and how you can exercise your rights
          under the Digital Personal Data Protection Act, 2023.
        </p>
      }
      sections={sections}
    />
  );
}
