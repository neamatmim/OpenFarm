/* oxlint-disable no-console */
/**
 * `pnpm db:seed` — a whole farm, three months into its life, for looking at the app with real work in it.
 *
 * It never touches the database the app is using. It builds its own (`openfarm_seed` beside the one in
 * `apps/web/.env`, or `SEED_DATABASE_URL`), migrates it, and then drives the farm through the API itself — the
 * same procedures, the same Effects, the same Audit trail — with a clock it walks forward day by day. What
 * comes out is what three months of a farm running the Playbook leaves behind, not rows typed into tables.
 *
 *   pnpm db:seed           builds the seed database; refuses if one is already there
 *   pnpm db:seed --reset   drops it first and builds it again
 */
import path from "node:path";

import { config } from "dotenv";

// The app's own concurrent reads inside a transaction draw a pg deprecation notice; it is not the seed's to fix here.
process.noDeprecation = true;

const ROOT = path.resolve(import.meta.dirname, "../../../..");
config({ path: path.join(ROOT, "apps/web/.env"), quiet: true });

const SEED_DATABASE = "openfarm_seed";

const withDatabase = (url: string, database: string): string => {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
};

const databaseOf = (url: string): string =>
  decodeURIComponent(new URL(url).pathname.slice(1));

/** Drops (when asked) and creates the seed database, from the server's maintenance database. */
const prepareDatabase = async (url: string, reset: boolean): Promise<void> => {
  const name = databaseOf(url);
  const { createDb } = await import("@OpenFarm/db");
  const admin = createDb(withDatabase(url, "postgres")).$client;
  try {
    const found = await admin.query(
      "select 1 from pg_database where datname = $1",
      [name]
    );
    if (found.rowCount && !reset) {
      throw new Error(
        `The database "${name}" already exists. Run \`pnpm db:seed --reset\` to drop it and seed it again.`
      );
    }
    if (found.rowCount) {
      await admin.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
        [name]
      );
      await admin.query(`drop database "${name.replaceAll('"', '""')}"`);
    }
    await admin.query(`create database "${name.replaceAll('"', '""')}"`);
  } finally {
    await admin.end();
  }
};

const main = async () => {
  const appUrl = process.env.DATABASE_URL;
  if (!appUrl) {
    throw new Error("DATABASE_URL is not set: is apps/web/.env there?");
  }
  const target =
    process.env.SEED_DATABASE_URL ?? withDatabase(appUrl, SEED_DATABASE);
  if (databaseOf(target) === databaseOf(appUrl)) {
    throw new Error(
      `Refusing to seed "${databaseOf(target)}": it is the database the app uses. The seed builds a farm of its own.`
    );
  }
  const reset = process.argv.includes("--reset");
  const started = Date.now();

  await prepareDatabase(target, reset);
  // Everything below reads the seed database: the auth instance and the API are made on import.
  process.env.DATABASE_URL = target;

  const { createDb } = await import("@OpenFarm/db");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const db = createDb(target);
  await migrate(db, {
    migrationsFolder: path.join(ROOT, "packages/db/src/migrations"),
  });

  const { seedFarm } = await import("./farm");
  const accounts = await seedFarm(db);
  await db.$client.end();

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\nSeeded "${databaseOf(target)}" in ${seconds}s.\n`);
  console.log("Accounts (one password for all):");
  for (const account of accounts.people) {
    console.log(
      `  ${account.role.padEnd(8)} ${account.email.padEnd(28)} ${account.name}`
    );
  }
  console.log(`  password ${accounts.password}\n`);
  const shown = new URL(target);
  shown.password = shown.password ? "PASSWORD" : "";
  console.log(
    "Run the app on it (the same URL as apps/web/.env, with the database renamed):"
  );
  // Handed to the web process itself, not to the root script: `DATABASE_URL=… pnpm dev` does not
  // reach it, so the app comes up on the developer's own database and every page refuses a session
  // that belongs to the other one.
  console.log(
    `  cd apps/web && DATABASE_URL=${shown.toString()} pnpm exec vp dev\n`
  );
  console.log(
    "Signing in for the first time? Clear this site's storage — a cookie from the other database\n" +
      "holds a session that is not in this one.\n"
  );
  process.exit(0);
};

try {
  await main();
} catch (error: unknown) {
  // Where it stopped, then what refused it: a step of the three months wraps the farm's own refusal.
  let refusal: unknown = error;
  while ((refusal as { cause?: unknown }).cause instanceof Error) {
    console.error((refusal as Error).message);
    refusal = (refusal as { cause: unknown }).cause;
  }
  const said = refusal as { message?: string; data?: unknown };
  console.error(said.message ?? refusal);
  const issues = (
    said.data as
      | { issues?: { path?: unknown[]; message?: string }[] }
      | undefined
  )?.issues;
  if (issues) {
    for (const issue of issues) {
      console.error(`  ${(issue.path ?? []).join(".")}: ${issue.message}`);
    }
  } else if (said.data) {
    console.error(JSON.stringify(said.data, null, 2));
  }
  console.error(
    (refusal as Error).stack
      ?.split("\n")
      .filter((line) => line.includes("/seed/"))
      .join("\n")
  );
  process.exit(1);
}
