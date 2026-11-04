// Loads .env.local for scripts run outside Next.js (migrate, seed). Import first.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on variables already set in the environment.
}
