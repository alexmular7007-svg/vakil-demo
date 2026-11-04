// One-time local setup (Windows, macOS, Linux):
//   1. creates .env.local with a fresh secret and a local admin login (if missing)
//   2. starts the local PostgreSQL server
//   3. creates the tables and security rules, then loads templates, bare acts and plans
// Usage: npm run setup
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const PG_PORT = Number(process.env.LOCAL_PG_PORT ?? 54329);
const APP_PORT = Number(process.env.PORT ?? 3000);
const root = process.cwd();
const node = process.execPath;
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

if (!existsSync(tsxCli)) {
  console.error("Dependencies are missing. Run `npm install` first, then `npm run setup`.");
  process.exit(1);
}

// 1. .env.local
const envPath = path.join(root, ".env.local");
if (existsSync(envPath)) {
  console.log("• .env.local already exists, keeping it");
} else {
  const password = `Local-${randomBytes(6).toString("hex")}`;
  const values = {
    APP_URL: `http://localhost:${APP_PORT}`,
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/vaakil`,
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
    SEED_ADMIN_EMAIL: "admin@vaakil.local",
    SEED_ADMIN_PASSWORD: password,
  };
  let text = readFileSync(path.join(root, ".env.example"), "utf8");
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text}\n${k}=${v}\n`;
  }
  writeFileSync(envPath, text);
  console.log("✓ created .env.local");
  console.log(`  Local admin login → email: ${values.SEED_ADMIN_EMAIL}   password: ${password}`);
  console.log("  (also saved in .env.local as SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)");
}

// 2. PostgreSQL
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
  console.log("• starting local PostgreSQL (first run downloads nothing; binaries come with npm install)…");
  db = spawn(node, ["scripts/db-server.mjs"], { stdio: "inherit", env: { ...process.env, LOCAL_PG_PORT: String(PG_PORT) } });
  for (let i = 0; i < 120 && !(await portOpen(PG_PORT)); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!(await portOpen(PG_PORT))) {
    console.error("PostgreSQL did not start. See the messages above.");
    db.kill();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 2500));
}

// 3. Migrate + seed
function run(script) {
  const r = spawnSync(node, [tsxCli, "--conditions=react-server", script], { stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    db?.kill();
    process.exit(r.status ?? 1);
  }
}
run("scripts/migrate.ts");
run("scripts/seed.ts");

// 4. Starter case law (needs internet; setup still succeeds without it).
console.log("\nDownloading a starter set of Supreme Court judgments (open dataset, CC-BY-4.0)...");
const judgments = spawnSync(
  node,
  [tsxCli, "--conditions=react-server", "scripts/judgments/import.ts", "--court", "sc", "--year", "2024", "--limit", "50"],
  { stdio: "inherit", env: process.env },
);
if (judgments.status !== 0) {
  console.log("· Judgments were not downloaded (offline?). Run later: npm run judgments:import -- --court sc --year 2024 --limit 50");
}

db?.kill();
console.log("\n✓ Setup complete. Start the app with:  npm run local");
console.log(`  Then open http://localhost:${APP_PORT}`);
process.exit(0);
