# Vaakil AI: features

## Ask AI (legal assistant)
- Chat about Indian law with answers that stream in as they are written.
- **Answers come from sources**: matching bare-act sections and your own documents are retrieved first, and the AI cites them as [S1], [S2].
- **Every citation is checked** before you see it: *verified* (retrieved source), *found in corpus*, *not in corpus: verify*, or *case not verified*.
- Modes: **Research** (position of law + analysis + gaps), **Draft** (Indian court format), **Explain simply** (plain language).
- **English or Hindi** answers; **Deep** toggle for the strongest model.
- Prompt library (built-in + your own), conversation history with rename, pin and delete, copy, thumbs up/down.
- "Ask a verified advocate" hand-off from any answer.
- Two AI providers: **Claude** (Haiku 5.5 / Sonnet 5.5 / Opus 5.5) and **Gemini** (Flash-Lite / Flash / Pro), routed by difficulty.
- **Unlimited with fair use**: past the daily level, answers move to the faster model instead of stopping; usage and cost are tracked.

## My assistants ("create your own GPT")
- Build assistants with standing instructions, a model level and knowledge files from your documents.
- Vaakil's citation and safety rules always sit above your instructions.

## Law library: answers from decided cases (new)
- **Judgments library**: Supreme Court and High Court judgments from the AWS Open Data "Indian Supreme Court Judgments" and "Indian High Court Judgments" datasets (CC-BY-4.0, attribution shown on every judgment), plus any judgment an admin uploads (PDF, Word or pasted text).
- **Ask AI answers from precedent**: each question also retrieves the best-matching judgment paragraphs; answers quote paragraph numbers, and every case named in an answer is checked against the library ("Verified in library" or "Case not verified"). The AI is told never to cite a case from memory.
- **Case law tab** in Research with highlighted search, court and year filters, and a judgment reader with linkable numbered paragraphs, copy citation and "Ask AI about this judgment".
- **Import more**: `npm run judgments:import -- --court sc --year 2024 --limit 50` (or `--court hc --bench-court 27_1`); re-runs skip what is already there.
- **Admin act manager** (`/admin/library`): add a new act, add, edit or remove sections, or paste a whole new act's text and confirm the split. Every change is kept in a permanent before/after history.

## Legal updates and new-law alerts (new, paid add-on with 15 days free)
- Checked automatically every 6 hours (and from the admin console on demand) from **Parliament (Sansad) bills**, **PRS Legislative Research**, **Supreme Court judgments (Indian Kanoon feed)**, **SCC Times** and **India Code**.
- **Automatic law updates**: when India Code amends a tracked act (BNS, BNSS, BSA, NI Act…), only the changed sections are applied to the bare-act corpus, with the old and new text kept in the history, and an "amendment" alert is raised. Safety checks refuse suspicious changes. New central acts are listed for an admin to add.
- **Pop-up alert** in the app when a bill, act, amendment or ordinance touching BNS, IPC, BNSS, CrPC, courts or the Constitution appears, plus alerts in the bell and a **Legal updates** page with filters (bills and acts, amendments, judgments, news).
- Admin console: source status, "Sync now", "Full India Code check", and per-item importance (high, normal, hidden).

## Research (bare acts)
- **10 official acts from India Code**: BNS, BNSS, BSA, IPC, CrPC, Indian Evidence Act, Negotiable Instruments Act, Hindu Marriage Act, Consumer Protection Act, RTI Act (2,680 sections with amendment footnotes).
- Full-text search; direct lookups like "s. 103 BNS" or "CrPC 438".
- **Old ↔ new code converter** (IPC↔BNS, CrPC↔BNSS, Evidence Act↔BSA) from the **official NCRB table** (1,236 pairs). Enter the offence date and it tells you which code governs and why.

## Drafting studio
- **15 Indian templates**, 6 also in Hindi: s.138 cheque-bounce notice, reply to legal notice, money recovery notice, regular bail (BNSS s.480/483), anticipatory bail (BNSS s.482), affidavit, rent / leave and licence, NDA, appointment letter, mutual-consent divorce (HMA s.13B), consumer complaint, RTI application, power of attorney, will, and more.
- Step-by-step intake form, editor with live preview, placeholders still to fill.
- **Immutable version history** (each save hashed), restore, mark final.
- AI assist: improve wording, translate EN↔HI, expand from facts, check missing clauses (preview before accepting).
- Export to **Word (.docx)** and **print / Save as PDF**; "Send for signature" (blocked for wills and powers of attorney).

