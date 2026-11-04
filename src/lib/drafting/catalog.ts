// Drafting template catalogue: the single source for the in-app gallery, the
// public /templates pages and the database seed. Safe for client and server, but
// import it only from server code so the bodies are not shipped to browsers.
//
// Every template is UNREVIEWED (reviewedBy: null) until an enrolled advocate
// checks it; the UI says so. No case law is cited. Where a statutory section
// could vary, the draft leaves it to the advocate instead of guessing.
// Markup reference: src/lib/drafting/markup.ts. Placeholders: src/lib/drafting/fill.ts.

import type { DraftTemplate, FieldOption, TemplateField } from "./types";

/* ----------------------------- shared fields ----------------------------- */

const placeDate = (group: string): TemplateField[] => [
  { name: "place", label: "Place", type: "text", required: true, group, placeholder: "e.g. Lucknow" },
  { name: "date", label: "Date", type: "date", required: true, group, defaultToday: true },
];

const advocateFields = (group: string, withEnrolment = false): TemplateField[] => [
  { name: "advocate_name", label: "Advocate's name", type: "text", required: true, group },
  ...(withEnrolment
    ? [{ name: "advocate_enrolment", label: "Enrolment number", type: "text", required: true, group, placeholder: "e.g. UP/1234/2015" } as TemplateField]
    : []),
];

const advocateLetterhead = (group: string): TemplateField[] => [
  ...advocateFields(group),
  {
    name: "advocate_address",
    label: "Advocate's chamber address and contact",
    type: "textarea",
    required: true,
    group,
    placeholder: "Chamber no., court complex, city\nPhone / email",
  },
];

const bailAntecedents: FieldOption[] = [
  {
    value: "none",
    label: "the applicant has no criminal antecedents and has never been convicted of any offence",
    hi: "आवेदक का कोई आपराधिक इतिहास नहीं है तथा उसे कभी किसी अपराध में दोषसिद्ध नहीं किया गया है",
  },
  {
    value: "disclosed",
    label: "the antecedents of the applicant are disclosed in the list annexed to this application",
    hi: "आवेदक के आपराधिक इतिहास का विवरण इस प्रार्थना पत्र के साथ संलग्न सूची में दिया गया है",
  },
];

const noticeHeaderEn = `>> {{advocate_name}}
>> Advocate
>> {{advocate_address}}

Date: {{date}}

**BY REGISTERED POST A.D. / SPEED POST**`;

const noticeHeaderHi = `>> {{advocate_name}}
>> अधिवक्ता
>> {{advocate_address}}

दिनांक: {{date}}

**पंजीकृत डाक ए.डी. / स्पीड पोस्ट द्वारा**`;

/* ------------------------------- templates ------------------------------- */

