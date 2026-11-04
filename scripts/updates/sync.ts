/**
 * Runs the legal-updates job once: feeds (Parliament, PRS, Supreme Court, news) and the
 * India Code check of tracked acts. Safe to run while the app is running: only one sync
 * runs at a time, so if the cron, an admin or the local scheduler is already syncing,
 * this prints "already running" and exits without doing anything (exit code 0).
 * Sources listed in DISABLED_UPDATE_SOURCES are skipped.
 *
 *   npx tsx --conditions=react-server scripts/updates/sync.ts
 *   ... --only feeds | --only india_code   one part only
 *   ... --deep                             re-read every tracked act's section text
 *   ... --dry-run                          fetch, parse and diff, but write nothing
 *   ... --quiet                            print only the final one-line summary
 */
import "../load-env";

const args = process.argv.slice(2);
const onlyArg = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
const only = onlyArg === "feeds" || onlyArg === "india_code" ? onlyArg : undefined;
const quiet = args.includes("--quiet");
const trigger = args.includes("--local") ? "local" : "script";

async function main() {
  // The embedded PGlite database (no DATABASE_URL) must never be opened by two processes;
  // when the launcher runs this next to the app, skip instead.
  if (trigger === "local" && !process.env.DATABASE_URL) {
    console.log("[updates] skipped: no DATABASE_URL (embedded database is in use by the app)");
    return;
  }
  const started = Date.now();
  // Imported only now: importing opens the database connection.
  const { syncLegalUpdates } = await import("@/lib/updates/sync");
  const { releaseAllLeases } = await import("@/lib/updates/runs");
  // Stopped by the local launcher or Ctrl+C: close this run's rows so the lock is free at once.
  const stop = (signal: string) => {
    void releaseAllLeases(`Stopped (${signal}).`).finally(() => process.exit(130));
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  // Housekeeping on the same schedule: expire overdue e-sign envelopes.
  if (!args.includes("--dry-run")) {
    const { expireOverdueEnvelopes } = await import("@/lib/esign/service");
    const swept = await expireOverdueEnvelopes().catch((e) => {
      console.error("[esign] expiry sweep failed:", e instanceof Error ? e.message : e);
      return null;
    });
    if (swept && swept.expired + swept.completed > 0) console.log(`[esign] expired ${swept.expired}, completed ${swept.completed} overdue envelope(s)`);
  }
  const summary = await syncLegalUpdates({
    only,
    deep: args.includes("--deep"),
    dryRun: args.includes("--dry-run"),
    trigger,
    log: quiet ? undefined : (m) => console.log(`  ${m}`),
  });
  if (summary.alreadyRunning) {
    console.log(`[updates] skipped: ${summary.alreadyRunning.message}`);
    return;
  }
  const feedsNew = Object.values(summary.feeds?.sources ?? {}).reduce((a, s) => a + s.new, 0);
  const failed = Object.entries(summary.feeds?.sources ?? {})
    .filter(([, s]) => !s.ok)
    .map(([k]) => k);
  const ic = summary.indiaCode?.result;
  const updated = ic ? Object.entries(ic.acts).filter(([, a]) => a.status === "updated").map(([k]) => k) : [];
  console.log(
    `[updates] ${args.includes("--dry-run") ? "dry run: " : ""}feeds ${summary.feeds?.status ?? "skipped"} (${feedsNew} new${failed.length ? `; failed: ${failed.join(", ")}` : ""}), ` +
      `India Code ${summary.indiaCode?.status ?? "skipped"} (${ic?.new ?? 0} new${updated.length ? `; acts updated: ${updated.join(", ")}` : ""}${ic?.errors.length ? `; ${ic.errors.length} error(s)` : ""})` +
      `${summary.skipped.length ? `; skipped ${summary.skipped.join(", ")}` : ""} in ${Math.round((Date.now() - started) / 1000)} s`,
  );
  const unhealthy = Object.entries(summary.feeds?.sources ?? {}).filter(([, s]) => (s.health?.consecutiveFailures ?? 0) >= 3);
  for (const [k, s] of unhealthy) console.log(`  ! ${k} has failed ${s.health!.consecutiveFailures} runs in a row (last success ${s.health!.lastSuccessAt ?? "never"})`);
  if (!quiet && ic?.errors.length) for (const e of ic.errors) console.log(`  ! ${e}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[updates] sync failed: ${(err as Error).message}`);
    process.exit(1);
  });