## Documents
- Upload PDF, Word or text files (checked by file contents, size-limited); text extracted automatically.
- AI **summary**, **risk review** ("I represent…"), **ask a question** answered from the document with quotes.
- **Compare two documents**: line-by-line diff (works without AI) plus AI comparison.

## Multi-party e-sign
- Roles **Lawyer, Sender, Receiver** (+ others), actions **Review, Sign, Witness, Copy**, signing order (same step = parallel).
- Default flow: lawyer reviews → sender and receiver sign → optional lawyer witness.
- Signers need no account: email link + **one-time code**, versioned consent, typed or **drawn signature**.
- Document fingerprint (SHA-256) locked when sent; **hash-chained audit trail** of every step.
- Final PDF with a **signature page and certificate of completion** (hashes, parties, times, IPs, QR code).
- Public **verify page** and a "check a copy" tool that compares a file's fingerprint in the browser.
- Blocks documents the IT Act excludes (wills, trusts, powers of attorney, negotiable instruments, property sale).
- Aadhaar eSign ready to plug in through a licensed provider (switched off until configured).

## Case diary (new)
- **Today's board**: what is listed today, where and at which item, on the home screen and in a week-strip diary (swipe between weeks on phones).
- Add a hearing in seconds: case, court, court hall, item number, time, purpose chips (Arguments, Evidence, Bail…), case number and **CNR**.
- **Record the outcome** (done, adjourned, cancelled) and the next date: the next hearing is created and linked automatically.
- **Open on eCourts** (copies the CNR and opens the official CNR search page), **Add to Google Calendar**, **.ics export** for any calendar app, and **Send the next date to the client on WhatsApp** (prefilled message, no API needed).
- **Tasks** with due dates, per matter or general; overdue tasks and today's hearings appear in the notifications bell.
- **Read an order** (with an AI key): paste an order and AI proposes the next date and purpose, quoting the line it used; nothing is saved until you confirm.

## Clients and fee book (new)
- **Clients register**: individuals and businesses, phone, email, address, GSTIN (checksum-validated), linked matters and what each client owes.
- **Conflict check**: search a name across your clients, opposing parties and matter titles before accepting a brief.
- **Fee memos / invoices** numbered per financial year (`INV/2026-27/0001`), letterhead from your billing profile, amount **in words (lakh/crore)**, and GST handled the Indian way: no GST, **reverse charge** for business clients (CBIC notification 13/2017), or charged GST if you are registered.
- **Pay by UPI** QR code and link on every memo; record receipts (cash, UPI, bank, cheque), part-payments and overdue tracking; print or save as PDF.
- Fee summary for the financial year (billed, received, outstanding, overdue) on the home screen; BCI Rules 20 and 25 notes.

## Legal calculators (new)
- **Limitation calculator** (Limitation Act, 1963): 33 verified articles (suits, appeals, applications), s.12 exclusion of the first day and certified-copy time, optional s.4 court closures, with the working shown step by step and the article text.
- **Cheque-bounce timeline** (NI Act s.138/142): presentation within validity (RBI three-month rule), 30-day notice, 15 days to pay, one-month complaint window, with delay flags.
- **Interest calculator** (simple and compound) and **days between dates** calculator.
- Free public versions of the limitation and cheque-bounce tools for SEO (`/tools/limitation-calculator`, `/tools/cheque-bounce-timeline`).

## Matters
- Case files with client (linked to the clients register), opposing party, court, case number, **CNR**, and **offence date** (decides IPC vs BNS automatically).
- Hearings, tasks, conversations, drafts and documents for the matter on one page; "Ask AI about this matter" searches the matter's documents.

## Advocates and companies
- **Verified advocate directory** (enrolment number + State Bar Council checked by an admin), unranked, BCI Rule 36 notice.
- Consultation requests and an advocate inbox (accept / decline / close).
- Company search from the search.vaakil.com directory, hiding the fabricated "director" entries (needs the read-only key).