const chequeBounce: DraftTemplate = {
  slug: "cheque-bounce-notice-section-138",
  title: "Cheque bounce demand notice (Section 138, NI Act)",
  titleHi: "चेक अनादरण मांग नोटिस (धारा 138, परक्राम्य लिखत अधिनियम)",
  category: "Notices",
  summary:
    "Statutory demand notice to the drawer of a dishonoured cheque under Section 138 of the Negotiable Instruments Act, 1881, calling for payment within fifteen days.",
  useWhen:
    "Sent by the payee, usually through an advocate, within thirty days of receiving the bank's information that the cheque was returned unpaid.",
  fields: [
    { name: "client_name", label: "Client's name (payee)", type: "text", required: true, group: "Your client" },
    {
      name: "client_description",
      label: "Client's parentage or company details",
      type: "text",
      required: true,
      group: "Your client",
      placeholder: "e.g. S/o Ramesh Kumar",
      help: "For a company: a company incorporated under the Companies Act, 2013.",
    },
    { name: "client_address", label: "Client's address", type: "text", required: true, group: "Your client" },
    { name: "drawer_name", label: "Drawer's name", type: "text", required: true, group: "Drawer" },
    {
      name: "drawer_description",
      label: "Drawer's parentage or company details",
      type: "text",
      required: true,
      group: "Drawer",
      placeholder: "e.g. S/o Mahesh Chand",
    },
    { name: "drawer_address", label: "Drawer's address", type: "textarea", required: true, group: "Drawer" },
    {
      name: "liability_details",
      label: "Debt or liability the cheque was given for",
      type: "textarea",
      required: true,
      group: "Cheque",
      help: "e.g. repayment of a loan of ₹2,00,000 advanced by bank transfer on 10.01.2026.",
    },
    { name: "cheque_number", label: "Cheque number", type: "text", required: true, group: "Cheque" },
    { name: "cheque_date", label: "Date on the cheque", type: "date", required: true, group: "Cheque" },
    { name: "cheque_amount", label: "Cheque amount (₹)", type: "number", required: true, group: "Cheque", min: 1 },
    {
      name: "bank_name",
      label: "Drawee bank and branch",
      type: "text",
      required: true,
      group: "Cheque",
      placeholder: "e.g. State Bank of India, Hazratganj branch, Lucknow",
    },
    {
      name: "presented_bank",
      label: "Your client's bank (where presented)",
      type: "text",
      required: true,
      group: "Dishonour",
    },
    {
      name: "dishonour_reason",
      label: "Reason in the return memo",
      type: "select",
      required: true,
      group: "Dishonour",
      options: [
        { value: "funds_insufficient", label: "Funds Insufficient", hi: "अपर्याप्त निधि" },
        { value: "exceeds_arrangement", label: "Exceeds Arrangement", hi: "व्यवस्था से अधिक" },
        { value: "payment_stopped", label: "Payment Stopped by Drawer", hi: "आहर्ता द्वारा भुगतान रोका गया" },
        { value: "account_closed", label: "Account Closed", hi: "खाता बंद" },
        { value: "refer_to_drawer", label: "Refer to Drawer", hi: "आहर्ता से संपर्क करें" },
      ],
    },
    { name: "return_memo_date", label: "Date of the return memo", type: "date", required: true, group: "Dishonour" },
    {
      name: "info_received_date",
      label: "Date your client received the dishonour information",
      type: "date",
      required: true,
      group: "Dishonour",
      help: "The notice must be sent within 30 days of this date.",
    },
    ...advocateLetterhead("Advocate"),
    ...placeDate("Advocate"),
  ],
  bodyEn: `${noticeHeaderEn}

To,
{{drawer_name}}
{{drawer_description}}
{{drawer_address}}

## LEGAL NOTICE UNDER SECTION 138 OF THE NEGOTIABLE INSTRUMENTS ACT, 1881

Sir/Madam,

Under instructions from and on behalf of my client, {{client_name}}, {{client_description}}, residing at / having its office at {{client_address}} (hereinafter "my client"), I hereby serve upon you the following legal notice:

1. That you were liable to pay my client a legally enforceable debt or liability towards {{liability_details}}.

2. That in discharge of the said debt or liability, you drew and issued cheque no. {{cheque_number}} dated {{cheque_date}} for ₹{{cheque_amount|inr}}/- (Rupees {{cheque_amount|words}} only), drawn on {{bank_name}}, in favour of my client.

3. That my client presented the said cheque for encashment through the bankers of my client, {{presented_bank}}, within its period of validity. The cheque was returned unpaid by your banker with the remark "{{dishonour_reason}}", as stated in the return memo dated {{return_memo_date}}.

4. That my client received information of the dishonour from the bank on {{info_received_date}}, and this notice is issued within thirty days of receipt of that information.

5. That the dishonour of the said cheque for the above reason constitutes an offence punishable under Section 138 of the Negotiable Instruments Act, 1881.

6. I therefore call upon you to pay the said amount of ₹{{cheque_amount|inr}}/- (Rupees {{cheque_amount|words}} only) to my client within FIFTEEN (15) DAYS of the receipt of this notice.

7. Please take notice that if you fail to make the payment within the said period, my client shall be constrained to initiate criminal proceedings against you under Section 138 read with Section 142 of the Negotiable Instruments Act, 1881, and such civil proceedings as may be advised, entirely at your risk as to costs and consequences.

8. A copy of this notice is retained in my office for record and further action.

>> {{advocate_name}}
>> Advocate for {{client_name}}`,
  bodyHi: `${noticeHeaderHi}

सेवा में,
{{drawer_name}}
{{drawer_description}}
{{drawer_address}}

## परक्राम्य लिखत अधिनियम, 1881 की धारा 138 के अंतर्गत विधिक नोटिस

महोदय/महोदया,

मैं अपने मुवक्किल {{client_name}}, {{client_description}}, निवासी / कार्यालय {{client_address}} (जिन्हें आगे "मेरा मुवक्किल" कहा गया है) के निर्देश पर एवं उनकी ओर से आपको निम्नलिखित विधिक नोटिस देता/देती हूँ:

1. यह कि आप पर मेरे मुवक्किल का {{liability_details}} के संबंध में विधिक रूप से प्रवर्तनीय ऋण अथवा दायित्व बकाया था।

2. यह कि उक्त ऋण अथवा दायित्व के निर्वहन में आपने मेरे मुवक्किल के पक्ष में {{bank_name}} पर आहरित चेक संख्या {{cheque_number}} दिनांक {{cheque_date}} राशि ₹{{cheque_amount|inr}}/- जारी किया।

3. यह कि मेरे मुवक्किल ने उक्त चेक को उसकी वैधता अवधि के भीतर अपने बैंक {{presented_bank}} के माध्यम से भुगतान हेतु प्रस्तुत किया, किंतु आपके बैंक ने उसे "{{dishonour_reason}}" टिप्पणी के साथ बिना भुगतान के लौटा दिया, जैसा कि वापसी ज्ञापन (रिटर्न मेमो) दिनांक {{return_memo_date}} में उल्लिखित है।

4. यह कि मेरे मुवक्किल को चेक अनादरण की सूचना बैंक से दिनांक {{info_received_date}} को प्राप्त हुई तथा यह नोटिस उक्त सूचना की प्राप्ति के तीस दिनों के भीतर जारी किया जा रहा है।

5. यह कि उपरोक्त कारण से उक्त चेक का अनादरण परक्राम्य लिखत अधिनियम, 1881 की धारा 138 के अंतर्गत दंडनीय अपराध है।

6. अतः मैं आपसे अपेक्षा करता/करती हूँ कि इस नोटिस की प्राप्ति के पंद्रह (15) दिनों के भीतर उक्त राशि ₹{{cheque_amount|inr}}/- का भुगतान मेरे मुवक्किल को करें।

7. कृपया ध्यान दें कि यदि आप उक्त अवधि के भीतर भुगतान करने में विफल रहते हैं, तो मेरा मुवक्किल आपके विरुद्ध परक्राम्य लिखत अधिनियम, 1881 की धारा 138 सपठित धारा 142 के अंतर्गत आपराधिक कार्यवाही तथा परामर्शानुसार सिविल कार्यवाही प्रारंभ करने के लिए बाध्य होगा, जिसके समस्त व्यय एवं परिणामों के लिए आप स्वयं उत्तरदायी होंगे।

8. इस नोटिस की एक प्रति अभिलेख एवं आगे की कार्यवाही हेतु मेरे कार्यालय में सुरक्षित रखी गई है।

>> {{advocate_name}}
>> अधिवक्ता, {{client_name}} की ओर से`,
  lawRefs: ["Negotiable Instruments Act, 1881, s.138", "Negotiable Instruments Act, 1881, s.142"],
  esignAllowed: true,
  checks: [
    "Send within thirty days of the client receiving the bank's dishonour information.",
    "Send to every address of the drawer you know, by registered post A.D. or speed post, and keep the postal receipts and tracking report.",
    "If the drawer is a company or firm, consider also addressing the persons in charge of its affairs.",
    "Count fifteen days from the drawer's receipt of the notice before filing a complaint.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const replyToNotice: DraftTemplate = {
  slug: "reply-to-legal-notice",
  title: "Reply to a legal notice",
  titleHi: "विधिक नोटिस का उत्तर",
  category: "Notices",
  summary:
    "A firm, point-by-point reply to a legal notice that denies unadmitted allegations, sets out your client's version and reserves all rights.",
  useWhen: "Sent on behalf of the person who received a legal notice, ideally within the time the notice allows.",
  fields: [
    { name: "client_name", label: "Your client (who received the notice)", type: "text", required: true, group: "Parties" },
    { name: "client_address", label: "Client's address", type: "text", required: true, group: "Parties" },
    { name: "sender_name", label: "Person who sent the notice", type: "text", required: true, group: "Parties" },
    { name: "sender_address", label: "Sender's address", type: "textarea", required: true, group: "Parties" },
    { name: "notice_date", label: "Date of the notice", type: "date", required: true, group: "The notice" },
    { name: "notice_received_date", label: "Date your client received it", type: "date", required: true, group: "The notice" },
    {
      name: "notice_subject",
      label: "What the notice demands",
      type: "text",
      required: true,
      group: "The notice",
      placeholder: "e.g. payment of ₹3,00,000 allegedly due under invoice no. 45",
    },
    {
      name: "client_version",
      label: "Your client's version of the facts",
      type: "textarea",
      required: true,
      group: "Your reply",
    },
    {
      name: "denials",
      label: "Point-by-point reply to the notice",
      type: "textarea",
      required: true,
      group: "Your reply",
      help: "One point per line, following the paragraph order of the notice.",
    },
    {
      name: "counter_demand",
      label: "Counter-demand (optional)",
      type: "textarea",
      group: "Your reply",
      fallback: "My client reserves the right to claim damages and costs from you in accordance with law.",
    },
    ...advocateLetterhead("Advocate"),
    ...placeDate("Advocate"),
  ],
  bodyEn: `${noticeHeaderEn}

To,
{{sender_name}}
{{sender_address}}

## REPLY TO LEGAL NOTICE DATED {{notice_date}}

Sir/Madam,

Under instructions from and on behalf of my client, {{client_name}}, residing at / having its office at {{client_address}} (hereinafter "my client"), I reply to your legal notice dated {{notice_date}}, received by my client on {{notice_received_date}}, by which you have demanded {{notice_subject}}, as follows:

1. At the outset, all the allegations, averments and claims made in your notice are denied as false and misconceived, save and except those specifically admitted herein. Nothing in your notice shall be deemed to be admitted by my client for want of specific denial.

2. The true and correct facts are as follows:
{{client_version}}

3. Reply on merits, without prejudice to the above:
{{denials}}

4. In view of the above, you are not entitled to the demands raised in the notice, and my client is under no liability to comply with them. You are called upon to withdraw the notice forthwith.

5. {{counter_demand}}

6. This reply is issued without prejudice to all the rights and contentions of my client, which are expressly reserved, including the right to initiate appropriate civil and/or criminal proceedings against you.

7. A copy of this reply is retained in my office for record and further action.

>> {{advocate_name}}
>> Advocate for {{client_name}}`,
  bodyHi: null,
  lawRefs: [],
  esignAllowed: true,
  checks: [
    "Answer every paragraph of the notice; an unanswered allegation may later be argued to be admitted.",
    "Do not admit any fact, signature or document you have not verified with the client.",
    "Keep proof of dispatch and delivery of the reply.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const debtNatures: FieldOption[] = [
  { value: "loan", label: "a loan advanced by my client to you", hi: "मेरे मुवक्किल द्वारा आपको दिए गए ऋण" },
  { value: "goods", label: "the price of goods sold and delivered by my client to you", hi: "मेरे मुवक्किल द्वारा आपको विक्रय एवं प्रदाय किए गए माल के मूल्य" },
  { value: "services", label: "fees for services rendered by my client to you", hi: "मेरे मुवक्किल द्वारा आपको प्रदान की गई सेवाओं के शुल्क" },
  { value: "other", label: "an amount due from you to my client", hi: "आपसे मेरे मुवक्किल को देय राशि" },
];

const moneyRecovery: DraftTemplate = {
  slug: "legal-notice-recovery-of-money",
  title: "Legal notice for recovery of money",
  titleHi: "धन वसूली हेतु विधिक नोटिस",
  category: "Notices",
  summary:
    "Demand notice for an outstanding loan, unpaid invoice or fees, claiming the principal with interest and warning of recovery proceedings.",
  useWhen: "Sent by a creditor before filing a recovery suit, to record the demand and give the debtor a last chance to pay.",
  fields: [
    { name: "client_name", label: "Client's name (creditor)", type: "text", required: true, group: "Your client" },
    {
      name: "client_description",
      label: "Client's parentage or company details",
      type: "text",
      required: true,
      group: "Your client",
      placeholder: "e.g. S/o Ramesh Kumar",
    },
    { name: "client_address", label: "Client's address", type: "text", required: true, group: "Your client" },
    { name: "debtor_name", label: "Debtor's name", type: "text", required: true, group: "Debtor" },
    { name: "debtor_description", label: "Debtor's parentage or company details", type: "text", required: true, group: "Debtor" },
    { name: "debtor_address", label: "Debtor's address", type: "textarea", required: true, group: "Debtor" },
    { name: "debt_nature", label: "What the money is for", type: "select", required: true, group: "The debt", options: debtNatures },
    {
      name: "transaction_details",
      label: "How and when the money became due",
      type: "textarea",
      required: true,
      group: "The debt",
      help: "Dates, invoice or agreement numbers, mode of payment, any part-payments and reminders.",
    },
    { name: "principal_amount", label: "Amount due (₹)", type: "number", required: true, group: "The debt", min: 1 },
    {
      name: "interest_rate",
      label: "Interest claimed (% per year)",
      type: "number",
      required: true,
      group: "The debt",
      min: 0,
      max: 36,
      help: "Use the agreed rate; if none was agreed, a rate you can justify.",
    },
    { name: "interest_from", label: "Interest claimed from", type: "date", required: true, group: "The debt" },
    { name: "demand_days", label: "Days given to pay", type: "number", required: true, group: "The debt", defaultValue: "15", min: 7, max: 60 },
    ...advocateLetterhead("Advocate"),
    ...placeDate("Advocate"),
  ],
  bodyEn: `${noticeHeaderEn}

To,
{{debtor_name}}
{{debtor_description}}
{{debtor_address}}

## LEGAL NOTICE FOR RECOVERY OF ₹{{principal_amount|inr}}/-

Sir/Madam,

Under instructions from and on behalf of my client, {{client_name}}, {{client_description}}, residing at / having its office at {{client_address}} (hereinafter "my client"), I hereby serve upon you the following legal notice:

1. That a sum of ₹{{principal_amount|inr}}/- (Rupees {{principal_amount|words}} only) is due and payable by you to my client towards {{debt_nature}}.

2. That the facts giving rise to the said liability are as follows:
{{transaction_details}}

3. That despite repeated requests and reminders by my client, you have failed and neglected to pay the said amount, which remains outstanding.

4. That you are also liable to pay interest on the said amount at the rate of {{interest_rate}}% per annum from {{interest_from}} until the date of actual payment.

5. I therefore call upon you to pay my client the sum of ₹{{principal_amount|inr}}/- together with interest as stated above within {{demand_days}} days of the receipt of this notice.

6. Please take notice that if you fail to pay within the said period, my client shall be constrained to institute appropriate legal proceedings against you for recovery of the said amount with interest and costs, including a summary suit under Order XXXVII of the Code of Civil Procedure, 1908 where applicable, entirely at your risk as to costs and consequences.

7. A copy of this notice is retained in my office for record and further action.

>> {{advocate_name}}
>> Advocate for {{client_name}}`,
  bodyHi: `${noticeHeaderHi}

सेवा में,
{{debtor_name}}
{{debtor_description}}
{{debtor_address}}

## ₹{{principal_amount|inr}}/- की वसूली हेतु विधिक नोटिस

महोदय/महोदया,

मैं अपने मुवक्किल {{client_name}}, {{client_description}}, निवासी / कार्यालय {{client_address}} (जिन्हें आगे "मेरा मुवक्किल" कहा गया है) के निर्देश पर एवं उनकी ओर से आपको निम्नलिखित विधिक नोटिस देता/देती हूँ:

1. यह कि {{debt_nature}} के संबंध में ₹{{principal_amount|inr}}/- की राशि आप पर मेरे मुवक्किल को देय एवं बकाया है।

2. यह कि उक्त दायित्व से संबंधित तथ्य इस प्रकार हैं:
{{transaction_details}}

3. यह कि मेरे मुवक्किल द्वारा बार-बार अनुरोध एवं स्मरण कराए जाने के बावजूद आपने उक्त राशि का भुगतान नहीं किया है तथा वह राशि अब तक बकाया है।

4. यह कि आप उक्त राशि पर दिनांक {{interest_from}} से वास्तविक भुगतान की तिथि तक {{interest_rate}}% वार्षिक की दर से ब्याज का भुगतान करने के लिए भी उत्तरदायी हैं।

5. अतः मैं आपसे अपेक्षा करता/करती हूँ कि इस नोटिस की प्राप्ति के {{demand_days}} दिनों के भीतर उपरोक्त ब्याज सहित ₹{{principal_amount|inr}}/- की राशि का भुगतान मेरे मुवक्किल को करें।

6. कृपया ध्यान दें कि यदि आप उक्त अवधि के भीतर भुगतान करने में विफल रहते हैं, तो मेरा मुवक्किल ब्याज एवं व्यय सहित उक्त राशि की वसूली हेतु आपके विरुद्ध उचित विधिक कार्यवाही, जिसमें जहाँ लागू हो वहाँ सिविल प्रक्रिया संहिता, 1908 के आदेश XXXVII के अंतर्गत संक्षिप्त वाद भी सम्मिलित है, प्रारंभ करने के लिए बाध्य होगा, जिसके समस्त व्यय एवं परिणामों के लिए आप स्वयं उत्तरदायी होंगे।

7. इस नोटिस की एक प्रति अभिलेख एवं आगे की कार्यवाही हेतु मेरे कार्यालय में सुरक्षित रखी गई है।

>> {{advocate_name}}
>> अधिवक्ता, {{client_name}} की ओर से`,
  lawRefs: ["Code of Civil Procedure, 1908, Order XXXVII", "Indian Contract Act, 1872"],
  esignAllowed: true,
  checks: [
    "Check limitation for the recovery suit before sending; a notice does not by itself extend limitation.",
    "Attach or keep ready copies of invoices, agreements, ledger extracts and earlier reminders.",
    "If the debt is owed by an MSME buyer to a registered MSME supplier, consider the delayed-payment remedies under the MSMED Act, 2006.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const bailCustody: FieldOption[] = [
  { value: "judicial", label: "has been in judicial custody", hi: "न्यायिक अभिरक्षा में है" },
  { value: "police", label: "has been in police custody", hi: "पुलिस अभिरक्षा में है" },
];

const bailPrevious: FieldOption[] = [
  {
    value: "none",
    label:
      "no other bail application on behalf of the applicant has been filed before this Hon'ble Court, any other court or the Hon'ble High Court in this case",
    hi: "इस मामले में आवेदक की ओर से इस माननीय न्यायालय, किसी अन्य न्यायालय अथवा माननीय उच्च न्यायालय में कोई अन्य जमानत प्रार्थना पत्र प्रस्तुत नहीं किया गया है",
  },
  {
    value: "filed",
    label: "the details of the earlier bail application(s) filed on behalf of the applicant in this case, and their outcome, are annexed to this application",
    hi: "इस मामले में आवेदक की ओर से पूर्व में प्रस्तुत जमानत प्रार्थना पत्र(पत्रों) का विवरण एवं उनका परिणाम इस प्रार्थना पत्र के साथ संलग्न है",
  },
];

const accusedFields = (group: string): TemplateField[] => [
  { name: "accused_name", label: "Accused's name", type: "text", required: true, group },
  { name: "accused_parentage", label: "S/o, D/o or W/o", type: "text", required: true, group, placeholder: "e.g. S/o Ram Prakash" },
  { name: "accused_age", label: "Age (years)", type: "number", required: true, group, min: 7, max: 120 },
  { name: "accused_address", label: "Address", type: "text", required: true, group },
  { name: "state_name", label: "State (prosecuting)", type: "text", required: true, group, placeholder: "e.g. Uttar Pradesh" },
];

const firFields = (group: string): TemplateField[] => [
  { name: "fir_number", label: "FIR number and year", type: "text", required: true, group, placeholder: "e.g. 123/2026" },
  { name: "police_station", label: "Police station", type: "text", required: true, group },
  { name: "district", label: "District", type: "text", required: true, group },
  {
    name: "offence_sections",
    label: "Sections alleged",
    type: "text",
    required: true,
    group,
    placeholder: "e.g. 303(2), 317(2) BNS",
    help: "Copy them from the FIR. Offences committed before 1 July 2024 stay under the IPC.",
  },
];

const bailMagistrate: DraftTemplate = {
  slug: "regular-bail-application-magistrate-bnss-480",
  title: "Regular bail application before Magistrate (BNSS s.480)",
  titleHi: "मजिस्ट्रेट के समक्ष नियमित जमानत प्रार्थना पत्र (बीएनएसएस धारा 480)",
  category: "Criminal",
  summary:
    "Application for regular bail in a non-bailable offence before a Magistrate under Section 480 of the Bharatiya Nagarik Suraksha Sanhita, 2023, with cause title, grounds and prayer.",
  useWhen: "Filed for an accused who has been arrested and produced before the Magistrate's court.",
  fields: [
    {
      name: "court_designation",
      label: "Court",
      type: "text",
      required: true,
      group: "Court",
      placeholder: "e.g. Chief Judicial Magistrate",
      help: "Chief Judicial Magistrate, Judicial Magistrate First Class or Metropolitan Magistrate.",
    },
    { name: "court_place", label: "Place of the court", type: "text", required: true, group: "Court", placeholder: "e.g. Lucknow" },
    { name: "case_number", label: "Bail application number (if allotted)", type: "text", group: "Court", fallback: "______ of ______", fallbackHi: "______ सन् ______" },
    ...accusedFields("Accused"),
    ...firFields("FIR and custody"),
    { name: "arrest_date", label: "Date of arrest", type: "date", required: true, group: "FIR and custody" },
    { name: "custody_status", label: "Custody", type: "select", required: true, group: "FIR and custody", options: bailCustody },
    { name: "facts_summary", label: "Prosecution case in brief", type: "textarea", required: true, group: "Grounds" },
    {
      name: "grounds",
      label: "Grounds for bail",
      type: "textarea",
      required: true,
      group: "Grounds",
      help: "e.g. false implication, nature of evidence, recovery, period in custody, investigation status, health, family circumstances.",
    },
    { name: "antecedents", label: "Criminal antecedents", type: "select", required: true, group: "Grounds", options: bailAntecedents },
    { name: "previous_application", label: "Earlier bail applications", type: "select", required: true, group: "Grounds", options: bailPrevious },
    ...advocateFields("Advocate", true),
    ...placeDate("Advocate"),
  ],
  bodyEn: `# IN THE COURT OF THE {{court_designation|upper}}, {{court_place|upper}}

^^ Bail Application No. {{case_number}}

^^ IN THE MATTER OF:

{{accused_name}}
{{accused_parentage}}, aged about {{accused_age}} years
R/o {{accused_address}}
>> ...Applicant/Accused

## VERSUS

State of {{state_name}}
>> ...Respondent

^^ FIR No. {{fir_number}}
^^ Police Station: {{police_station}}, District: {{district}}
^^ Under Sections: {{offence_sections}}

## APPLICATION UNDER SECTION 480 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023 FOR GRANT OF REGULAR BAIL

MOST RESPECTFULLY SHOWETH:

1. That the applicant was arrested on {{arrest_date}} in connection with the above FIR registered at Police Station {{police_station}}, District {{district}}, for the alleged offences under Sections {{offence_sections}}, and {{custody_status}} since then.

2. That the case of the prosecution, in brief, is as follows:
{{facts_summary}}

3. That the applicant is innocent and has been falsely implicated in the present case. The applicant seeks bail, inter alia, on the following grounds:
{{grounds}}

4. That {{antecedents}}.

5. That {{previous_application}}.

6. That the applicant is a permanent resident of the address stated above, has deep roots in society, and there is no likelihood of the applicant absconding or fleeing from justice.

7. That the applicant undertakes to abide by all the terms and conditions that this Hon'ble Court may impose, to cooperate with the investigation and trial, and not to tamper with evidence or influence any witness.

8. That the applicant is ready to furnish a personal bond and sureties to the satisfaction of this Hon'ble Court.

## PRAYER

It is, therefore, most respectfully prayed that this Hon'ble Court may graciously be pleased to release the applicant on bail in FIR No. {{fir_number}}, Police Station {{police_station}}, under Sections {{offence_sections}}, on such terms and conditions as this Hon'ble Court may deem fit and proper, in the interest of justice.

Any other order which this Hon'ble Court may deem fit in the facts and circumstances of the case may also be passed in favour of the applicant.

Place: {{place}}
Date: {{date}}

>> Applicant/Accused
>> Through Counsel

>> {{advocate_name}}
>> Advocate, Enrolment No. {{advocate_enrolment}}`,
  bodyHi: `# न्यायालय {{court_designation}}, {{court_place}}

^^ जमानत प्रार्थना पत्र संख्या {{case_number}}

^^ मामला:

{{accused_name}}
{{accused_parentage}}, आयु लगभग {{accused_age}} वर्ष
निवासी {{accused_address}}
>> ...आवेदक/अभियुक्त

## बनाम

{{state_name}} राज्य
>> ...प्रत्यर्थी

^^ प्रथम सूचना रिपोर्ट संख्या {{fir_number}}
^^ थाना: {{police_station}}, जिला: {{district}}
^^ धाराएँ: {{offence_sections}}

## भारतीय नागरिक सुरक्षा संहिता, 2023 की धारा 480 के अंतर्गत नियमित जमानत हेतु प्रार्थना पत्र

महोदय,

आवेदक की ओर से सविनय निवेदन है कि:

1. यह कि आवेदक को थाना {{police_station}}, जिला {{district}} में पंजीकृत उपरोक्त प्रथम सूचना रिपोर्ट के संबंध में धाराएँ {{offence_sections}} के अंतर्गत कथित अपराधों हेतु दिनांक {{arrest_date}} को गिरफ्तार किया गया था तथा तभी से आवेदक {{custody_status}}।

2. यह कि अभियोजन का संक्षिप्त कथन इस प्रकार है:
{{facts_summary}}

3. यह कि आवेदक निर्दोष है तथा उसे वर्तमान मामले में झूठा फँसाया गया है। आवेदक निम्नलिखित आधारों पर जमानत की प्रार्थना करता है:
{{grounds}}

4. यह कि {{antecedents}}।

5. यह कि {{previous_application}}।

6. यह कि आवेदक उपरोक्त पते का स्थायी निवासी है, समाज में उसकी गहरी जड़ें हैं तथा उसके फरार होने अथवा न्याय से भागने की कोई संभावना नहीं है।

7. यह कि आवेदक इस माननीय न्यायालय द्वारा लगाई जाने वाली सभी शर्तों का पालन करने, अन्वेषण एवं विचारण में सहयोग करने तथा साक्ष्य से छेड़छाड़ न करने अथवा किसी साक्षी को प्रभावित न करने का वचन देता है।

8. यह कि आवेदक इस माननीय न्यायालय की संतुष्टि के अनुसार व्यक्तिगत बंधपत्र एवं प्रतिभू प्रस्तुत करने के लिए तैयार है।

## प्रार्थना

अतः माननीय न्यायालय से सविनय प्रार्थना है कि आवेदक को प्रथम सूचना रिपोर्ट संख्या {{fir_number}}, थाना {{police_station}}, धाराएँ {{offence_sections}} के मामले में ऐसी शर्तों पर, जो माननीय न्यायालय उचित समझे, जमानत पर रिहा करने की कृपा करें।

अन्य कोई आदेश जो माननीय न्यायालय मामले के तथ्यों एवं परिस्थितियों में उचित समझे, वह भी आवेदक के पक्ष में पारित करने की कृपा करें।

स्थान: {{place}}
दिनांक: {{date}}

>> आवेदक/अभियुक्त
>> द्वारा अधिवक्ता

>> {{advocate_name}}
>> अधिवक्ता, नामांकन संख्या {{advocate_enrolment}}`,
  lawRefs: ["Bharatiya Nagarik Suraksha Sanhita, 2023, s.480"],
  esignAllowed: true,
  checks: [
    "Confirm which code applies: offences committed before 1 July 2024 are charged under the IPC, and proceedings pending on that date (including investigations) continue under the CrPC, so cite the corresponding CrPC provision for those.",
    "Attach the FIR copy, arrest memo and any medical or custody documents relied on.",
    "Check whether your court requires a supporting affidavit or a fixed format under local rules.",
    "Disclose every earlier bail application honestly; suppression can lead to cancellation of bail.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const bailSessions: DraftTemplate = {
  slug: "regular-bail-application-sessions-high-court-bnss-483",
  title: "Regular bail application before Sessions Court or High Court (BNSS s.483)",
  titleHi: "सत्र न्यायालय या उच्च न्यायालय के समक्ष नियमित जमानत प्रार्थना पत्र (बीएनएसएस धारा 483)",
  category: "Criminal",
  summary:
    "Application for regular bail under Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023, before the Court of Session or the High Court, including the bail history.",
  useWhen: "Filed when the offence is triable by the Court of Session, or after bail has been refused by the Magistrate.",
  fields: [
    {
      name: "court_heading",
      label: "Court heading",
      type: "text",
      required: true,
      group: "Court",
      placeholder: "e.g. IN THE COURT OF THE SESSIONS JUDGE, LUCKNOW",
      help: "For a High Court, use its full name, e.g. IN THE HIGH COURT OF DELHI AT NEW DELHI.",
    },
    {
      name: "case_number",
      label: "Application number (if allotted)",
      type: "text",
      group: "Court",
      fallback: "Criminal Bail Application No. ______ of ______",
    },
    ...accusedFields("Accused"),
    ...firFields("FIR and custody"),
    { name: "arrest_date", label: "Date of arrest", type: "date", required: true, group: "FIR and custody" },
    { name: "custody_status", label: "Custody", type: "select", required: true, group: "FIR and custody", options: bailCustody },
    {
      name: "investigation_status",
      label: "Investigation status",
      type: "select",
      required: true,
      group: "FIR and custody",
      options: [
        { value: "pending", label: "the investigation is stated to be in progress" },
        { value: "chargesheet", label: "the investigation is complete and a police report (charge-sheet) has been filed" },
      ],
    },
    {
      name: "bail_history",
      label: "Bail history in this case",
      type: "textarea",
      required: true,
      group: "Grounds",
      help: "e.g. Bail application rejected by the learned Chief Judicial Magistrate, Lucknow by order dated 10.10.2026. Write 'This is the first bail application.' if none.",
    },
    { name: "facts_summary", label: "Prosecution case in brief", type: "textarea", required: true, group: "Grounds" },
    { name: "grounds", label: "Grounds for bail", type: "textarea", required: true, group: "Grounds" },
    { name: "antecedents", label: "Criminal antecedents", type: "select", required: true, group: "Grounds", options: bailAntecedents },
    ...advocateFields("Advocate", true),
    ...placeDate("Advocate"),
  ],
  bodyEn: `# {{court_heading|upper}}

^^ {{case_number}}

^^ IN THE MATTER OF:

{{accused_name}}
{{accused_parentage}}, aged about {{accused_age}} years
R/o {{accused_address}}
>> ...Applicant/Accused

## VERSUS

State of {{state_name}}
>> ...Respondent

^^ FIR No. {{fir_number}}
^^ Police Station: {{police_station}}, District: {{district}}
^^ Under Sections: {{offence_sections}}

## APPLICATION UNDER SECTION 483 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023 FOR GRANT OF REGULAR BAIL

MOST RESPECTFULLY SHOWETH:

1. That the applicant was arrested on {{arrest_date}} in connection with the above FIR registered at Police Station {{police_station}}, District {{district}}, for the alleged offences under Sections {{offence_sections}}, and {{custody_status}} since then.

2. That {{investigation_status}}.

3. That the bail history of the applicant in this case is as follows:
{{bail_history}}

4. That the case of the prosecution, in brief, is as follows:
{{facts_summary}}

5. That the applicant is innocent and has been falsely implicated. The applicant seeks bail, inter alia, on the following grounds:
{{grounds}}

6. That {{antecedents}}.

7. That the applicant is a permanent resident of the address stated above, has deep roots in society, and there is no likelihood of the applicant absconding or fleeing from justice.

8. That the applicant undertakes to abide by all the terms and conditions that this Hon'ble Court may impose, to cooperate with the trial, to appear on every date of hearing, and not to tamper with evidence or influence any witness.

9. That the applicant is ready to furnish a personal bond and sureties to the satisfaction of this Hon'ble Court or the court concerned.

## PRAYER

It is, therefore, most respectfully prayed that this Hon'ble Court may graciously be pleased to release the applicant on bail in FIR No. {{fir_number}}, Police Station {{police_station}}, District {{district}}, under Sections {{offence_sections}}, on such terms and conditions as this Hon'ble Court may deem fit and proper, in the interest of justice.

Any other order which this Hon'ble Court may deem fit in the facts and circumstances of the case may also be passed in favour of the applicant.

Place: {{place}}
Date: {{date}}

>> Applicant/Accused
>> Through Counsel

>> {{advocate_name}}
>> Advocate, Enrolment No. {{advocate_enrolment}}`,
  bodyHi: null,
  lawRefs: ["Bharatiya Nagarik Suraksha Sanhita, 2023, s.483"],
  esignAllowed: true,
  checks: [
    "If the FIR was registered before 1 July 2024, proceedings may continue under the CrPC; cite the corresponding CrPC provision in that case.",
    "High Courts usually require a supporting affidavit, an index, a list of dates and certified copies of the orders refusing bail; follow the High Court's rules.",
    "Attach the FIR, the order of the court below and the custody certificate where available.",
    "Disclose every earlier bail application, including those by co-accused if your court's rules require it.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const anticipatoryBail: DraftTemplate = {
  slug: "anticipatory-bail-application-bnss-482",
  title: "Anticipatory bail application (BNSS s.482)",
  titleHi: "अग्रिम जमानत प्रार्थना पत्र (बीएनएसएस धारा 482)",
  category: "Criminal",
  summary:
    "Application under Section 482 of the Bharatiya Nagarik Suraksha Sanhita, 2023, asking the Court of Session or High Court to direct release on bail in the event of arrest.",
  useWhen: "Filed by a person who has reason to believe they may be arrested for a non-bailable offence.",
  fields: [
    {
      name: "court_heading",
      label: "Court heading",
      type: "text",
      required: true,
      group: "Court",
      placeholder: "e.g. IN THE COURT OF THE SESSIONS JUDGE, LUCKNOW",
    },
    {
      name: "case_number",
      label: "Application number (if allotted)",
      type: "text",
      group: "Court",
      fallback: "Anticipatory Bail Application No. ______ of ______",
    },
    { name: "accused_name", label: "Applicant's name", type: "text", required: true, group: "Applicant" },
    { name: "accused_parentage", label: "S/o, D/o or W/o", type: "text", required: true, group: "Applicant" },
    { name: "accused_age", label: "Age (years)", type: "number", required: true, group: "Applicant", min: 7, max: 120 },
    { name: "accused_address", label: "Address", type: "text", required: true, group: "Applicant" },
    { name: "state_name", label: "State (prosecuting)", type: "text", required: true, group: "Applicant" },
    {
      name: "case_details",
      label: "FIR or complaint details",
      type: "text",
      required: true,
      group: "The case",
      placeholder: "e.g. FIR No. 123/2026, PS Hazratganj, District Lucknow",
      help: "If no FIR is registered yet, describe the complaint or proceedings that give rise to the apprehension.",
    },
    { name: "offence_sections", label: "Sections alleged", type: "text", required: true, group: "The case", placeholder: "e.g. 318(4), 61(2) BNS" },
    { name: "apprehension", label: "Why the applicant fears arrest", type: "textarea", required: true, group: "The case" },
    { name: "facts_summary", label: "Allegations in brief", type: "textarea", required: true, group: "Grounds" },
    { name: "grounds", label: "Grounds for anticipatory bail", type: "textarea", required: true, group: "Grounds" },
    { name: "antecedents", label: "Criminal antecedents", type: "select", required: true, group: "Grounds", options: bailAntecedents },
    {
      name: "previous_application",
      label: "Earlier applications",
      type: "select",
      required: true,
      group: "Grounds",
      options: [
        {
          value: "none",
          label: "no other application for anticipatory bail on behalf of the applicant in this case has been filed before this Hon'ble Court or any other court",
        },
        {
          value: "filed",
          label: "the details of the earlier application(s) for anticipatory bail filed on behalf of the applicant in this case, and their outcome, are annexed to this application",
        },
      ],
    },
    ...advocateFields("Advocate", true),
    ...placeDate("Advocate"),
  ],
  bodyEn: `# {{court_heading|upper}}

^^ {{case_number}}

^^ IN THE MATTER OF:

{{accused_name}}
{{accused_parentage}}, aged about {{accused_age}} years
R/o {{accused_address}}
>> ...Applicant

## VERSUS

State of {{state_name}}
>> ...Respondent

^^ {{case_details}}
^^ Under Sections: {{offence_sections}}

## APPLICATION UNDER SECTION 482 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023 FOR GRANT OF ANTICIPATORY BAIL

MOST RESPECTFULLY SHOWETH:

1. That the applicant is a law-abiding citizen residing at the address stated above.

2. That the applicant has reason to believe that the applicant may be arrested on an accusation of having committed non-bailable offences under Sections {{offence_sections}} in connection with {{case_details}}, for the following reasons:
{{apprehension}}

3. That the allegations against the applicant, in brief, are as follows:
{{facts_summary}}

4. That the applicant is innocent and the allegations are false. The applicant seeks anticipatory bail, inter alia, on the following grounds:
{{grounds}}

5. That {{antecedents}}.

6. That {{previous_application}}.

7. That the applicant is not likely to abscond and undertakes to abide by such conditions as this Hon'ble Court may impose, including making himself/herself available for interrogation by a police officer as and when required, not directly or indirectly making any inducement, threat or promise to any person acquainted with the facts of the case, and not leaving India without the previous permission of the Court.

## PRAYER

It is, therefore, most respectfully prayed that this Hon'ble Court may graciously be pleased to direct that, in the event of arrest of the applicant in connection with {{case_details}} under Sections {{offence_sections}}, the applicant shall be released on bail on such terms and conditions as this Hon'ble Court may deem fit and proper, in the interest of justice.

Any other order which this Hon'ble Court may deem fit in the facts and circumstances of the case may also be passed in favour of the applicant.

Place: {{place}}
Date: {{date}}

>> Applicant
>> Through Counsel

>> {{advocate_name}}
>> Advocate, Enrolment No. {{advocate_enrolment}}`,
  bodyHi: null,
  lawRefs: ["Bharatiya Nagarik Suraksha Sanhita, 2023, s.482"],
  esignAllowed: true,
  checks: [
    "Check that anticipatory bail is not barred for the offences alleged; the BNSS excludes certain sexual offences against minors.",
    "If the FIR was registered before 1 July 2024, proceedings may continue under the CrPC; cite the corresponding CrPC provision in that case.",
    "Attach the FIR or complaint copy and any notice received from the police.",
    "High Courts usually require a supporting affidavit and an explanation if the Court of Session was not approached first.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const affidavit: DraftTemplate = {
  slug: "general-affidavit",
  title: "General affidavit",
  titleHi: "सामान्य शपथ पत्र",
  category: "Affidavits",
  summary:
    "A general affidavit with deponent particulars, numbered statements and a verification clause, usable for courts, offices and banks.",
  useWhen: "Used whenever a sworn statement of facts is needed: name or address declarations, loss of documents, or supporting a court application.",
  fields: [
    { name: "deponent_name", label: "Deponent's name", type: "text", required: true, group: "Deponent" },
    { name: "deponent_parentage", label: "S/o, D/o or W/o", type: "text", required: true, group: "Deponent" },
    { name: "deponent_age", label: "Age (years)", type: "number", required: true, group: "Deponent", min: 18, max: 120 },
    { name: "deponent_occupation", label: "Occupation", type: "text", required: true, group: "Deponent" },
    { name: "deponent_address", label: "Address", type: "text", required: true, group: "Deponent" },
    {
      name: "matter_heading",
      label: "Court and cause title (optional)",
      type: "textarea",
      group: "Statements",
      fallback: "",
      help: "For a court case, paste the court name and cause title. Leave empty for a general affidavit.",
    },
    {
      name: "statements",
      label: "Statements",
      type: "textarea",
      required: true,
      group: "Statements",
      help: "One statement per line. Each becomes a numbered paragraph, e.g. That I am a citizen of India.",
    },
    { name: "place", label: "Place of verification", type: "text", required: true, group: "Verification" },
    { name: "date", label: "Date of verification", type: "date", required: true, group: "Verification", defaultToday: true },
  ],
  bodyEn: `{{matter_heading}}

## AFFIDAVIT

I, {{deponent_name}}, {{deponent_parentage}}, aged about {{deponent_age}} years, {{deponent_occupation}}, resident of {{deponent_address}}, do hereby solemnly affirm and declare as under:

{{statements|numbered}}

>> DEPONENT

## VERIFICATION

Verified at {{place}} on {{date|long}} that the contents of the above affidavit are true and correct to my knowledge and belief, that no part of it is false, and that nothing material has been concealed therefrom.

>> DEPONENT`,
  bodyHi: `{{matter_heading}}

## शपथ पत्र

मैं, {{deponent_name}}, {{deponent_parentage}}, आयु लगभग {{deponent_age}} वर्ष, व्यवसाय {{deponent_occupation}}, निवासी {{deponent_address}}, सत्यनिष्ठा से प्रतिज्ञान करता/करती हूँ तथा घोषणा करता/करती हूँ कि:

{{statements|numbered}}

>> शपथकर्ता

## सत्यापन

मैं, उपरोक्त शपथकर्ता, सत्यापित करता/करती हूँ कि इस शपथ पत्र के उपरोक्त कथन मेरी जानकारी एवं विश्वास के अनुसार सत्य एवं सही हैं, इसका कोई भाग असत्य नहीं है तथा इसमें कोई तात्विक तथ्य छिपाया नहीं गया है। आज दिनांक {{date|long}} को {{place}} में सत्यापित किया।

>> शपथकर्ता`,
  lawRefs: ["Oaths Act, 1969", "Code of Civil Procedure, 1908, Order XIX"],
  esignAllowed: false,
  esignNote:
    "An affidavit must be sworn or affirmed before an oath commissioner or notary public. An electronic signature does not replace that.",
  checks: [
    "Print on non-judicial stamp paper if your State or the receiving authority requires it.",
    "The deponent signs before an oath commissioner or notary, who attests it.",
    "Statements should be facts within the deponent's knowledge; say so where a statement is based on information or belief.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const leaveLicence: DraftTemplate = {
  slug: "leave-and-licence-rent-agreement",
  title: "Leave and licence (rent) agreement",
  titleHi: "लीव एंड लाइसेंस (किराया) अनुबंध",
  category: "Property",
  summary:
    "Leave and licence agreement for residential or commercial premises: licence fee, refundable deposit, charges, use, termination and handing back possession.",
  useWhen: "Signed by an owner and an occupant before the occupant moves in, usually for 11 months.",
  fields: [
    { name: "licensor_name", label: "Licensor (owner) name", type: "text", required: true, group: "Licensor" },
    { name: "licensor_parentage", label: "Licensor's parentage", type: "text", required: true, group: "Licensor", placeholder: "e.g. S/o Suresh Gupta" },
    { name: "licensor_address", label: "Licensor's address", type: "text", required: true, group: "Licensor" },
    { name: "licensee_name", label: "Licensee name", type: "text", required: true, group: "Licensee" },
    { name: "licensee_parentage", label: "Licensee's parentage", type: "text", required: true, group: "Licensee" },
    { name: "licensee_address", label: "Licensee's permanent address", type: "text", required: true, group: "Licensee" },
    {
      name: "property_address",
      label: "Premises: full address and description",
      type: "textarea",
      required: true,
      group: "Premises",
      placeholder: "e.g. Flat No. 402, 4th floor, Sunrise Apartments, Gomti Nagar, Lucknow, admeasuring about 950 sq. ft.",
    },
    {
      name: "property_use",
      label: "Use",
      type: "select",
      required: true,
      group: "Premises",
      options: [
        { value: "residential", label: "residential purposes only, for the Licensee and the Licensee's family" },
        { value: "commercial", label: "commercial / office purposes only" },
      ],
    },
    {
      name: "fixtures",
      label: "Fixtures and fittings provided (optional)",
      type: "textarea",
      group: "Premises",
      fallback: "The fixtures and fittings provided with the Licensed Premises are as per the inventory, if any, signed by both parties.",
    },
    { name: "start_date", label: "Licence starts on", type: "date", required: true, group: "Terms" },
    { name: "term_months", label: "Term (months)", type: "number", required: true, group: "Terms", defaultValue: "11", min: 1, max: 60 },
    { name: "licence_fee", label: "Monthly licence fee (₹)", type: "number", required: true, group: "Terms", min: 1 },
    { name: "fee_due_day", label: "Fee due by day of month", type: "number", required: true, group: "Terms", defaultValue: "5", min: 1, max: 28 },
    { name: "security_deposit", label: "Refundable security deposit (₹)", type: "number", required: true, group: "Terms", min: 0 },
    { name: "notice_months", label: "Notice period for early termination (months)", type: "number", required: true, group: "Terms", defaultValue: "1", min: 1, max: 6 },
    {
      name: "stamp_duty_by",
      label: "Stamp duty and registration paid by",
      type: "select",
      required: true,
      group: "Terms",
      options: [
        { value: "licensee", label: "the Licensee" },
        { value: "licensor", label: "the Licensor" },
        { value: "shared", label: "the Licensor and the Licensee in equal shares" },
      ],
    },
    { name: "jurisdiction", label: "Courts with jurisdiction (city)", type: "text", required: true, group: "Execution" },
    { name: "place", label: "Place of execution", type: "text", required: true, group: "Execution" },
    { name: "date", label: "Date of execution", type: "date", required: true, group: "Execution", defaultToday: true },
  ],
  bodyEn: `# LEAVE AND LICENCE AGREEMENT

This Leave and Licence Agreement is made and executed at {{place}} on {{date|long}}

## BETWEEN

{{licensor_name}}, {{licensor_parentage}}, residing at {{licensor_address}}, hereinafter called the "LICENSOR" (which expression shall, unless repugnant to the context or meaning thereof, include the Licensor's heirs, executors, administrators and assigns) of the ONE PART;

## AND

{{licensee_name}}, {{licensee_parentage}}, permanently residing at {{licensee_address}}, hereinafter called the "LICENSEE" (which expression shall, unless repugnant to the context or meaning thereof, include the Licensee's heirs, executors and administrators) of the OTHER PART.

WHEREAS the Licensor is the lawful owner of, and is otherwise well and sufficiently entitled to, the premises described below (hereinafter "the Licensed Premises"):
{{property_address}}

AND WHEREAS the Licensee has requested the Licensor for permission to use the Licensed Premises on a leave and licence basis, and the Licensor has agreed to grant such permission on the following terms and conditions.

## NOW THIS AGREEMENT WITNESSETH AS FOLLOWS:

1. **Grant of licence.** The Licensor grants to the Licensee a revocable leave and licence to use the Licensed Premises for {{property_use}}, for a period of {{term_months}} months commencing from {{start_date|long}}.

2. **No tenancy.** This agreement is a licence. It does not create any tenancy, lease, sub-tenancy or other interest in the Licensed Premises in favour of the Licensee, and legal possession of the Licensed Premises remains with the Licensor at all times.

3. **Licence fee.** The Licensee shall pay the Licensor a monthly licence fee of ₹{{licence_fee|inr}}/- (Rupees {{licence_fee|words}} only), in advance, on or before the {{fee_due_day|ordinal}} day of each English calendar month.

4. **Security deposit.** The Licensee shall pay the Licensor an interest-free refundable security deposit of ₹{{security_deposit|inr}}/- (Rupees {{security_deposit|words}} only). The Licensor shall refund the deposit on the expiry or earlier termination of this agreement, against the Licensee handing over vacant and peaceful possession of the Licensed Premises, after deducting any unpaid licence fee or charges and the cost of repairing damage beyond normal wear and tear.

5. **Charges.** The Licensee shall pay electricity, water, gas and other consumption charges for the Licensed Premises as per actual bills during the licence period. Property tax and society maintenance charges shall be borne by the Licensor unless otherwise agreed in writing.

6. **Use and care.** The Licensee shall use the Licensed Premises only for the purpose stated above, keep them in good and clean condition, and shall not carry out any structural alteration without the prior written consent of the Licensor. The Licensee shall not store any hazardous or unlawful goods in the Licensed Premises, and shall not cause nuisance or annoyance to neighbours.

7. **No transfer.** The Licensee shall not sub-license, assign or part with possession of the Licensed Premises or any part of them.

8. **Inspection.** The Licensor or the Licensor's authorised representative may inspect the Licensed Premises at reasonable hours after giving prior notice to the Licensee.

9. **Termination.** Either party may terminate this agreement before the expiry of its term by giving {{notice_months}} month(s) written notice to the other party. The Licensor may terminate the licence forthwith if the Licensee fails to pay the licence fee for two consecutive months or commits a breach of any term of this agreement.

10. **Handing back.** On expiry or earlier termination, the Licensee shall hand over vacant and peaceful possession of the Licensed Premises to the Licensor in the same condition in which they were received, subject to normal wear and tear.

11. **Fixtures and fittings.** {{fixtures}}

12. **Stamp duty and registration.** The stamp duty and registration charges on this agreement, as applicable under the law of the State in which the Licensed Premises are situated, shall be borne by {{stamp_duty_by}}.

13. **Governing law and jurisdiction.** This agreement shall be governed by the laws of India, and the courts at {{jurisdiction}} shall have jurisdiction over any dispute arising out of it.

IN WITNESS WHEREOF the parties have signed this agreement on the date and at the place first written above.

**LICENSOR**
Name: {{licensor_name}}
Signature: ____________________

**LICENSEE**
Name: {{licensee_name}}
Signature: ____________________

### WITNESSES

1. Name and address: ____________________
Signature: ____________________

2. Name and address: ____________________
Signature: ____________________`,
  bodyHi: null,
  lawRefs: ["Indian Easements Act, 1882, s.52 (licence)", "Registration Act, 1908, s.17", "State stamp and rent control laws"],
  esignAllowed: true,
  checks: [
    "Stamp duty depends on the State; pay it before or at execution (e-stamping is available in many States).",
    "A lease for a term exceeding one year must be registered under the Registration Act, 1908, which is why many agreements run for 11 months.",
    "In Maharashtra, leave and licence agreements must be registered whatever their term; online registration is available.",
    "Check local rent control law and police verification rules for tenants.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const nda: DraftTemplate = {
  slug: "mutual-non-disclosure-agreement",
  title: "Mutual non-disclosure agreement (NDA)",
  titleHi: "पारस्परिक गोपनीयता अनुबंध (एनडीए)",
  category: "Contracts",
  summary:
    "Two-way confidentiality agreement under Indian law: definition of confidential information, exclusions, permitted use, return of material, injunctive relief and jurisdiction.",
  useWhen: "Signed before two businesses share confidential information to evaluate a deal, partnership or project.",
  fields: [
    { name: "party_a_name", label: "First party's name", type: "text", required: true, group: "Parties" },
    {
      name: "party_a_description",
      label: "First party's description and address",
      type: "text",
      required: true,
      group: "Parties",
      placeholder: "e.g. a company incorporated under the Companies Act, 2013, having its registered office at ...",
    },
    { name: "party_b_name", label: "Second party's name", type: "text", required: true, group: "Parties" },
    { name: "party_b_description", label: "Second party's description and address", type: "text", required: true, group: "Parties" },
    {
      name: "purpose",
      label: "Purpose of sharing information",
      type: "text",
      required: true,
      group: "Terms",
      placeholder: "e.g. evaluating a possible software development engagement",
    },
    { name: "effective_date", label: "Effective date", type: "date", required: true, group: "Terms", defaultToday: true },
    { name: "term_years", label: "Agreement term (years)", type: "number", required: true, group: "Terms", defaultValue: "2", min: 1, max: 10 },
    {
      name: "survival_years",
      label: "Confidentiality continues for (years after the term)",
      type: "number",
      required: true,
      group: "Terms",
      defaultValue: "3",
      min: 1,
      max: 10,
    },
    { name: "jurisdiction", label: "Courts with jurisdiction (city)", type: "text", required: true, group: "Terms" },
    { name: "party_a_signatory", label: "First party signatory and designation", type: "text", group: "Signatures", fallback: "____________________" },
    { name: "party_b_signatory", label: "Second party signatory and designation", type: "text", group: "Signatures", fallback: "____________________" },
    { name: "place", label: "Place of execution", type: "text", required: true, group: "Signatures" },
  ],
  bodyEn: `# MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is made at {{place}} and is effective from {{effective_date|long}} ("Effective Date")

## BETWEEN

{{party_a_name}}, {{party_a_description}} (hereinafter "Party A");

## AND

{{party_b_name}}, {{party_b_description}} (hereinafter "Party B").

Party A and Party B are each a "Party" and together the "Parties". A Party disclosing information is the "Disclosing Party" and a Party receiving it is the "Receiving Party".

WHEREAS the Parties wish to exchange certain confidential information for the purpose of {{purpose}} (the "Purpose"), and agree to protect that information on the following terms.

## NOW THE PARTIES AGREE AS FOLLOWS:

1. **Confidential Information.** "Confidential Information" means all non-public information, in any form, disclosed by or on behalf of the Disclosing Party to the Receiving Party in connection with the Purpose, including business plans, financial information, customer and supplier details, technical data, software, designs, know-how and trade secrets, whether or not marked as confidential, which a reasonable person would understand to be confidential.

2. **Exclusions.** Confidential Information does not include information that the Receiving Party can show (a) is or becomes publicly available other than through a breach of this Agreement; (b) was lawfully known to it before disclosure without an obligation of confidence; (c) is lawfully received from a third party without restriction; or (d) is independently developed without use of the Disclosing Party's Confidential Information.

3. **Obligations.** The Receiving Party shall (a) use the Confidential Information only for the Purpose; (b) not disclose it to any person except its directors, employees, advisers and professional consultants who need to know it for the Purpose and are bound by obligations of confidentiality no less protective than this Agreement; and (c) protect it with at least the degree of care it uses for its own confidential information, and in no event less than reasonable care.

4. **Compelled disclosure.** If the Receiving Party is required by law, regulation or order of a court or authority to disclose any Confidential Information, it may do so to the extent required, after giving the Disclosing Party prompt written notice where lawful, so that the Disclosing Party may seek a protective order.

5. **Return or destruction.** On written request of the Disclosing Party, or on termination of this Agreement, the Receiving Party shall promptly return or destroy the Confidential Information and copies in its possession, and confirm this in writing, except copies it must retain by law, which shall remain subject to this Agreement.

6. **No licence or warranty.** All Confidential Information remains the property of the Disclosing Party. Nothing in this Agreement grants any licence or right in it, other than to use it for the Purpose. Confidential Information is provided "as is", without any warranty.

7. **No obligation.** This Agreement does not oblige either Party to enter into any further agreement or transaction.

8. **Term.** This Agreement shall remain in force for {{term_years}} year(s) from the Effective Date, unless terminated earlier by either Party by thirty days' written notice. The obligations of confidentiality shall survive for {{survival_years}} year(s) after the expiry or termination of this Agreement, and in respect of trade secrets for as long as they remain trade secrets.

9. **Remedies.** The Receiving Party acknowledges that unauthorised use or disclosure of Confidential Information may cause irreparable harm to the Disclosing Party for which damages may not be an adequate remedy, and that the Disclosing Party shall be entitled to seek injunctive relief in addition to any other remedy available in law.

10. **Governing law and jurisdiction.** This Agreement shall be governed by the laws of India. The courts at {{jurisdiction}} shall have exclusive jurisdiction over any dispute arising out of or in connection with it.

11. **General.** This Agreement is the entire agreement between the Parties on its subject matter and supersedes all prior understandings. It may be amended only in writing signed by both Parties. Neither Party may assign it without the other's prior written consent. It may be executed in counterparts and by electronic signature, each of which shall be deemed an original.

IN WITNESS WHEREOF the Parties have executed this Agreement through their authorised signatories.

**For {{party_a_name}}**
Name and designation: {{party_a_signatory}}
Signature: ____________________

**For {{party_b_name}}**
Name and designation: {{party_b_signatory}}
Signature: ____________________`,
  bodyHi: null,
  lawRefs: ["Indian Contract Act, 1872", "Specific Relief Act, 1963", "Information Technology Act, 2000 (electronic signatures)"],
  esignAllowed: true,
  checks: [
    "Pay stamp duty as an agreement under your State's Stamp Act; an unstamped agreement can face admissibility objections.",
    "Avoid adding a non-compete restraint after the relationship ends; Section 27 of the Indian Contract Act, 1872 makes agreements in restraint of trade void, subject to limited exceptions.",
    "Confirm the signatories' authority (board resolution or authorisation letter for companies).",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const appointmentLetter: DraftTemplate = {
  slug: "appointment-offer-letter",
  title: "Appointment / offer letter",
  titleHi: "नियुक्ति / प्रस्ताव पत्र",
  category: "Employment",
  summary:
    "Offer and appointment letter for an employee: designation, joining date, remuneration, probation, notice period, confidentiality and acceptance.",
  useWhen: "Issued by an employer to a selected candidate before joining.",
  fields: [
    { name: "company_name", label: "Employer name", type: "text", required: true, group: "Employer" },
    { name: "company_address", label: "Employer address", type: "textarea", required: true, group: "Employer" },
    { name: "signatory_name", label: "Signatory's name", type: "text", required: true, group: "Employer" },
    { name: "signatory_designation", label: "Signatory's designation", type: "text", required: true, group: "Employer", placeholder: "e.g. Director, Human Resources" },
    { name: "candidate_name", label: "Candidate's name", type: "text", required: true, group: "Candidate" },
    { name: "candidate_address", label: "Candidate's address", type: "textarea", required: true, group: "Candidate" },
    { name: "designation", label: "Designation", type: "text", required: true, group: "Role" },
    { name: "reporting_to", label: "Reports to", type: "text", required: true, group: "Role" },
    { name: "work_location", label: "Place of work", type: "text", required: true, group: "Role" },
    { name: "joining_date", label: "Joining date", type: "date", required: true, group: "Role" },
    { name: "ctc_annual", label: "Annual cost to company (₹)", type: "number", required: true, group: "Pay and terms", min: 1 },
    { name: "probation_months", label: "Probation (months)", type: "number", required: true, group: "Pay and terms", defaultValue: "6", min: 0, max: 12 },
    { name: "notice_probation", label: "Notice during probation", type: "text", required: true, group: "Pay and terms", defaultValue: "15 days" },
    { name: "notice_confirmed", label: "Notice after confirmation", type: "text", required: true, group: "Pay and terms", defaultValue: "one month" },
    { name: "accept_by", label: "Accept by", type: "date", required: true, group: "Pay and terms" },
    { name: "date", label: "Letter date", type: "date", required: true, group: "Pay and terms", defaultToday: true },
  ],
  bodyEn: `**{{company_name}}**
{{company_address}}

Date: {{date}}

To,
{{candidate_name}}
{{candidate_address}}

## LETTER OF APPOINTMENT

Dear {{candidate_name}},

We are pleased to offer you employment with {{company_name}} (the "Company") on the following terms and conditions:

1. **Position.** You are appointed as {{designation}}, reporting to {{reporting_to}}, or such other person as the Company may designate.

2. **Date of joining.** You will join on or before {{joining_date|long}}. This offer will lapse if you do not join by that date, unless the Company extends it in writing.

3. **Place of work.** Your place of work will be {{work_location}}. The Company may transfer you to any of its offices or assign you to work at client locations as business requires.

4. **Remuneration.** Your total annual cost to the Company will be ₹{{ctc_annual|inr}}/- (Rupees {{ctc_annual|words}} only), with the break-up set out in Annexure A. Remuneration is subject to deduction of tax at source and statutory contributions as applicable.

5. **Probation.** You will be on probation for {{probation_months}} months from your date of joining, which the Company may extend. Your appointment will be confirmed in writing on satisfactory completion of probation.

6. **Termination.** During probation, either party may terminate this employment by giving {{notice_probation}} written notice or pay in lieu of notice. After confirmation, either party may terminate it by giving {{notice_confirmed}} written notice or pay in lieu of notice. The Company may terminate your employment without notice for misconduct, after following the procedure required by law and its policies.

7. **Working hours and leave.** Your working hours, holidays and leave will be as per the Company's policies and applicable law, as amended from time to time.

8. **Confidentiality.** You shall keep confidential all non-public information of the Company and its clients that you receive during your employment, both during and after your employment, and use it only for the Company's work.

9. **Intellectual property.** All work product, inventions and materials you create in the course of your employment shall belong to the Company, and you shall sign any documents reasonably required to record this.

10. **Company policies.** You shall comply with the Company's policies, codes of conduct and lawful instructions, as amended from time to time.

11. **Documents.** This offer is subject to verification of your educational and employment records and the documents you have submitted. Any false information may lead to withdrawal of this offer or termination of employment.

12. **Governing law.** This letter is governed by the laws of India.

Please sign and return a copy of this letter by {{accept_by|long}} to confirm your acceptance.

We look forward to welcoming you.

For {{company_name}}

____________________
{{signatory_name}}
{{signatory_designation}}

### ACCEPTANCE

I have read and understood the terms of this letter and accept the appointment.

Signature: ____________________
Name: {{candidate_name}}
Date: ____________________`,
  bodyHi: null,
  lawRefs: ["Indian Contract Act, 1872", "Applicable labour laws and State Shops and Establishments legislation"],
  esignAllowed: true,
  checks: [
    "Attach the salary break-up as Annexure A and check it against current wage, provident fund, ESI and gratuity rules.",
    "Check notice and termination terms against the labour law that applies to the employee's category and State.",
    "Keep restraints after employment ends narrow; post-employment non-compete clauses are generally unenforceable in India.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const divorce13B: DraftTemplate = {
  slug: "mutual-consent-divorce-petition-hma-13b",
  title: "Mutual consent divorce petition (Hindu Marriage Act s.13B)",
  titleHi: "पारस्परिक सहमति से विवाह-विच्छेद याचिका (हिन्दू विवाह अधिनियम धारा 13-ख)",
  category: "Family",
  summary:
    "Joint petition by husband and wife for a decree of divorce by mutual consent under Section 13B of the Hindu Marriage Act, 1955, with settlement terms and verification.",
  useWhen: "Filed jointly before the Family Court or District Court when both spouses agree to divorce and have lived separately for a year or more.",
  fields: [
    {
      name: "court_heading",
      label: "Court heading",
      type: "text",
      required: true,
      group: "Court",
      placeholder: "e.g. IN THE COURT OF THE PRINCIPAL JUDGE, FAMILY COURT, LUCKNOW",
    },
    { name: "petition_number", label: "Petition number (if allotted)", type: "text", group: "Court", fallback: "______ of ______", fallbackHi: "______ सन् ______" },
    { name: "husband_name", label: "Husband's name", type: "text", required: true, group: "Husband" },
    { name: "husband_parentage", label: "Husband's parentage", type: "text", required: true, group: "Husband", placeholder: "e.g. S/o Ram Narayan" },
    { name: "husband_age", label: "Husband's age", type: "number", required: true, group: "Husband", min: 18, max: 120 },
    { name: "husband_occupation", label: "Husband's occupation", type: "text", required: true, group: "Husband" },
    { name: "husband_address", label: "Husband's address", type: "text", required: true, group: "Husband" },
    { name: "wife_name", label: "Wife's name", type: "text", required: true, group: "Wife" },
    { name: "wife_parentage", label: "Wife's parentage", type: "text", required: true, group: "Wife", placeholder: "e.g. D/o Shyam Lal" },
    { name: "wife_age", label: "Wife's age", type: "number", required: true, group: "Wife", min: 18, max: 120 },
    { name: "wife_occupation", label: "Wife's occupation", type: "text", required: true, group: "Wife" },
    { name: "wife_address", label: "Wife's address", type: "text", required: true, group: "Wife" },
    { name: "marriage_date", label: "Date of marriage", type: "date", required: true, group: "Marriage" },
    { name: "marriage_place", label: "Place of marriage", type: "text", required: true, group: "Marriage" },
    {
      name: "marriage_ceremony",
      label: "Ceremony",
      type: "select",
      required: true,
      group: "Marriage",
      options: [
        { value: "hindu", label: "Hindu rites and ceremonies", hi: "हिन्दू रीति-रिवाज" },
        { value: "vedic", label: "Vedic rites (Arya Samaj)", hi: "वैदिक रीति (आर्य समाज)" },
        { value: "sikh", label: "Sikh rites (Anand Karaj)", hi: "सिख रीति (आनंद कारज)" },
      ],
    },
    { name: "last_resided_together", label: "Where the parties last lived together", type: "text", required: true, group: "Marriage" },
    { name: "separation_date", label: "Living separately since", type: "date", required: true, group: "Marriage", help: "Section 13B needs at least one year of separation before filing." },
    {
      name: "jurisdiction_basis",
      label: "Why this court has jurisdiction",
      type: "select",
      required: true,
      group: "Marriage",
      options: [
        {
          value: "solemnized",
          label: "the marriage was solemnized within the local limits of the jurisdiction of this Hon'ble Court",
          hi: "विवाह इस माननीय न्यायालय की स्थानीय अधिकारिता की सीमाओं के भीतर संपन्न हुआ था",
        },
        {
          value: "last_resided",
          label: "the parties last resided together within the local limits of the jurisdiction of this Hon'ble Court",
          hi: "पक्षकार अंतिम बार इस माननीय न्यायालय की स्थानीय अधिकारिता की सीमाओं के भीतर एक साथ निवास करते थे",
        },
        {
          value: "wife_resides",
          label: "Petitioner No. 2 (the wife) is residing within the local limits of the jurisdiction of this Hon'ble Court",
          hi: "याची संख्या 2 (पत्नी) इस माननीय न्यायालय की स्थानीय अधिकारिता की सीमाओं के भीतर निवास कर रही है",
        },
      ],
    },
    {
      name: "children",
      label: "Children and custody arrangement",
      type: "textarea",
      required: true,
      group: "Settlement",
      help: "Write 'No child was born from the wedlock.' if there are none.",
    },
    {
      name: "settlement",
      label: "Settlement terms",
      type: "textarea",
      required: true,
      group: "Settlement",
      help: "Permanent alimony and how it will be paid, return of stridhan and articles, maintenance, and withdrawal of other cases.",
    },
    { name: "advocate_name", label: "Advocate's name", type: "text", required: true, group: "Signature" },
    ...placeDate("Signature"),
  ],
  bodyEn: `# {{court_heading|upper}}

^^ HMA Petition No. {{petition_number}}

^^ IN THE MATTER OF:

{{husband_name}}
{{husband_parentage}}, aged about {{husband_age}} years, {{husband_occupation}}
R/o {{husband_address}}
>> ...Petitioner No. 1 (Husband)

## AND

{{wife_name}}
{{wife_parentage}}, aged about {{wife_age}} years, {{wife_occupation}}
R/o {{wife_address}}
>> ...Petitioner No. 2 (Wife)

## JOINT PETITION UNDER SECTION 13B OF THE HINDU MARRIAGE ACT, 1955 FOR DISSOLUTION OF MARRIAGE BY A DECREE OF DIVORCE BY MUTUAL CONSENT

MOST RESPECTFULLY SHOWETH:

1. That the marriage between Petitioner No. 1 and Petitioner No. 2 was solemnized on {{marriage_date}} at {{marriage_place}} according to {{marriage_ceremony}}. Both petitioners are Hindus and are governed by the Hindu Marriage Act, 1955.

2. That the parties last resided together at {{last_resided_together}}.

3. That the details of the children born from the wedlock, and the arrangement agreed between the parties for their custody, are as follows:
{{children}}

4. That owing to differences in temperament and incompatibility, the petitioners could not live together as husband and wife. The petitioners have been living separately since {{separation_date}}, that is, for a period of more than one year before the presentation of this petition, and have not cohabited since then.

5. That the petitioners have not been able to live together and have mutually agreed that their marriage should be dissolved.

6. That the petitioners have arrived at a full and final settlement on the following terms:
{{settlement}}

7. That the mutual consent of the petitioners has not been obtained by force, fraud or undue influence.

8. That there is no collusion between the petitioners in filing this petition.

9. That there has been no unnecessary or improper delay in filing this petition.

10. That no other petition between the parties for the same relief is pending before any court.

11. That this Hon'ble Court has jurisdiction to try and entertain this petition under Section 19 of the Hindu Marriage Act, 1955, as {{jurisdiction_basis}}.

12. That the requisite court fee has been affixed on this petition.

## PRAYER

It is, therefore, most respectfully prayed that this Hon'ble Court may be pleased to pass a decree of divorce by mutual consent under Section 13B of the Hindu Marriage Act, 1955, dissolving the marriage solemnized between Petitioner No. 1 and Petitioner No. 2 on {{marriage_date}}, and to pass any other order which this Hon'ble Court may deem fit and proper in the facts and circumstances of the case.

Place: {{place}}
Date: {{date}}

>> Petitioner No. 1 (Husband)
>> {{husband_name}}

>> Petitioner No. 2 (Wife)
>> {{wife_name}}

>> Through Counsel
>> {{advocate_name}}, Advocate

## VERIFICATION

We, the above-named petitioners, do hereby verify that the contents of paragraphs 1 to 12 of this petition are true and correct to our knowledge and belief, and that nothing material has been concealed therefrom.

Verified at {{place}} on {{date|long}}.

>> Petitioner No. 1 (Husband)

>> Petitioner No. 2 (Wife)`,
  bodyHi: `# {{court_heading}}

^^ हिन्दू विवाह अधिनियम याचिका संख्या {{petition_number}}

^^ मामला:

{{husband_name}}
{{husband_parentage}}, आयु लगभग {{husband_age}} वर्ष, व्यवसाय {{husband_occupation}}
निवासी {{husband_address}}
>> ...याची संख्या 1 (पति)

## एवं

{{wife_name}}
{{wife_parentage}}, आयु लगभग {{wife_age}} वर्ष, व्यवसाय {{wife_occupation}}
निवासी {{wife_address}}
>> ...याची संख्या 2 (पत्नी)

## हिन्दू विवाह अधिनियम, 1955 की धारा 13-ख के अंतर्गत पारस्परिक सहमति से विवाह-विच्छेद की डिक्री हेतु संयुक्त याचिका

सविनय निवेदन है कि:

1. यह कि याची संख्या 1 एवं याची संख्या 2 का विवाह दिनांक {{marriage_date}} को {{marriage_place}} में {{marriage_ceremony}} के अनुसार संपन्न हुआ था। दोनों याचीगण हिन्दू हैं तथा हिन्दू विवाह अधिनियम, 1955 द्वारा शासित हैं।

2. यह कि दोनों पक्षकार अंतिम बार {{last_resided_together}} में एक साथ निवास करते थे।

3. यह कि विवाह से उत्पन्न संतान का विवरण तथा उनकी अभिरक्षा के संबंध में पक्षकारों के बीच सहमत व्यवस्था इस प्रकार है:
{{children}}

4. यह कि स्वभावगत मतभेदों एवं असंगति के कारण याचीगण पति-पत्नी के रूप में साथ नहीं रह सके। याचीगण दिनांक {{separation_date}} से, अर्थात् इस याचिका के प्रस्तुत किए जाने से एक वर्ष से अधिक समय से, अलग-अलग रह रहे हैं तथा तब से उनके बीच कोई सहवास नहीं हुआ है।

5. यह कि याचीगण एक साथ रहने में असमर्थ रहे हैं तथा उन्होंने पारस्परिक रूप से सहमति व्यक्त की है कि उनके विवाह का विघटन कर दिया जाए।

6. यह कि याचीगण के बीच निम्नलिखित शर्तों पर पूर्ण एवं अंतिम समझौता हो गया है:
{{settlement}}

7. यह कि याचीगण की पारस्परिक सहमति बल, कपट अथवा असम्यक् असर द्वारा प्राप्त नहीं की गई है।

8. यह कि इस याचिका को प्रस्तुत करने में याचीगण के बीच कोई दुस्संधि नहीं है।

9. यह कि इस याचिका को प्रस्तुत करने में कोई अनावश्यक अथवा अनुचित विलंब नहीं हुआ है।

10. यह कि पक्षकारों के बीच इसी अनुतोष हेतु कोई अन्य याचिका किसी न्यायालय में लंबित नहीं है।

11. यह कि इस माननीय न्यायालय को हिन्दू विवाह अधिनियम, 1955 की धारा 19 के अंतर्गत इस याचिका की सुनवाई का क्षेत्राधिकार प्राप्त है, क्योंकि {{jurisdiction_basis}}।

12. यह कि इस याचिका पर अपेक्षित न्यायालय शुल्क अदा कर दिया गया है।

## प्रार्थना

अतः माननीय न्यायालय से सविनय प्रार्थना है कि हिन्दू विवाह अधिनियम, 1955 की धारा 13-ख के अंतर्गत पारस्परिक सहमति से विवाह-विच्छेद की डिक्री पारित कर याची संख्या 1 एवं याची संख्या 2 के बीच दिनांक {{marriage_date}} को संपन्न विवाह का विघटन करने की कृपा करें, तथा अन्य कोई आदेश जो माननीय न्यायालय मामले के तथ्यों एवं परिस्थितियों में उचित समझे, पारित करने की कृपा करें।

स्थान: {{place}}
दिनांक: {{date}}

>> याची संख्या 1 (पति)
>> {{husband_name}}

>> याची संख्या 2 (पत्नी)
>> {{wife_name}}

>> द्वारा अधिवक्ता
>> {{advocate_name}}

## सत्यापन

हम, उपरोक्त याचीगण, सत्यापित करते हैं कि इस याचिका के प्रस्तर 1 से 12 के कथन हमारी जानकारी एवं विश्वास के अनुसार सत्य एवं सही हैं तथा इसमें कोई तात्विक तथ्य छिपाया नहीं गया है।

दिनांक {{date|long}} को {{place}} में सत्यापित किया।

>> याची संख्या 1 (पति)

>> याची संख्या 2 (पत्नी)`,
  lawRefs: ["Hindu Marriage Act, 1955, s.13B", "Hindu Marriage Act, 1955, s.19", "Family Courts Act, 1984"],
  esignAllowed: true,
  checks: [
    "Both spouses usually file supporting affidavits and appear in person for the first motion.",
    "The second motion under s.13B(2) is moved after six months and within eighteen months of presentation; a request to waive the waiting period needs separate grounds.",
    "Keep marriage proof, address proof, photographs and the signed settlement ready as your Family Court requires.",
    "Section 13B applies to Hindus, Buddhists, Jains and Sikhs; use the Special Marriage Act, 1954 or the relevant personal law for others.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const consumerComplaint: DraftTemplate = {
  slug: "consumer-complaint-district-commission",
  title: "Consumer complaint before the District Commission",
  titleHi: "जिला उपभोक्ता आयोग के समक्ष उपभोक्ता शिकायत",
  category: "Consumer",
  summary:
    "Complaint under Section 35 of the Consumer Protection Act, 2019, for defective goods, deficient service or an unfair trade practice, with reliefs, jurisdiction and verification.",
  useWhen: "Filed by a consumer within two years of the cause of action, when the seller or service provider has not resolved the grievance.",
  fields: [
    { name: "district_name", label: "District", type: "text", required: true, group: "Commission" },
    { name: "complaint_number", label: "Complaint number (if allotted)", type: "text", group: "Commission", fallback: "______ of ______" },
    {
      name: "territorial_basis",
      label: "Why this Commission has territorial jurisdiction",
      type: "select",
      required: true,
      group: "Commission",
      options: [
        { value: "complainant", label: "the complainant resides or personally works for gain within its local limits" },
        { value: "op", label: "the opposite party carries on business or has a branch office within its local limits" },
        { value: "cause", label: "the cause of action, wholly or in part, arose within its local limits" },
      ],
    },
    { name: "complainant_name", label: "Complainant's name", type: "text", required: true, group: "Complainant" },
    { name: "complainant_parentage", label: "Complainant's parentage", type: "text", required: true, group: "Complainant" },
    { name: "complainant_address", label: "Complainant's address", type: "text", required: true, group: "Complainant" },
    { name: "complainant_phone", label: "Phone", type: "text", group: "Complainant", fallback: "______" },
    { name: "complainant_email", label: "Email", type: "text", group: "Complainant", fallback: "______" },
    { name: "op_name", label: "Opposite party (seller or service provider)", type: "text", required: true, group: "Opposite party" },
    { name: "op_description", label: "Opposite party's description", type: "text", required: true, group: "Opposite party", placeholder: "e.g. a company engaged in the sale of electronic goods" },
    { name: "op_address", label: "Opposite party's address", type: "text", required: true, group: "Opposite party" },
    { name: "goods_or_service", label: "Goods or service", type: "text", required: true, group: "Purchase", placeholder: "e.g. a refrigerator, model XYZ" },
    { name: "purchase_date", label: "Date of purchase or booking", type: "date", required: true, group: "Purchase" },
    { name: "amount_paid", label: "Amount paid (₹)", type: "number", required: true, group: "Purchase", min: 0 },
    { name: "invoice_details", label: "Invoice, order or receipt details", type: "text", required: true, group: "Purchase", placeholder: "e.g. invoice no. 4521 dated 02.05.2026" },
    {
      name: "complaint_type",
      label: "Nature of grievance",
      type: "select",
      required: true,
      group: "Grievance",
      options: [
        { value: "defect", label: "a defect in the goods" },
        { value: "deficiency", label: "deficiency in service" },
        { value: "both", label: "a defect in the goods and deficiency in service" },
        { value: "utp", label: "an unfair trade practice" },
      ],
    },
    { name: "facts", label: "What went wrong (chronology)", type: "textarea", required: true, group: "Grievance" },
    { name: "efforts", label: "Complaints made and the response", type: "textarea", required: true, group: "Grievance" },
    { name: "cause_of_action_date", label: "Date the cause of action arose", type: "date", required: true, group: "Grievance" },
    { name: "refund_amount", label: "Refund or value claimed (₹)", type: "number", required: true, group: "Reliefs", min: 0 },
    { name: "compensation", label: "Compensation for loss and harassment (₹)", type: "number", required: true, group: "Reliefs", min: 0 },
    { name: "litigation_cost", label: "Litigation costs (₹)", type: "number", required: true, group: "Reliefs", min: 0 },
    ...placeDate("Reliefs"),
  ],
  bodyEn: `# BEFORE THE DISTRICT CONSUMER DISPUTES REDRESSAL COMMISSION, {{district_name|upper}}

^^ Consumer Complaint No. {{complaint_number}}

^^ IN THE MATTER OF:

{{complainant_name}}
{{complainant_parentage}}
R/o {{complainant_address}}
Phone: {{complainant_phone}}; Email: {{complainant_email}}
>> ...Complainant

## VERSUS

{{op_name}}
{{op_description}}
Address: {{op_address}}
>> ...Opposite Party

## COMPLAINT UNDER SECTION 35 OF THE CONSUMER PROTECTION ACT, 2019

MOST RESPECTFULLY SHOWETH:

1. That the complainant is a consumer within the meaning of the Consumer Protection Act, 2019 (the "Act"), having bought or availed {{goods_or_service}} from the opposite party for consideration, and not for any commercial purpose.

2. That on {{purchase_date}}, the complainant bought or availed {{goods_or_service}} from the opposite party for a total consideration of ₹{{amount_paid|inr}}/- (Rupees {{amount_paid|words}} only), vide {{invoice_details}}.

3. That the facts giving rise to this complaint are as follows:
{{facts}}

4. That the complainant approached the opposite party for redressal as follows, but the grievance was not resolved:
{{efforts}}

5. That the above acts and omissions of the opposite party amount to {{complaint_type}} within the meaning of the Act, for which the opposite party is liable to the complainant.

6. That the cause of action arose on {{cause_of_action_date}}. This complaint is filed within two years of the date on which the cause of action arose, as required by Section 69 of the Act.

7. That this Hon'ble Commission has territorial jurisdiction under Section 34 of the Act, as {{territorial_basis}}, and has pecuniary jurisdiction, as the value of the goods or services paid as consideration is within the limit prescribed for this Commission.

8. That the complainant has not filed any other complaint on the same cause of action before any other commission, forum or court.

9. That the fee prescribed for this complaint, if any, has been paid.

## PRAYER

It is, therefore, most respectfully prayed that this Hon'ble Commission may be pleased to direct the opposite party to:

(a) refund or pay to the complainant ₹{{refund_amount|inr}}/-, or replace the goods or re-perform the service, with such interest as this Hon'ble Commission deems fit;
(b) pay ₹{{compensation|inr}}/- as compensation for the loss, mental agony and harassment caused to the complainant;
(c) pay ₹{{litigation_cost|inr}}/- towards the cost of litigation; and
(d) pass any other order which this Hon'ble Commission may deem fit and proper in the interest of justice.

Place: {{place}}
Date: {{date}}

>> Complainant
>> {{complainant_name}}

## VERIFICATION

I, {{complainant_name}}, the complainant above-named, do hereby verify that the contents of paragraphs 1 to 9 of this complaint are true and correct to my knowledge and belief, and that nothing material has been concealed therefrom.

Verified at {{place}} on {{date|long}}.

>> Complainant`,
  bodyHi: null,
  lawRefs: ["Consumer Protection Act, 2019, s.34", "Consumer Protection Act, 2019, s.35", "Consumer Protection Act, 2019, s.69"],
  esignAllowed: true,
  checks: [
    "Confirm the District Commission's current pecuniary limit; it is set by rules and has been revised.",
    "File through the consumer commissions' online e-filing portal or physically, with a supporting affidavit, copies of the invoice and correspondence, and the fee prescribed for the claim value.",
    "Add each opposite party (manufacturer, dealer, service centre) separately where liability is shared.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const rti: DraftTemplate = {
  slug: "rti-application",
  title: "RTI application (RTI Act s.6)",
  titleHi: "सूचना का अधिकार आवेदन (आरटीआई अधिनियम धारा 6)",
  category: "RTI",
  summary:
    "Application to a Public Information Officer under Section 6(1) of the Right to Information Act, 2005, with the information sought, form of supply and fee details.",
  useWhen: "Filed by any citizen to obtain records or information held by a public authority.",
  fields: [
    { name: "pio_department", label: "Public authority (office or department)", type: "text", required: true, group: "Public authority" },
    { name: "pio_address", label: "Office address", type: "textarea", required: true, group: "Public authority" },
    { name: "applicant_name", label: "Applicant's name", type: "text", required: true, group: "Applicant" },
    { name: "applicant_address", label: "Address for correspondence", type: "textarea", required: true, group: "Applicant" },
    { name: "applicant_phone", label: "Phone", type: "text", group: "Applicant", fallback: "______" },
    { name: "applicant_email", label: "Email", type: "text", group: "Applicant", fallback: "______" },
    {
      name: "information_sought",
      label: "Information required",
      type: "textarea",
      required: true,
      group: "Information",
      help: "One point per line. Ask for specific records (copies, file notings, dates, amounts), not opinions or reasons.",
    },
    { name: "period", label: "Period the information relates to", type: "text", group: "Information", fallback: "As applicable", fallbackHi: "यथा लागू" },
    {
      name: "mode",
      label: "Form of information",
      type: "select",
      required: true,
      group: "Information",
      options: [
        { value: "copies", label: "certified photocopies", hi: "प्रमाणित छायाप्रतियाँ" },
        { value: "electronic", label: "an electronic copy (email or CD)", hi: "इलेक्ट्रॉनिक प्रति (ईमेल अथवा सीडी)" },
        {
          value: "inspection",
          label: "inspection of the records, followed by copies of the documents I select",
          hi: "अभिलेखों का निरीक्षण, तत्पश्चात् मेरे द्वारा चयनित दस्तावेजों की प्रतियाँ",
        },
      ],
    },
    {
      name: "fee_mode",
      label: "Application fee",
      type: "select",
      required: true,
      group: "Fee",
      options: [
        { value: "ipo", label: "paid by Indian Postal Order", hi: "भारतीय पोस्टल ऑर्डर द्वारा भुगतान किया गया" },
        { value: "dd", label: "paid by Demand Draft", hi: "डिमांड ड्राफ्ट द्वारा भुगतान किया गया" },
        { value: "court_fee", label: "paid by court fee stamp", hi: "न्यायालय शुल्क टिकट द्वारा भुगतान किया गया" },
        { value: "cash", label: "paid in cash against receipt", hi: "रसीद के विरुद्ध नकद भुगतान किया गया" },
        {
          value: "bpl",
          label: "not payable, as the applicant belongs to the Below Poverty Line category (copy of BPL card enclosed)",
          hi: "देय नहीं, क्योंकि आवेदक गरीबी रेखा से नीचे की श्रेणी में आता है (बीपीएल कार्ड की प्रति संलग्न)",
        },
      ],
    },
    { name: "fee_details", label: "Postal order, DD or receipt number", type: "text", group: "Fee", fallback: "______" },
    ...placeDate("Fee"),
  ],
  bodyEn: `To,
The Public Information Officer
{{pio_department}}
{{pio_address}}

## APPLICATION FOR INFORMATION UNDER SECTION 6(1) OF THE RIGHT TO INFORMATION ACT, 2005

1. Name of the applicant: {{applicant_name}}

2. Address for correspondence:
{{applicant_address}}

3. Phone / Email: {{applicant_phone}} / {{applicant_email}}

4. Particulars of the information required:
{{information_sought}}

5. Period to which the information relates: {{period}}

6. Form in which the information is required: {{mode}}

7. Application fee: {{fee_mode}}. Reference no.: {{fee_details}}.

8. I state that I am a citizen of India. To the best of my knowledge, the information sought does not fall within the exemptions in Sections 8 and 9 of the Act. Under Section 6(2) of the Act, I am not required to give reasons for requesting this information.

9. If the information, or any part of it, is held by or more closely connected with the functions of another public authority, kindly transfer this application or the relevant part of it to that public authority under Section 6(3) of the Act and inform me accordingly.

Place: {{place}}
Date: {{date}}

>> {{applicant_name}}
>> Applicant`,
  bodyHi: `सेवा में,
लोक सूचना अधिकारी
{{pio_department}}
{{pio_address}}

## सूचना का अधिकार अधिनियम, 2005 की धारा 6(1) के अंतर्गत सूचना हेतु आवेदन

1. आवेदक का नाम: {{applicant_name}}

2. पत्राचार का पता:
{{applicant_address}}

3. फ़ोन / ईमेल: {{applicant_phone}} / {{applicant_email}}

4. वांछित सूचना का विवरण:
{{information_sought}}

5. सूचना से संबंधित अवधि: {{period}}

6. सूचना किस रूप में चाहिए: {{mode}}

7. आवेदन शुल्क: {{fee_mode}}। संदर्भ संख्या: {{fee_details}}।

8. मैं भारत का नागरिक हूँ। मेरी जानकारी के अनुसार वांछित सूचना अधिनियम की धारा 8 एवं 9 के अंतर्गत छूट की श्रेणी में नहीं आती है। अधिनियम की धारा 6(2) के अनुसार मुझे सूचना माँगने का कारण बताना आवश्यक नहीं है।

9. यदि वांछित सूचना अथवा उसका कोई भाग किसी अन्य लोक प्राधिकारी के पास है अथवा उसके कार्यों से अधिक निकटता से संबंधित है, तो कृपया अधिनियम की धारा 6(3) के अंतर्गत इस आवेदन अथवा उसके संबंधित भाग को उस लोक प्राधिकारी को अंतरित कर मुझे सूचित करें।

स्थान: {{place}}
दिनांक: {{date}}

>> {{applicant_name}}
>> आवेदक`,
  lawRefs: ["Right to Information Act, 2005, s.6", "Right to Information Act, 2005, s.7"],
  esignAllowed: true,
  checks: [
    "Check the fee and payment modes under the RTI rules of the Central or State Government concerned; for Central public authorities you can also file online at rtionline.gov.in.",
    "The PIO must reply within thirty days (forty-eight hours where life or liberty is involved).",
    "If there is no reply or you are not satisfied, a first appeal lies to the First Appellate Authority under Section 19.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const poa: DraftTemplate = {
  slug: "general-power-of-attorney",
  title: "General power of attorney",
  titleHi: "सामान्य मुख्तारनामा (जनरल पावर ऑफ अटॉर्नी)",
  category: "Wills & POA",
  summary:
    "General power of attorney appointing an attorney to manage specified affairs, deal with authorities, sign documents and conduct cases, with a ratification clause.",
  useWhen: "Executed by a person who cannot attend to their affairs personally, for example while living abroad.",
  fields: [
    { name: "principal_name", label: "Principal's name (giving the power)", type: "text", required: true, group: "Principal" },
    { name: "principal_parentage", label: "Principal's parentage", type: "text", required: true, group: "Principal" },
    { name: "principal_age", label: "Principal's age", type: "number", required: true, group: "Principal", min: 18, max: 120 },
    { name: "principal_address", label: "Principal's address", type: "text", required: true, group: "Principal" },
    { name: "attorney_name", label: "Attorney's name (receiving the power)", type: "text", required: true, group: "Attorney" },
    { name: "attorney_parentage", label: "Attorney's parentage", type: "text", required: true, group: "Attorney" },
    { name: "attorney_address", label: "Attorney's address", type: "text", required: true, group: "Attorney" },
    {
      name: "purpose",
      label: "Matters the attorney may handle",
      type: "textarea",
      required: true,
      group: "Powers",
      help: "Be specific: e.g. managing my property at ...; operating my savings account no. ... with ... Bank; dealing with the municipal corporation.",
    },
    {
      name: "property_details",
      label: "Property covered (optional)",
      type: "textarea",
      group: "Powers",
      fallback: "Not applicable.",
    },
    { name: "duration", label: "Valid until (optional)", type: "text", group: "Powers", fallback: "until revoked by me in writing" },
    { name: "place", label: "Place of execution", type: "text", required: true, group: "Execution" },
    { name: "date", label: "Date of execution", type: "date", required: true, group: "Execution", defaultToday: true },
  ],
  bodyEn: `# GENERAL POWER OF ATTORNEY

TO ALL TO WHOM THESE PRESENTS SHALL COME, I, {{principal_name}}, {{principal_parentage}}, aged about {{principal_age}} years, residing at {{principal_address}} (hereinafter "the Principal"), SEND GREETINGS.

WHEREAS I am unable to attend personally to the matters described below, and wish to appoint a fit person to act on my behalf;

NOW KNOW YE AND THESE PRESENTS WITNESS that I hereby appoint {{attorney_name}}, {{attorney_parentage}}, residing at {{attorney_address}} (hereinafter "the Attorney"), as my true and lawful attorney, to do the following acts, deeds and things in my name and on my behalf, in relation to the following matters:
{{purpose}}

Property covered by this power of attorney, if any:
{{property_details}}

1. To manage and look after the said matters and property, and to pay all taxes, charges and dues in respect of them.

2. To appear and represent me before any government, municipal, revenue, tax or other authority, office, bank or company, and to make, sign and submit applications, declarations, forms, affidavits and other documents in that connection.

3. To receive payments due to me in respect of the said matters, and to issue valid receipts and discharges for them.

4. To commence, prosecute, defend, compromise or withdraw any suit, appeal, complaint or other legal proceeding in respect of the said matters, to sign and verify pleadings and applications, and to engage advocates and sign vakalatnamas for that purpose.

5. To do all other lawful acts, deeds and things which are necessary or incidental to the matters described above, as fully and effectually as I could do if personally present.

6. This power of attorney does not authorise the sale, gift, mortgage, lease or other transfer of any immovable property, unless such power is expressly stated above and this instrument is stamped and registered as required by law.

7. This power of attorney shall remain in force {{duration}}.

AND I hereby agree to ratify and confirm all lawful acts, deeds and things done by the Attorney under the authority of this power of attorney.

IN WITNESS WHEREOF I have signed this power of attorney at {{place}} on {{date|long}}.

>> PRINCIPAL
>> {{principal_name}}

I accept this appointment.

>> ATTORNEY
>> {{attorney_name}}

### WITNESSES

1. Name and address: ____________________
Signature: ____________________

2. Name and address: ____________________
Signature: ____________________`,
  bodyHi: null,
  lawRefs: ["Powers of Attorney Act, 1882", "Registration Act, 1908", "Information Technology Act, 2000, First Schedule"],
  esignAllowed: false,
  esignNote:
    "The First Schedule of the Information Technology Act, 2000 excludes powers of attorney from electronic signature. Print it, sign in ink before witnesses, and notarise or register it as required.",
  checks: [
    "Pay stamp duty under your State's Stamp Act; the rate differs for general powers and for powers relating to property.",
    "A power to sell or transfer immovable property generally needs registration; many States require it.",
    "If executed abroad, have it notarised and apostilled or consularised, then stamped in India within the time allowed.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

const will: DraftTemplate = {
  slug: "simple-will",
  title: "Simple will",
  titleHi: "साधारण वसीयत",
  category: "Wills & POA",
  summary:
    "A simple will with revocation of earlier wills, family details, executor, specific bequests, residuary clause and attestation by two witnesses.",
  useWhen: "Made by an adult of sound mind to decide how their property passes after death.",
  fields: [
    { name: "testator_name", label: "Your name (testator)", type: "text", required: true, group: "Testator" },
    { name: "testator_parentage", label: "Parentage", type: "text", required: true, group: "Testator" },
    { name: "testator_age", label: "Age", type: "number", required: true, group: "Testator", min: 18, max: 120 },
    { name: "testator_address", label: "Address", type: "text", required: true, group: "Testator" },
    {
      name: "family_details",
      label: "Family members",
      type: "textarea",
      required: true,
      group: "Family",
      help: "Name, relationship and age of each family member, one per line.",
    },
    {
      name: "assets_bequests",
      label: "Assets and who receives each",
      type: "textarea",
      required: true,
      group: "Bequests",
      help: "Describe each asset precisely (property address, account or folio numbers) and name the beneficiary and share.",
    },
    { name: "residuary_beneficiary", label: "Who receives everything else", type: "text", required: true, group: "Bequests" },
    { name: "executor_name", label: "Executor's name", type: "text", required: true, group: "Executor" },
    { name: "executor_address", label: "Executor's address", type: "text", required: true, group: "Executor" },
    { name: "place", label: "Place", type: "text", required: true, group: "Executor" },
    { name: "date", label: "Date", type: "date", required: true, group: "Executor", defaultToday: true },
  ],
  bodyEn: `# LAST WILL AND TESTAMENT

I, {{testator_name}}, {{testator_parentage}}, aged about {{testator_age}} years, residing at {{testator_address}}, being of sound mind and disposing memory, and not acting under any coercion, undue influence or fraud, do hereby make, publish and declare this to be my last Will and Testament, made at {{place}} on {{date|long}}.

1. **Revocation.** I revoke all my previous wills, codicils and testamentary dispositions, if any, made at any time before this Will.

2. **My family.** The members of my family are:
{{family_details}}

3. **Executor.** I appoint {{executor_name}}, residing at {{executor_address}}, as the executor of this Will. The executor shall pay my debts, funeral expenses and the expenses of administering my estate out of my estate before distributing it.

4. **Bequests.** I bequeath my properties and assets as follows:
{{assets_bequests}}

5. **Residue.** All the rest and residue of my estate, movable or immovable, which is not otherwise disposed of by this Will, including any property I acquire after the date of this Will, shall go to {{residuary_beneficiary}}.

6. **Lapse.** If any beneficiary named in this Will dies before me, the bequest to that beneficiary shall, unless stated otherwise above, form part of the residue of my estate.

7. **Declaration.** I declare that I have made this Will of my own free will, after understanding its contents, while of sound mind.

IN WITNESS WHEREOF I have signed this Will at {{place}} on {{date|long}} in the presence of the witnesses named below, who have signed in my presence.

>> TESTATOR
>> {{testator_name}}

### ATTESTATION

We, the undersigned, declare that the testator signed this Will in our presence, and that each of us has signed it as an attesting witness in the presence of the testator.

1. Name: ____________________
Address: ____________________
Signature: ____________________

2. Name: ____________________
Address: ____________________
Signature: ____________________`,
  bodyHi: null,
  lawRefs: ["Indian Succession Act, 1925, s.63", "Indian Succession Act, 1925, s.67", "Information Technology Act, 2000, First Schedule"],
  esignAllowed: false,
  esignNote:
    "The First Schedule of the Information Technology Act, 2000 excludes wills from electronic signature. Sign in ink before two attesting witnesses.",
  checks: [
    "Sign before at least two witnesses, each of whom sees the testator sign and signs in the testator's presence (Indian Succession Act, 1925 s.63).",
    "A beneficiary, or a beneficiary's spouse, should not be an attesting witness: a bequest to an attesting witness is void (s.67).",
    "Registration is optional but recommended; no stamp duty is payable on a will.",
    "Not suitable for Muslim testators: wills are governed by Muslim personal law, which generally limits bequests to one-third of the estate without the heirs' consent.",
  ],
  reviewedBy: null,
  reviewedAt: null,
};

export const templateCatalog: DraftTemplate[] = [
  chequeBounce,
  replyToNotice,
  moneyRecovery,
  bailMagistrate,
  bailSessions,
  anticipatoryBail,
  divorce13B,
  consumerComplaint,
  leaveLicence,
  nda,
  appointmentLetter,
  affidavit,
  rti,
  poa,
  will,
];

const bySlug = new Map(templateCatalog.map((t) => [t.slug, t]));

export function getTemplate(slug: string | null | undefined): DraftTemplate | undefined {
  return slug ? bySlug.get(slug) : undefined;
}

/** The template body for a language, falling back to English. */
export function templateBody(t: DraftTemplate, lang: "en" | "hi"): string {
  return lang === "hi" && t.bodyHi ? t.bodyHi : t.bodyEn;
}
