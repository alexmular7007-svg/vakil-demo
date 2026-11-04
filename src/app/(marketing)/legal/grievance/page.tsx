import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { site } from "@/lib/site";
import { RIGHTS_RESPONSE_DAYS } from "@/lib/privacy";
import { LegalDoc, Placeholder, type LegalSection } from "../_components/legal-doc";

export const metadata: Metadata = {
  title: "Grievance officer",
  description: "How to raise a complaint or a data-protection request with Vaakil AI's grievance officer, and how quickly we respond.",
  alternates: { canonical: "/legal/grievance" },
};

const sections: LegalSection[] = [
  {
    id: "officer",
    title: "Grievance officer",
    body: (
      <>
        <div className="not-prose my-4 rounded-lg border border-border bg-surface p-4 text-[15px]">
          <p className="font-semibold text-ink">
            <Placeholder>Name of grievance officer, to be added by Vaakil.com</Placeholder>
          </p>
          <p className="mt-1 text-ink-2">
            <Placeholder>Legal entity name and CIN, to be added by Vaakil.com</Placeholder>
          </p>
          <p className="mt-1 text-ink-2">
            <Placeholder>Postal address, to be added by Vaakil.com</Placeholder>
          </p>
          <p className="mt-3">
            <a href={`mailto:${site.grievanceEmail}`} className="inline-flex items-center gap-2 font-medium text-primary hover:underline">
              <Mail className="size-4" aria-hidden /> {site.grievanceEmail}
            </a>
          </p>
        </div>
        <p>The grievance officer handles complaints about the service and requests under the Digital Personal Data Protection Act, 2023.</p>
      </>
    ),
  },
  {
    id: "how",
    title: "How to raise a grievance",
    body: (
      <ol>
        <li>
          If you have an account, open <Link href="/app/settings/privacy">Settings → Privacy</Link> and choose the request type. This records the request
          and its due date.
        </li>
        <li>
          Otherwise, email <a href={`mailto:${site.grievanceEmail}`}>{site.grievanceEmail}</a> with your name, the email address on your account (if any),
          what happened and what you would like us to do.
        </li>
        <li>Please do not send passwords, one-time passcodes or full identity documents by email.</li>
      </ol>
    ),
  },
  {
    id: "timeline",
    title: "When we respond",
    body: (
      <p>
        We resolve grievances and data-principal requests within {RIGHTS_RESPONSE_DAYS} days, the period the DPDP Rules, 2025 allow, and aim to do so much
        sooner. We may need to confirm your identity before acting on a request about personal data.
      </p>
    ),
  },
  {
    id: "escalation",
    title: "If you are not satisfied",
    body: (
      <p>
        After using our grievance process, you may complain to the Data Protection Board of India about how we handled your personal data. Consumer
        complaints can also go to the consumer commissions under the Consumer Protection Act, 2019.
      </p>
    ),
  },
];

export default function GrievancePage() {
  return (
    <LegalDoc
      title="Grievance officer"
      path="/legal/grievance"
      intro={<p>Tell us when something goes wrong. Every grievance gets a written answer, and requests made in the workspace are logged and tracked to a deadline.</p>}
      sections={sections}
    />
  );
}
