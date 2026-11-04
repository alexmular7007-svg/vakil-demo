// Where library judgments come from, with the attribution each licence asks for.
// Pure data, safe for client and server.

export type JudgmentSource = {
  key: string;
  name: string;
  /** Who publishes the dataset. */
  publisher: string;
  licence: string;
  licenceUrl: string;
  /** Landing page used in the attribution line. */
  homeUrl: string;
  bucket?: string;
  /** Attribution line; `accessed` is the date the record was imported. */
  attribution: (accessed: string) => string;
};

export const UPLOAD_SOURCE_KEY = "upload";

export const JUDGMENT_SOURCES: Record<string, JudgmentSource> = {
  "aws-isc": {
    key: "aws-isc",
    name: "Indian Supreme Court Judgments",
    publisher: "Dattam Labs, via the Registry of Open Data on AWS",
    licence: "CC-BY-4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    homeUrl: "https://registry.opendata.aws/indian-supreme-court-judgments/",
    bucket: "indian-supreme-court-judgments",
    attribution: (accessed) =>
      `Indian Supreme Court Judgments was accessed on ${accessed} from https://registry.opendata.aws/indian-supreme-court-judgments (Dattam Labs, CC BY 4.0). Judgment text from the Supreme Court of India; paragraph breaks added automatically.`,
  },
  "aws-ihc": {
    key: "aws-ihc",
    name: "Indian High Court Judgments",
    publisher: "Dattam Labs, via the Registry of Open Data on AWS",
    licence: "CC-BY-4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    homeUrl: "https://registry.opendata.aws/indian-high-court-judgments/",
    bucket: "indian-high-court-judgments",
    attribution: (accessed) =>
      `Indian High Court Judgments was accessed on ${accessed} from https://registry.opendata.aws/indian-high-court-judgments (Dattam Labs, CC BY 4.0). Judgment text from the eCourts judgments portal; paragraph breaks added automatically.`,
  },
};

export const LICENCE_OPTIONS = [
  { value: "Public judgment (Copyright Act s. 52(1)(q)(iv))", label: "Court judgment, reproduced as published (s. 52(1)(q)(iv))" },
  { value: "CC-BY-4.0", label: "CC BY 4.0 (attribution)" },
  { value: "CC0-1.0", label: "CC0 (public domain dedication)" },
  { value: "GODL-India", label: "Government Open Data Licence – India" },
] as const;

export function sourceFor(key: string | null | undefined): JudgmentSource | null {
  return key ? (JUDGMENT_SOURCES[key] ?? null) : null;
}