## Account, billing and privacy
- Email + password sign-up, **Continue with Google** (when a Google OAuth client is configured), **two-factor login** (authenticator app + backup codes), active sessions with sign-out.
- Real email to any inbox (Gmail included) through Resend or any SMTP server such as Gmail with an app password.
- Advocate verification application.
- Plans: Free, Advocate Pro, Chambers, with GST; CGPEY payments ready (switched off until keys are added).
- **Daily legal updates add-on** (₹149/month or ₹1,490/year + GST; included in Advocate Pro and Chambers): the daily law, court and advocate news feed, new-law pop-ups and bell alerts. **Every account gets 15 days free**, starting automatically on first use (existing accounts too). After the trial the feed shows a subscribe screen; bare-act amendments stay free for everyone. Price and trial length live in `src/lib/plans.ts`.
- **Privacy centre (DPDP Act)**: consents, data-rights requests with 90-day due dates, download your data, grievance contact.

## Admin console
- Overview (users, verifications, AI cost, payments, envelopes), users and roles, ban/unban.
- Advocate verification queue, AI provider status, rights requests.
- **Audit log with "Verify chain"** (detects any edit or deletion).
- CGPEY KYC tester (PAN, bank account, Aadhaar OTP), masked and audited.

## Public website (SEO)
- Home, pricing, templates gallery and pages, **2,770 static bare-act pages**, free IPC→BNS, limitation and cheque-bounce tools, verified advocates page.
- Terms, privacy notice (DPDP), disclaimer, grievance officer and security pages (drafts for counsel review).
- Sitemap, robots, structured data, share images, app icons, installable web app.

## Security and reliability
- Identity is always taken from the verified session; every action re-checks it. One permissions list (`src/lib/auth/permissions.ts`) decides who can do what.
- **Row-level security in PostgreSQL**: users can only reach their own rows; rows can only link to the same user's rows (same-owner guards); status and money columns are checked by the database itself.
- **`npm run db:check`**: 100+ automatic checks of the database security layer, also shown on the admin overview.
- Append-only, hash-chained audit, signature, draft-version and statute-history records; signed documents cannot change.
- Admins must use two-factor login in production; failed sign-ins are audited (email masked); login limits are stored in the database.
- AI: timeouts, retries, automatic Claude ↔ Gemini failover, circuit breaker, prompt-injection protection for documents and judgments, a context budget, and no message content in logs.
- Law data: statute changes are locked per act and applied in one transaction; only one updates sync runs at a time; sources retry, report their health and can be switched off with `DISABLED_UPDATE_SOURCES`.
- Payments: duplicate-click safe checkout, signed webhooks with timestamp checks, add-on and main plan kept separate, tested end to end.
- E-sign: one state machine for every status change, row locks against double signing, automatic expiry (also swept every 6 hours), hashed one-time codes with rate limits, and stored PDFs checked against their fingerprints before they are served.
- Keys stay on the server; strict security headers; rate limits on login, chat, uploads, checkout and codes.
- Every action follows one pattern (`defineAction`); developer guides in `docs/ADDING-A-FEATURE.md`, `docs/DESIGN-SYSTEM.md` and `docs/CONVENTIONS.md`.

## Design and app experience
- **"Court navy and brass" identity**: a new logo (gold coat lapels forming a "V" around an advocate's white bands), navy and gold palette, Newsreader serif headings and Inter for the interface. All text meets WCAG AA contrast.
- **Banking-app home screen**: a navy "Today" card with key figures, a quick-action grid, recent activity as a transaction-style list, and **privacy mode** (the eye button blurs client names, like hiding a balance).
- **Phone**: top app bar with search and notifications, bottom tab bar with a raised centre **Ask AI** button, and an **All services** sheet. Dialogs open as bottom sheets.
- **Tablet**: navy icon rail. **Desktop**: navy sidebar, search bar (**Ctrl K** searches matters, drafts, documents, conversations and bare-act sections), "New" menu and notifications bell.
- **Installable app**: add Vaakil AI to the home screen or desktop. Offline, bare acts and tools you opened earlier still work (production build); nothing private is cached.
- **Voice input**: tap the microphone in Ask AI and speak in English or Hindi (Chrome, Edge, Safari).
- Light and dark mode (dark mode leads with gold); Hindi typography; keyboard and screen-reader friendly; 44px touch targets.
