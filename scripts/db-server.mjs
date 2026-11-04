// Local PostgreSQL for development (real Postgres binaries, no Docker).
// Starts on 127.0.0.1:54329 with data in .data/postgres and keeps running.
// Usage: npm run db:serve   (safe to run twice: exits if already running)
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PORT = Number(process.env.LOCAL_PG_PORT ?? 54329);
const dataDir = path.resolve(".data/postgres");

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" }, () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });
}

if (await portInUse(PORT)) {
  console.log(`[db] PostgreSQL already running on 127.0.0.1:${PORT}`);
  process.exit(0);
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
  onLog: () => {},
});

const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("vaakil");
console.log(`[db] PostgreSQL ready on 127.0.0.1:${PORT} (database "vaakil")`);

const shutdown = async () => {
  await pg.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
