# Run Vaakil AI on a Windows laptop

Everything runs on your laptop: the website, the database and the AI connection. No Docker and no separate database install.

## What you need (one time)

1. **Windows 10 or 11, 64-bit on an Intel or AMD processor.** (Windows on ARM / Snapdragon laptops are not supported by the built-in database; see "Problems" below.)
2. **Node.js 24 LTS**: download the Windows installer from <https://nodejs.org> and install with the default options.
   Check it worked: open **PowerShell** and run `node -v`. It should print `v24…` (v22 also works).
3. About **2 GB of free disk space**.

## Easiest way: double-click

1. Unzip **Vaakil-AI.zip** to a simple folder, for example `C:\Projects\vaakil-ai`.
   Avoid OneDrive-synced folders like Desktop or Documents if OneDrive is on.
2. Open the `vaakil-ai` folder and double-click **`start-windows.bat`**.
   - The first time, it installs everything (5–10 minutes) and sets up the database.
     It prints your **local admin email and password**. Write them down.
     (They are also saved in the file `.env.local`.)
   - Your browser opens at <http://localhost:3000>.
3. To stop, close the black window (or press `Ctrl + C` in it).
   To start again later, double-click `start-windows.bat` again (it starts in seconds).

If Windows asks "Allow Node.js through the firewall?", choose **Private networks** only (or Cancel: the app works locally either way).

## Manual way (PowerShell)

Open PowerShell in the `vaakil-ai` folder (Shift + right-click in the folder → "Open PowerShell window here"), then:

```powershell
npm install
npm run setup
npm run local
```

- `npm install`: downloads the libraries (first time only).
- `npm run setup`: creates `.env.local`, starts the database, creates tables and security rules, and loads templates, plans and the 10 bare acts (first time only).
- `npm run local`: starts the database and the app. Open <http://localhost:3000>.

## Sign in

Open <http://localhost:3000/login> and use the admin email and password that setup printed (or read `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env.local`). You can also create a normal account with **Start free**.

Emails (verification links, e-sign links and one-time codes) are not really sent on your laptop. Open <http://localhost:3000/dev/outbox> to see them.

## Switch on the AI answers

Ask AI, AI drafting and document review need an API key from Anthropic (Claude) or Google (Gemini).

1. Open `.env.local` in Notepad.
2. Paste your key after `ANTHROPIC_API_KEY=` or `GOOGLE_GENERATIVE_AI_API_KEY=` (no spaces, no quotes).
3. Save, stop the app, and start it again.

Never share `.env.local` or upload it anywhere: it holds your secrets.

## Optional keys (same file)

| Setting | What it turns on |
|---|---|
| `RESEND_API_KEY` | Sends real emails (to Gmail or any address) through Resend |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Sends real emails through any mail server, for example your Gmail (see below) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Shows "Continue with Google" on the sign-in and sign-up pages (see below) |
| `CGPEY_MERCHANT_ID`, `CGPEY_API_KEY`, `CGPEY_API_SECRET`, `CGPEY_WEBHOOK_SECRET` | Online payments and the KYC tester (admin) |
| `ESIGN_PROVIDER`, `ESIGN_API_KEY`, `ESIGN_WEBHOOK_SECRET` | Aadhaar eSign through a licensed provider (Leegality, Digio…) |
| `DIRECTORY_SUPABASE_URL`, `DIRECTORY_SUPABASE_KEY` | The search.vaakil.com company directory (read-only key) |
| `CRON_SECRET` | Protects the scheduled updates check when hosted (e.g. Vercel Cron) |
| `EXTRA_UPDATE_FEEDS` | Extra RSS feeds for legal updates, comma-separated |

## Send emails from your Gmail

1. Turn on 2-Step Verification for the Gmail account (Google Account → Security).
2. Create an **app password**: Google Account → Security → 2-Step Verification → App passwords. Copy the 16-letter password.
3. In `.env.local` set:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=youraddress@gmail.com
   SMTP_PASS=the16letterapppassword
   EMAIL_FROM="Vaakil AI <youraddress@gmail.com>"
   ```
4. Restart the app. Sign-up verification, password resets, e-sign links and one-time codes now go to real inboxes (Gmail, Outlook, anything). A normal Gmail account can send about 500 emails a day; for more, use Resend or a business mail service.

## Sign in with Google

1. Open <https://console.cloud.google.com/apis/credentials>, create a project, then **Create credentials → OAuth client ID → Web application**.
2. Under **Authorised redirect URIs** add `http://localhost:3000/api/auth/callback/google` (and later `https://your-domain/api/auth/callback/google`).
3. Copy the client ID and secret into `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and restart. The **Continue with Google** button appears on the sign-in and sign-up pages. New Google users see the consent screen before using the app.

## Case law and legal updates

- **More judgments**: `npm run judgments:import -- --court sc --year 2024 --limit 50` downloads Supreme Court judgments (open dataset, CC-BY-4.0) into the library. Use another `--year` for more. Admins can also upload judgments at `/admin/library`.
- **Legal updates** are checked automatically while `npm run local` is running (first check about 90 seconds after start, then every 6 hours). To check now: `npm run updates:sync`, or **Sync now** in `/admin/updates`.
- Daily legal updates are a paid add-on with 15 days free for every account; bare-act amendments are free for everyone.

## Updating to a newer version

1. Stop the app.
2. Unzip the new version over the old folder, or copy your old `.env.local` file and `.data` folder into the new folder. Those two hold your settings and your data.
3. Run `npm install`, then start as usual (`start-windows.bat` or `npm run local`). Database updates are applied automatically on start.

## Install it like an app

In Chrome or Edge, open the app and choose **Install Vaakil AI** (the install icon in the address bar, or **More → Install app** on a phone). It then opens in its own window with the Vaakil icon. Offline reading of bare acts needs the production version: start with `npm run local:prod` instead of `npm run local` (it builds once, a few minutes, then starts faster on every page).

## Where things are stored

- Database: `vaakil-ai\.data\postgres`
- Uploaded files and signed PDFs: `vaakil-ai\.data\uploads`

To start completely fresh, stop the app, delete the `.data` folder and `.env.local`, then run `npm run setup` again.

## Problems

| Message | Fix |
|---|---|
| `'node' is not recognized` | Install Node.js (step 2 above) and open a new PowerShell window. |
| `Dependencies are missing` | Run `npm install` first. |
| Port 3000 already in use | Close the other app, or start on another port: `$env:PORT=3001; npm run local`, then open <http://localhost:3001> and set `APP_URL=http://localhost:3001` in `.env.local`. |
| Database will not start, or errors mention `VCRUNTIME140.dll` | Install "Microsoft Visual C++ Redistributable (x64)" from Microsoft's website, then try again. |
| Windows on ARM laptop | Install PostgreSQL for Windows from postgresql.org, create a database named `vaakil`, put its address in `DATABASE_URL` in `.env.local`, then run `npm run db:migrate` and `npm run db:seed`, and `npm run dev`. |
| Sign-in loops back to the login page | Use `http://localhost:3000` (not `127.0.0.1`), or make `APP_URL` in `.env.local` match the address you use. |
