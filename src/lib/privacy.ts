export const PRIVACY_NOTICE_VERSION = "2026-11-02";

export const consentPurposes = {
  service: "Provide the Vaakil AI service (account, matters, documents, e-sign)",
  ai_processing: "Send your questions and selected documents to our AI providers to generate answers",
  marketing: "Send product updates by email",
} as const;

/** DPDP Rules: respond to data-principal rights requests within 90 days. */
export const RIGHTS_RESPONSE_DAYS = 90;
