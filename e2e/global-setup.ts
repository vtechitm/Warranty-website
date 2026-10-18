import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Prepares the dedicated E2E database (same approach as tests/global-setup.ts + resetDb): apply migrations
 * (creates the database if needed), empty every table, then load the demo seed (admin@vtech.local, lab-a@vtech.local, …).
 */
export default async function globalSetup() {
  const DATABASE_URL = process.env.E2E_DATABASE_URL_RESOLVED;
  if (!DATABASE_URL) throw new Error("E2E database URL was not resolved by playwright.config.ts");
  const env = { ...process.env, DATABASE_URL };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });

  const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  } finally {
    await prisma.$disconnect();
  }
  execSync("npx tsx --env-file=.env prisma/seed.ts", { stdio: "inherit", env });
}
