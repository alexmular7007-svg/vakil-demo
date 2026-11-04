"use client";

import { StaticMark } from "@/components/brand-mark-static";

// Replaces the root layout when it fails, so it carries its own document and styles
// (globals.css and fonts are not available here). Follows the OS colour scheme.

const css = `
:root { color-scheme: light dark; --bg:#f5f4f0; --surface:#ffffff; --ink:#0c1631; --ink2:#2e3852; --muted:#5d6579; --border:#cdc9bc; --primary:#15295a; --primary-ink:#ffffff; }
@media (prefers-color-scheme: dark) { :root { --bg:#060b17; --surface:#0d1426; --ink:#eceef4; --ink2:#c5cbd9; --muted:#8d97ae; --border:#2c3958; --primary:#e2c178; --primary-ink:#1b1405; } }
* { box-sizing: border-box; }
body { margin:0; min-height:100dvh; display:flex; align-items:center; justify-content:center; padding:24px 16px; background:var(--bg); color:var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif; }
main { max-width: 32rem; text-align:center; }
h1 { font-family: ui-serif, Georgia, serif; font-size: 1.9rem; line-height:1.2; margin: 20px 0 8px; }
p { color: var(--ink2); line-height: 1.6; margin: 0 0 8px; }
.ref { color: var(--muted); font-size: 0.85rem; }
.row { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-top: 24px; }
button, a.btn { min-height:44px; padding: 0 22px; border-radius: 999px; font: inherit; font-weight: 600; cursor:pointer; display:inline-flex; align-items:center; text-decoration:none; }
button { background: var(--primary); color: var(--primary-ink); border: 0; }
a.btn { background: var(--surface); color: var(--ink); border: 1px solid var(--border); }
button:focus-visible, a.btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
`;

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error && typeof error === "object" && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return (
    <html lang="en-IN">
      <head>
        <title>Something went wrong · Vaakil AI</title>
        <meta name="robots" content="noindex" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main>
          <StaticMark size={52} />
          <h1>Something went wrong</h1>
          <p>Vaakil AI hit an unexpected error. Your saved work is safe. Please try again; if it keeps happening, contact support.</p>
          {digest ? <p className="ref">Reference: {digest}</p> : null}
          <div className="row">
            <button type="button" onClick={() => retry()}>
              Try again
            </button>
            {/* A full page load is intended here: the app shell itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="btn" href="/">
              Go to home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
