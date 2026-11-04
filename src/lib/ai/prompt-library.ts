// Built-in prompt library (read-only for users; they can copy and edit into their own).
export const builtInPrompts: { title: string; body: string; category: string }[] = [
  {
    category: "Research",
    title: "Position of law on an issue",
    body: "What is the current position of law in India on {issue}? Give the governing statutory provisions, the leading Supreme Court authority, and any recent change. Flag anything you could not find a source for.",
  },
  {
    category: "Research",
    title: "Old code to new code",
    body: "The offence was committed on {date}. Which provision applies for {offence}: IPC or BNS? Give the section, its ingredients and the punishment, and explain why that code applies on that date.",
  },
  {
    category: "Research",
    title: "Ingredients of an offence",
    body: "List the essential ingredients the prosecution must prove for {section and act}, with the statutory text for each ingredient.",
  },
  {
    category: "Litigation",
    title: "Bail arguments",
    body: "Prepare arguments for regular bail under BNSS s.480/483 for an accused charged under {sections}. Facts: {facts}. Cover parity, period in custody, antecedents and conditions the court may impose.",
  },
  {
    category: "Litigation",
    title: "Cases for and against",
    body: "On the question {question}, set out the strongest arguments and authorities for each side, then a neutral assessment.",
  },
  {
    category: "Drafting",
    title: "Section 138 NI Act notice",
    body: "Draft a demand notice under Section 138 of the Negotiable Instruments Act, 1881. Drawer: {name}. Cheque no. {no} dated {date} for ₹{amount}, dishonoured on {date} with reason {reason}.",
  },
  {
    category: "Drafting",
    title: "Reply to a legal notice",
    body: "Draft a firm, point-by-point reply to the legal notice below on behalf of my client {name}, denying liability where appropriate and reserving all rights.\n\n{paste notice}",
  },
  {
    category: "Contracts",
    title: "Review a contract for risks",
    body: "Review the attached agreement for my client, who is the {party}. List clauses that are one-sided, missing or unusual, with a suggested redline for each.",
  },
  {
    category: "Hindi",
    title: "हिन्दी में सरल व्याख्या",
    body: "{विषय} के बारे में भारतीय कानून की स्थिति सरल हिन्दी में समझाइए, संबंधित धाराओं के साथ।",
  },
  {
    category: "Client",
    title: "Explain to a client simply",
    body: "Explain {legal position} to a client with no legal background, in plain English, in under 200 words, without giving case-specific advice.",
  },
];
