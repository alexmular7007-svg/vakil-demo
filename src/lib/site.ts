// Public site constants. Safe for client and server.
export const site = {
  name: "Vaakil AI",
  url: process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000",
  description:
    "Citation-checked legal research, Indian court drafting, document review and multi-party e-sign for advocates, in English and Hindi.",
  // Positioning note: Vaakil AI is a legal-information and drafting assistant for
  // advocates. It is not a law firm and does not give legal advice (Advocates Act 1961).
  disclaimer:
    "Vaakil AI provides legal information and drafting assistance. It is not a law firm and does not give legal advice. Verify every citation before relying on it, and consult an enrolled advocate for advice on your matter.",
  grievanceEmail: "grievance@vaakil.com",
  supportEmail: "support@vaakil.com",
  parentSite: "https://www.vaakil.com",
};
