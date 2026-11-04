// Acts ingested into the corpus, with the official source for each.
// Dates: BNS, BNSS and BSA came into force on 1 July 2024 (notifications of 23 February
// 2024; for the BNS, S.O. 850(E)); the IPC, CrPC and Indian Evidence Act were repealed from that
// date but continue to govern offences and proceedings that began before it.

const NEW_CODES_NOTE =
  "Bare act text as published on India Code. In force from 1 July 2024. Verify against the Gazette of India for legal use.";
const OLD_CODES_NOTE =
  "Repealed with effect from 1 July 2024, but still governs offences committed (and, subject to the savings clause of the new code, proceedings pending) before that date. Text as consolidated on India Code up to its repeal; verify against the Gazette of India for legal use.";

export const ACTS = [
  {
    id: "BNS",
    kind: "structured",
    indiaCodeActId: "AC_CEN_5_23_00048_2023-45_1719292564123",
    pdfName: "a2023-45.pdf",
    title: "The Bharatiya Nyaya Sanhita, 2023",
    shortTitle: "Bharatiya Nyaya Sanhita",
    actNo: "Act No. 45 of 2023",
    year: 2023,
    enactedOn: "2023-12-25",
    inForceFrom: "2024-07-01",
    replaces: "IPC",
    category: "criminal",
    sourceNote: `${NEW_CODES_NOTE} Section 106(2) was not brought into force on 1 July 2024 (S.O. 850(E)).`,
  },
  {
    id: "BNSS",
    kind: "structured",
    indiaCodeActId: "AC_CEN_5_23_00049_202346_1719552320687",
    title: "The Bharatiya Nagarik Suraksha Sanhita, 2023",
    shortTitle: "Bharatiya Nagarik Suraksha Sanhita",
    actNo: "Act No. 46 of 2023",
    year: 2023,
    enactedOn: "2023-12-25",
    inForceFrom: "2024-07-01",
    replaces: "CRPC",
    category: "criminal",
    sourceNote: NEW_CODES_NOTE,
  },
  {
    id: "BSA",
    kind: "structured",
    indiaCodeActId: "AC_CEN_5_23_00049_2023-47_1719292804654",
    title: "The Bharatiya Sakshya Adhiniyam, 2023",
    shortTitle: "Bharatiya Sakshya Adhiniyam",
    actNo: "Act No. 47 of 2023",
    year: 2023,
    enactedOn: "2023-12-25",
    inForceFrom: "2024-07-01",
    replaces: "IEA",
    category: "criminal",
    sourceNote: NEW_CODES_NOTE,
  },
  {
    id: "IPC",
    kind: "pdf",
    // India Code repealed-Act record: "The Indian Penal Code, 45 of 1860 (Rep., Act 45 of 2023)"
    itemUuid: "972afbe0-a2de-415d-9df5-8d70038056ad",
    pdfName: "A1860-45.pdf",
    title: "The Indian Penal Code, 1860",
    shortTitle: "Indian Penal Code",
    actNo: "Act No. 45 of 1860",
    year: 1860,
    enactedOn: "1860-10-06",
    inForceFrom: "1862-01-01",
    repealedOn: "2024-07-01",
    replacedBy: "BNS",
    category: "criminal",
    longTitle: null,
    sourceNote: OLD_CODES_NOTE,
  },
  {
    id: "CRPC",
    kind: "pdf",
    // India Code's central repealed-Act record only holds a scanned 1974 Gazette copy (OCR
    // text, no later amendments). This India Code record (listed under the Government of
    // NCT of Delhi) carries the consolidated central text as amended up to Act 22 of 2018.
    itemUuid: "aedad03b-d75d-4ad4-8833-2e467cc050cc",
    pdfName: "the_code_of_criminal_procedure,_1973.pdf",
    title: "The Code of Criminal Procedure, 1973",
    shortTitle: "Code of Criminal Procedure",
    actNo: "Act No. 2 of 1974",
    chapterTitleFixes: { IV: "A.—Powers of Superior Officers of Police; B.—Aid to the Magistrates and the Police" },
    year: 1973,
    enactedOn: "1974-01-25",
    inForceFrom: "1974-04-01",
    repealedOn: "2024-07-01",
    replacedBy: "BNSS",
    category: "criminal",
    longTitle: "An Act to consolidate and amend the law relating to Criminal Procedure.",
    sourceNote: `${OLD_CODES_NOTE} Source copy: the consolidated text hosted on India Code under the Government of NCT of Delhi, as amended up to the Criminal Law (Amendment) Act, 2018.`,
  },
  {
    id: "IEA",
    kind: "pdf",
    // India Code repealed-Act record: "The Indian Evidence Act, 1872, 1 of 1872 (Rep., Act 47 of 2023)"
    itemUuid: "b62073e0-4d33-4348-8eda-d92af40af24b",
    pdfName: "A1872-1.pdf",
    title: "The Indian Evidence Act, 1872",
    shortTitle: "Indian Evidence Act",
    actNo: "Act No. 1 of 1872",
    year: 1872,
    enactedOn: "1872-03-15",
    inForceFrom: "1872-09-01",
    repealedOn: "2024-07-01",
    replacedBy: "BSA",
    category: "criminal",
    longTitle: null,
    sourceNote: OLD_CODES_NOTE,
  },
  {
    id: "NIA",
    kind: "structured",
    indiaCodeActId: "AC_CEN_2_33_00042_00042_1523271998701",
    title: "The Negotiable Instruments Act, 1881",
    shortTitle: "Negotiable Instruments Act",
    actNo: "Act No. 26 of 1881",
    chapterTitleFixes: { II: "Of Notes, Bills and Cheques", XV: "Of Bills in Sets" },
    year: 1881,
    enactedOn: "1881-12-09",
    inForceFrom: "1882-03-01",
    category: "civil",
    sourceNote: "Bare act text as consolidated on India Code. Verify against the Gazette of India for legal use.",
  },
  {
    id: "HMA",
    kind: "structured",
    indiaCodeActId: "AC_CEN_3_20_00004_195525_1517807318992",
    title: "The Hindu Marriage Act, 1955",
    shortTitle: "Hindu Marriage Act",
    actNo: "Act No. 25 of 1955",
    year: 1955,
    enactedOn: "1955-05-18",
    inForceFrom: "1955-05-18",
    category: "family",
    sourceNote: "Bare act text as consolidated on India Code. Verify against the Gazette of India for legal use.",
  },
  {
    id: "CPA",
    kind: "structured",
    indiaCodeActId: "AC_CEN_21_44_00007_201935_1596441164903",
    title: "The Consumer Protection Act, 2019",
    shortTitle: "Consumer Protection Act",
    actNo: "Act No. 35 of 2019",
    year: 2019,
    enactedOn: "2019-08-09",
    inForceFrom: "2020-07-20",
    category: "civil",
    sourceNote:
      "Bare act text as consolidated on India Code. Most provisions came into force on 20 July 2020 and the remaining ones on 24 July 2020 (S.O. 2421(E)). Verify against the Gazette of India for legal use.",
  },
  {
    id: "RTI",
    kind: "structured",
    indiaCodeActId: "AC_CEN_26_36_00004_200522_1517807322955",
    title: "The Right to Information Act, 2005",
    shortTitle: "Right to Information Act",
    actNo: "Act No. 22 of 2005",
    year: 2005,
    enactedOn: "2005-06-15",
    inForceFrom: "2005-10-12",
    category: "public",
    sourceNote:
      "Bare act text as consolidated on India Code. Sections 4(1), 5(1), 5(2), 12, 13, 15, 16, 24, 27 and 28 came into force on 15 June 2005 and the rest on 12 October 2005. Verify against the Gazette of India for legal use.",
  },
];

// www.ncrb.gov.in redirects here (and serves an incomplete TLS chain); this is the canonical host.
const NCRB = "https://www.ncrb.mha.gov.in/uploads/SankalanPortal";

export const NCRB_TABLES = [
  { oldAct: "IPC", newAct: "BNS", header: /bharatiya nyaya sanhita/i, url: `${NCRB}/SectionTableBNS.html`, title: "NCRB SANKALAN: Bharatiya Nyaya Sanhita, 2023 and Indian Penal Code, 1860 section table" },
  { oldAct: "CRPC", newAct: "BNSS", header: /bharatiya nagarik suraksha sanhita/i, url: `${NCRB}/SectionTableBNSS.html`, title: "NCRB SANKALAN: Bharatiya Nagarik Suraksha Sanhita, 2023 and Code of Criminal Procedure, 1973 section table" },
  { oldAct: "IEA", newAct: "BSA", header: /bharatiya sakshya adhiniyam/i, url: `${NCRB}/SectionTableBSA.html`, title: "NCRB SANKALAN: Bharatiya Sakshya Adhiniyam, 2023 and Indian Evidence Act, 1872 section table" },
];
