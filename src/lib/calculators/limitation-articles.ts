// Articles of the Schedule to the Limitation Act, 1963 (36 of 1963).
//
// Every description, period and "time from which period begins to run" below is
// copied from the Schedule as published on India Code (Legislative Department,
// Ministry of Law and Justice), item 123456789/510802, file sch_196336.pdf,
// retrieved 3 Nov 2026. Only obvious PDF-extraction artefacts (broken words,
// line breaks) were corrected. Do not paraphrase these fields: the UI shows them
// as the statute text. Articles that could not be checked against that file are
// not listed.

import type { Period } from "./dates";

export const LIMITATION_ACT_URL = "https://indiacode.gov.in/handle/123456789/496389";
export const LIMITATION_SCHEDULE_URL = "https://indiacode.gov.in/handle/123456789/510802";
export const LIMITATION_RETRIEVED_ON = "2026-11-03";

/** India Code records for the sections the calculator applies or cites. */
export const LIMITATION_SECTION_URLS = {
  "3": "https://indiacode.gov.in/handle/123456789/524548",
  "4": "https://indiacode.gov.in/handle/123456789/524549",
  "5": "https://indiacode.gov.in/handle/123456789/524550",
  "12": "https://indiacode.gov.in/handle/123456789/524558",
  "14": "https://indiacode.gov.in/handle/123456789/524560",
  "18": "https://indiacode.gov.in/handle/123456789/524565",
  "19": "https://indiacode.gov.in/handle/123456789/524566",
  "29": "https://indiacode.gov.in/handle/123456789/524577",
} as const;

export type ProceedingKind = "suit" | "appeal" | "application";

export type LimitationArticle = {
  /** Stable id, e.g. "116a". */
  id: string;
  /** As cited, e.g. "116(a)". */
  article: string;
  kind: ProceedingKind;
  /** Part or division heading of the Schedule. */
  part: string;
  /** Short plain-English label for pickers. Not statute text. */
  title: string;
  /** Schedule column 1, verbatim. */
  description: string;
  period: Period;
  /** Schedule column 2, verbatim. */
  periodText: string;
  /** Schedule column 3, verbatim. */
  runsFrom: string;
  /** Label for the date input: the event in column 3. */
  startLabel: string;
  /** s. 12(2)/(3): appeals, leave to appeal, revision and review exclude certified-copy time. */
  copyExclusion?: boolean;
  /** Usually made under Order XXI CPC, which s. 5 excludes. */
  orderXxi?: boolean;
  /** A suit for money, where s. 19 (part payment) can matter. */
  debt?: boolean;
  /** Extra statute text or cautions shown with the article. */
  notes?: string[];
};

const CRPC_1898_NOTE =
  "This article still refers to the Code of Criminal Procedure, 1898, which was repealed and re-enacted by the Code of Criminal Procedure, 1973, itself repealed and re-enacted by the Bharatiya Nagarik Suraksha Sanhita, 2023. References to a repealed and re-enacted provision are read as references to the re-enacted one unless a different intention appears (s. 8, General Clauses Act, 1897). Check the provision that governs your appeal.";

const ACQUITTAL_LEAVE_NOTE =
  "A complainant's application for special leave to appeal from an acquittal has its own period in the Code: six months where the complainant is a public servant and sixty days in every other case, from the date of the order of acquittal (s. 378(5) CrPC, 1973; s. 419(5) BNSS, 2023).";

