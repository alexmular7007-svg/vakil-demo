// Starts everything for local use (Windows, macOS, Linux): PostgreSQL + the web app.
// Usage: npm run local        development server (stop with Ctrl+C)
//        npm run local:prod   builds once, then runs the faster production server
//                             (offline mode and app install need this)
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";

const PG_PORT = Number(process.env.LOCAL_PG_PORT ?? 54329);
const APP_PORT = String(process.env.PORT ?? 3000);
const node = process.execPath;
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" }, () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });
}

let db = null;
if (!(await portOpen(PG_PORT))) {
  db = spawn(node, ["scripts/db-server.mjs"], { stdio: "inherit", env: { ...process.env, LOCAL_PG_PORT: String(PG_PORT) } });
  for (let i = 0; i < 120 && !(await portOpen(PG_PORT)); i++) await new Promise((r) => setTimeout(r, 500));
  await new Promise((r) => setTimeout(r, 2000));
}

// Apply any new database migrations (quick and idempotent), so updating the
// app folder from a newer zip needs no extra step.
const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const migrated = spawnSync(node, [tsxCli, "--conditions=react-server", "scripts/migrate.ts"], { stdio: "inherit", env: process.env });
if (migrated.status !== 0) {
  console.error("\nDatabase update failed (see above). If this is a first run, use: npm run setup\n");
  db?.kill();
  process.exit(1);
}

const prod = process.argv.includes("--prod");
if (prod) {
  console.log("\nBuilding the production version (a few minutes the first time)...\n");
  const built = spawnSync(node, [nextBin, "build"], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
  if (built.status !== 0) {
    db?.kill();
    process.exit(built.status ?? 1);
  }
}

const web = spawn(node, [nextBin, prod ? "start" : "dev", "--port", APP_PORT], {
  stdio: "inherit",
  env: prod ? { ...process.env, NODE_ENV: "production" } : process.env,
});
console.log(`\nVaakil AI is starting at http://localhost:${APP_PORT}  (Ctrl+C to stop)\n`);

// Legal updates: check the sources once shortly after start-up, then every 6 hours, in a
// separate process so a slow or offline network never blocks or crashes the app. Only one
// sync runs at a time across this scheduler, the admin "Sync now" button and the cron
// route (a lock in the database); a run that finds another one going just skips.
const SYNC_EVERY_MS = 6 * 60 * 60 * 1000;
let sync = null;
function runUpdatesSync() {
  if (sync) return; // previous run still going
  try {
    sync = spawn(node, [tsxCli, "--conditions=react-server", "scripts/updates/sync.ts", "--quiet", "--local"], { stdio: "inherit", env: process.env });
    sync.on("error", () => {
      sync = null;
    });
    sync.on("exit", () => {
      sync = null;
    });
  } catch {
    sync = null;
  }
}
const firstSync = setTimeout(runUpdatesSync, 90_000);
const syncTimer = setInterval(runUpdatesSync, SYNC_EVERY_MS);

const stop = () => {
  clearTimeout(firstSync);
  clearInterval(syncTimer);
  // A running sync closes its run on SIGTERM; give it a moment before the database stops.
  const syncing = Boolean(sync);
  sync?.kill();
  web.kill();
  setTimeout(() => {
    db?.kill();
    setTimeout(() => process.exit(0), 1500);
  }, syncing ? 1000 : 0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
web.on("exit", (code) => {
  sync?.kill();
  db?.kill();
  process.exit(code ?? 0);
});
