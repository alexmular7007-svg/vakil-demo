/**
 * Seeds reference data: plans, the built-in prompt library, drafting templates,
 * statutes (if fetched), and a local admin account from SEED_ADMIN_EMAIL /
 * SEED_ADMIN_PASSWORD (development only). Idempotent. Run with: npm run db:seed
 */
import "./load-env";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { plans as plansTable, prompts, user } from "@/lib/db/schema";
import { allPlans as plans } from "@/lib/plans";
import { builtInPrompts } from "@/lib/ai/prompt-library";
import { auth } from "@/lib/auth/server";

async function seedPlans() {
  for (const [i, p] of plans.entries()) {
    const row = {
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      pricePaiseMonth: p.pricePaiseMonth,
      pricePaiseYear: p.pricePaiseYear,
      features: p.features,
      limits: p.limits,
      sortOrder: i,
      isActive: true,
    };
    await db.insert(plansTable).values(row).onConflictDoUpdate({ target: plansTable.id, set: row });
  }
  console.log(`✓ ${plans.length} plans`);
}

async function seedPrompts() {
  await db.delete(prompts).where(isNull(prompts.ownerId));
  await db.insert(prompts).values(builtInPrompts.map((p) => ({ ...p, ownerId: null, visibility: "public" })));
  console.log(`✓ ${builtInPrompts.length} built-in prompts`);
}

async function seedTemplates() {
  try {
    const mod = await import("@/lib/drafting/seed-templates");
    await mod.seedTemplates(db);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" || String(e).includes("Cannot find module")) {
      console.log("· templates module not present yet, skipped");
    } else throw e;
  }
}

async function seedCorpus() {
  try {
    const mod = await import("@/lib/corpus/seed-corpus");
    await mod.seedCorpus(db);
  } catch (e) {
    if (String(e).includes("Cannot find module")) console.log("· corpus module not present yet, skipped");
    else throw e;
  }
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("· SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set, admin account skipped");
    return;
  }
  if (process.env.NODE_ENV === "production") {
    console.log("· production: create admins through the admin console, skipped");
    return;
  }
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (!existing) {
    await auth.api.signUpEmail({ body: { email, password, name: "Vaakil Admin" } });
  }
  await db.update(user).set({ role: "admin", emailVerified: true }).where(eq(user.email, email));
  console.log(`✓ admin account ready (${email})`);
}

async function main() {
  await seedPlans();
  await seedPrompts();
  await seedTemplates();
  await seedCorpus();
  await seedAdmin();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