export const LIMITATION_ARTICLES: LimitationArticle[] = [
  /* ------------------------------ First Division: suits ------------------------------ */
  {
    id: "14",
    article: "14",
    kind: "suit",
    part: "Suits relating to contracts",
    title: "Price of goods sold and delivered (no credit period)",
    description: "For the price of goods sold and delivered where no fixed period of credit is agreed upon.",
    period: { amount: 3, unit: "years" },
    periodText: "Three years.",
    runsFrom: "The date of the delivery of the goods.",
    startLabel: "Date the goods were delivered",
    debt: true,
  },
  {
    id: "18",
    article: "18",
    kind: "suit",
    part: "Suits relating to contracts",
    title: "Price of work done (no time fixed for payment)",
    description: "For the price of work done by the plaintiff for the defendant at his request, where no time has been fixed for payment.",
    period: { amount: 3, unit: "years" },
    periodText: "Three years.",
    runsFrom: "When the work is done.",
    startLabel: "Date the work was done",
    debt: true,
  },
  {
    id: "19",
    article: "19",
    kind: "suit",
    part: "Suits relating to contracts",
    title: "Money lent",
    description: "For money payable for money lent.",
    period: { amount: 3, unit: "years" },
    periodText: "Three years.",
    runsFrom: "When the loan is made.",
    startLabel: "Date the loan was made",
    debt: true,
  },
  {
    id: "21",
    article: "21",
    kind: "suit",
    part: "Suits relating to contracts",
    title: "Money lent, payable on demand",
    description: "For money lent under an agreement that it shall be payable on demand.",
    period: { amount: 3, unit: "years" },
    periodText: "Three years.",
    runsFrom: "When the loan is made.",
    startLabel: "Date the loan was made",
    debt: true,
  },
  {
    id: "22",
    article: "22",
    kind: "suit",
    part: "Suits relating to contracts",
    title: "Deposit payable on demand (including with a banker)",
    description:
      "For money deposited under an agreement that it shall be payable on demand, including money of a customer in the hands of his banker so payable.",
    period: { amount: 3, unit: "years" },
    periodText: "Three years.",
    runsFrom: "When the demand is made.",
    startLabel: "Date the demand was made",
    debt: true,
  },
  {
    id: "52",
    article: "52",
    kind: "suit",
    part: "Suits relating to contracts",
    title: "Arrears of rent",
    description: "For arrears of rent.",
    period: { amount: 3, unit: "years" },
    periodText: "Three years.",
    runsFrom: "When the arrears become due.",
    startLabel: "Date the arrear became due",
    debt: true,
    notes: ["Time runs from when the arrears become due, so check each instalment of rent you claim, starting with the oldest."],
  },
  {
    id: "54",
    article: "54",
    kind: "suit",
    part: "Suits relating to contracts",
    title: "Specific performance of a contract",
    description: "For specific performance of a contract.",
    period: { amount: 3, unit: "years" },
    periodText: "Three years.",
    runsFrom: "The date fixed for the performance, or, if no such date is fixed, when the plaintiff has notice that performance is refused.",
    startLabel: "Date fixed for performance, or date of notice of refusal",
  },
  {
    id: "55",
    article: "55",
    kind: "suit",
    part: "Suits relating to contracts",
    title: "Compensation for breach of contract",
    description: "For compensation for the breach of any contract, express or implied not herein specially provided for.",
    period: { amount: 3, unit: "years" },
    periodText: "Three years.",
    runsFrom:
      "When the contract is broken or (where there are successive breaches) when the breach in respect of which the suit is instituted occurs or (where the breach is continuing) when it ceases.",
    startLabel: "Date of the breach (or when a continuing breach ceased)",
  },
  {
    id: "58",
    article: "58",
    kind: "suit",
    part: "Suits relating to declarations",
    title: "Any other declaration",
    description: "To obtain any other declaration.",
    period: { amount: 3, unit: "years" },
    periodText: "Three years.",
    runsFrom: "When the right to sue first accrues.",
    startLabel: "Date the right to sue first accrued",
  },
  {
    id: "59",
    article: "59",
    kind: "suit",
    part: "Suits relating to decrees and instruments",
    title: "Cancel an instrument or decree, or rescind a contract",
    description: "To cancel or set aside an instrument or decree or for the rescission of a contract.",
    period: { amount: 3, unit: "years" },
    periodText: "Three years.",
    runsFrom: "When the facts entitling the plaintiff to have the instrument or decree cancelled or set aside or the contract rescinded first become known to him.",
    startLabel: "Date the facts first became known to the plaintiff",
  },
  {
    id: "64",
    article: "64",
    kind: "suit",
    part: "Suits relating to immovable property",
    title: "Possession on previous possession (dispossessed)",
    description:
      "For possession of immovable property based on previous possession and not on title, when the plaintiff while in possession of the property has been dispossessed.",
    period: { amount: 12, unit: "years" },
    periodText: "Twelve years.",
    runsFrom: "The date of dispossession.",
    startLabel: "Date of dispossession",
  },
  {
    id: "65",
    article: "65",
    kind: "suit",
    part: "Suits relating to immovable property",
    title: "Possession of immovable property based on title",
    description: "For possession of immovable property or any interest therein based on title.",
    period: { amount: 12, unit: "years" },
    periodText: "Twelve years.",
    runsFrom: "When the possession of the defendant becomes adverse to the plaintiff.",
    startLabel: "Date the defendant's possession became adverse",
    notes: [
      "Explanation to Article 65: (a) where the suit is by a remainderman, a reversioner (other than a landlord) or a devisee, the possession of the defendant shall be deemed to become adverse only when the estate of the remainderman, reversioner or devisee, as the case may be, falls into possession; (b) where the suit is by a Hindu or Muslim entitled to the possession of immovable property on the death of a Hindu or Muslim female, the possession of the defendant shall be deemed to become adverse only when the female dies; (c) where the suit is by a purchaser at a sale in execution of a decree when the judgment-debtor was out of possession at the date of the sale, the purchaser shall be deemed to be a representative of the judgment-debtor who was out of possession.",
    ],
  },
  {
    id: "113",
    article: "113",
    kind: "suit",
    part: "Suits for which there is no prescribed period",
    title: "Any other suit (residuary)",
    description: "Any suit for which no period of limitation is provided elsewhere in this Schedule.",
    period: { amount: 3, unit: "years" },
    periodText: "Three years.",
    runsFrom: "When the right to sue accrues.",
    startLabel: "Date the right to sue accrued",
  },

  /* ----------------------------- Second Division: appeals ---------------------------- */
  {
    id: "114a",
    article: "114(a)",
    kind: "appeal",
    part: "Appeals",
    title: "Appeal from acquittal (s. 417(1)/(2), CrPC 1898)",
    description:
      "Appeal from an order of acquittal, under sub-section (1) or sub-section (2) of section 417 of the Code of Criminal Procedure, 1898 (5 of 1898).",
    period: { amount: 90, unit: "days" },
    periodText: "Ninety days.",
    runsFrom: "The date of the order appealed from.",
    startLabel: "Date of the order of acquittal",
    copyExclusion: true,
    notes: [CRPC_1898_NOTE, ACQUITTAL_LEAVE_NOTE],
  },
  {
    id: "114b",
    article: "114(b)",
    kind: "appeal",
    part: "Appeals",
    title: "Appeal from acquittal after special leave (s. 417(3), CrPC 1898)",
    description: "Appeal from an order of acquittal, under sub-section (3) of section 417 of that Code.",
    period: { amount: 30, unit: "days" },
    periodText: "Thirty days.",
    runsFrom: "The date of the grant of special leave.",
    startLabel: "Date special leave was granted",
    copyExclusion: true,
    notes: [CRPC_1898_NOTE, ACQUITTAL_LEAVE_NOTE],
  },
  {
    id: "115a",
    article: "115(a)",
    kind: "appeal",
    part: "Appeals",
    title: "Criminal appeal from a sentence of death",
    description:
      "Under the Code of Criminal Procedure, 1898 (5 of 1898), from a sentence of death passed by a court of session or by a High Court in the exercise of its original criminal jurisdiction.",
    period: { amount: 30, unit: "days" },
    periodText: "Thirty days.",
    runsFrom: "The date of the sentence.",
    startLabel: "Date of the sentence",
    copyExclusion: true,
    notes: [CRPC_1898_NOTE],
  },
  {
    id: "115b1",
    article: "115(b)(i)",
    kind: "appeal",
    part: "Appeals",
    title: "Criminal appeal to the High Court (other sentence or order)",
    description:
      "Under the Code of Criminal Procedure, 1898 (5 of 1898), from any other sentence or any order not being an order of acquittal, to the High Court.",
    period: { amount: 60, unit: "days" },
    periodText: "Sixty days.",
    runsFrom: "The date of the sentence or order.",
    startLabel: "Date of the sentence or order",
    copyExclusion: true,
    notes: [CRPC_1898_NOTE],
  },
  {
    id: "115b2",
    article: "115(b)(ii)",
    kind: "appeal",
    part: "Appeals",
    title: "Criminal appeal to a court other than the High Court",
    description:
      "Under the Code of Criminal Procedure, 1898 (5 of 1898), from any other sentence or any order not being an order of acquittal, to any other court.",
    period: { amount: 30, unit: "days" },
    periodText: "Thirty days.",
    runsFrom: "The date of the sentence or order.",
    startLabel: "Date of the sentence or order",
    copyExclusion: true,
    notes: [CRPC_1898_NOTE],
  },
  {
    id: "116a",
    article: "116(a)",
    kind: "appeal",
    part: "Appeals",
    title: "Civil appeal to a High Court (CPC)",
    description: "Under the Code of Civil Procedure, 1908 (5 of 1908), to a High Court from any decree or order.",
    period: { amount: 90, unit: "days" },
    periodText: "Ninety days.",
    runsFrom: "The date of the decree or order.",
    startLabel: "Date of the decree or order",
    copyExclusion: true,
  },
  {
    id: "116b",
    article: "116(b)",
    kind: "appeal",
    part: "Appeals",
    title: "Civil appeal to any other court (CPC)",
    description: "Under the Code of Civil Procedure, 1908 (5 of 1908), to any other court from any decree or order.",
    period: { amount: 30, unit: "days" },
    periodText: "Thirty days.",
    runsFrom: "The date of the decree or order.",
    startLabel: "Date of the decree or order",
    copyExclusion: true,
  },
  {
    id: "117",
    article: "117",
    kind: "appeal",
    part: "Appeals",
    title: "Appeal within the same High Court",
    description: "From a decree or order of any High Court to the same Court.",
    period: { amount: 30, unit: "days" },
    periodText: "Thirty days.",
    runsFrom: "The date of the decree or order.",
    startLabel: "Date of the decree or order",
    copyExclusion: true,
  },

  /* --------------------------- Third Division: applications -------------------------- */
  {
    id: "120",
    article: "120",
    kind: "application",
    part: "Applications in specified cases",
    title: "Bring legal representatives on record (CPC)",
    description:
      "Under the Code of Civil Procedure, 1908 (5 of 1908), to have the legal representative of a deceased plaintiff or appellant or of a deceased defendant or respondent, made a party.",
    period: { amount: 90, unit: "days" },
    periodText: "Ninety days.",
    runsFrom: "The date of death of the plaintiff, appellant, defendant or respondent, as the case may be.",
    startLabel: "Date of death",
  },
  {
    id: "121",
    article: "121",
    kind: "application",
    part: "Applications in specified cases",
    title: "Set aside an abatement (CPC)",
    description: "Under the same Code for an order to set aside an abatement.",
    period: { amount: 60, unit: "days" },
    periodText: "Sixty days.",
    runsFrom: "The date of abatement.",
    startLabel: "Date of abatement",
  },
  {
    id: "122",
    article: "122",
    kind: "application",
    part: "Applications in specified cases",
    title: "Restore a suit, appeal, review or revision dismissed for default",
    description:
      "To restore a suit or appeal or application for review or revision dismissed for default of appearance or for want of prosecution or for failure to pay costs of service of process or to furnish security for costs.",
    period: { amount: 30, unit: "days" },
    periodText: "Thirty days.",
    runsFrom: "The date of dismissal.",
    startLabel: "Date of dismissal",
  },
  {
    id: "123",
    article: "123",
    kind: "application",
    part: "Applications in specified cases",
    title: "Set aside an ex parte decree",
    description: "To set aside a decree passed ex parte or to rehear an appeal decreed or heard ex parte.",
    period: { amount: 30, unit: "days" },
    periodText: "Thirty days.",
    runsFrom: "The date of the decree or where the summons or notice was not duly served, when the applicant had knowledge of the decree.",
    startLabel: "Date of the decree (or of knowledge, if not duly served)",
    notes: [
      "Explanation to Article 123: for the purpose of this article, substituted service under rule 20 of Order V of the Code of Civil Procedure, 1908 (5 of 1908) shall not be deemed to be due service.",
    ],
  },
  {
    id: "124",
    article: "124",
    kind: "application",
    part: "Applications in specified cases",
    title: "Review of judgment (court other than the Supreme Court)",
    description: "For a review of judgment by a court other than the Supreme Court.",
    period: { amount: 30, unit: "days" },
    periodText: "Thirty days.",
    runsFrom: "The date of the decree or order.",
    startLabel: "Date of the decree or order",
    copyExclusion: true,
  },
  {
    id: "127",
    article: "127",
    kind: "application",
    part: "Applications in specified cases",
    title: "Set aside a sale in execution",
    description: "To set aside a sale in execution of a decree, including any such application by a judgment-debtor.",
    period: { amount: 60, unit: "days" },
    periodText: "Sixty days.",
    runsFrom: "The date of the sale.",
    startLabel: "Date of the sale",
    orderXxi: true,
    notes: ["\"Sixty days\" was substituted for \"Thirty days\" by Act 104 of 1976, s. 98 (w.e.f. 1-2-1977)."],
  },
  {
    id: "131",
    article: "131",
    kind: "application",
    part: "Applications in specified cases",
    title: "Revision (CPC or CrPC)",
    description:
      "To any court for the exercise of its powers of revision under the Code of Civil Procedure, 1908 (5 of 1908), or the Code of Criminal Procedure, 1898 (5 of 1898).",
    period: { amount: 90, unit: "days" },
    periodText: "Ninety days.",
    runsFrom: "The date of the decree or order or sentence sought to be revised.",
    startLabel: "Date of the decree, order or sentence",
    copyExclusion: true,
    notes: [CRPC_1898_NOTE],
  },
  {
    id: "133a",
    article: "133(a)",
    kind: "application",
    part: "Applications in specified cases",
    title: "Special leave to the Supreme Court: death sentence",
    description: "To the Supreme Court for special leave to appeal, in a case involving death sentence.",
    period: { amount: 60, unit: "days" },
    periodText: "Sixty days.",
    runsFrom: "The date of the judgment final order or sentence.",
    startLabel: "Date of the judgment, final order or sentence",
    copyExclusion: true,
    notes: ["The Supreme Court Rules, 2013 also govern special leave petitions. Check them before filing."],
  },
  {
    id: "133b",
    article: "133(b)",
    kind: "application",
    part: "Applications in specified cases",
    title: "Special leave to the Supreme Court: High Court refused leave",
    description: "To the Supreme Court for special leave to appeal, in a case where leave to appeal was refused by the High Court.",
    period: { amount: 60, unit: "days" },
    periodText: "Sixty days.",
    runsFrom: "The date of the order of refusal.",
    startLabel: "Date of the order refusing leave",
    copyExclusion: true,
    notes: ["The Supreme Court Rules, 2013 also govern special leave petitions. Check them before filing."],
  },
  {
    id: "133c",
    article: "133(c)",
    kind: "application",
    part: "Applications in specified cases",
    title: "Special leave to the Supreme Court: any other case",
    description: "To the Supreme Court for special leave to appeal, in any other case.",
    period: { amount: 90, unit: "days" },
    periodText: "Ninety days.",
    runsFrom: "The date of the judgment or order.",
    startLabel: "Date of the judgment or order",
    copyExclusion: true,
    notes: ["The Supreme Court Rules, 2013 also govern special leave petitions. Check them before filing."],
  },
  {
    id: "136",
    article: "136",
    kind: "application",
    part: "Applications in specified cases",
    title: "Execute a decree or order of a civil court",
    description: "For the execution of any decree (other than a decree granting a mandatory injunction) or order of any civil court.",
    period: { amount: 12, unit: "years" },
    periodText: "Twelve years.",
    runsFrom:
      "When the decree or order becomes enforceable or where the decree or any subsequent order directs any payment of money or the delivery of any property to be made at a certain date or at recurring periods, when default in making the payment or delivery in respect of which execution is sought, takes place.",
    startLabel: "Date the decree became enforceable (or date of default)",
    orderXxi: true,
    notes: [
      "Proviso to Article 136: provided that an application for the enforcement or execution of a decree granting a perpetual injunction shall not be subject to any period of limitation.",
      "An acknowledgment does not restart time for execution: an application for the execution of a decree or order is not an application in respect of any property or right (Explanation (c) to s. 18).",
    ],
  },
  {
    id: "137",
    article: "137",
    kind: "application",
    part: "Other applications",
    title: "Any other application (residuary)",
    description: "Any other application for which no period of limitation is provided elsewhere in this Division.",
    period: { amount: 3, unit: "years" },
    periodText: "Three years.",
    runsFrom: "When the right to apply accrues.",
    startLabel: "Date the right to apply accrued",
  },
];

export function getLimitationArticle(id: string | null | undefined): LimitationArticle | undefined {
  return LIMITATION_ARTICLES.find((a) => a.id === id);
}

export const KIND_LABEL: Record<ProceedingKind, string> = { suit: "Suits", appeal: "Appeals", application: "Applications" };
