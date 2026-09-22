import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LATEST_MIGRATION } from "@OpenFarm/db/latest-migration";
import { sql } from "@OpenFarm/db/operators";
import { scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { databaseIsBehind, isBehind, schemaIsCurrent } from "./readiness";

// A server is ready when its database has every table the code was built for. The check has to know which migration
// is newest, and a constant that falls behind the folder would pass every database that is itself behind.

const MIGRATIONS = fileURLToPath(
  new URL("../../db/src/migrations", import.meta.url)
);

class RolledBackError extends Error {
  override name = "RolledBackError";
}

describe("whether the database is the one this code was built for", () => {
  it("names the newest migration there is", () => {
    const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted();
    expect(LATEST_MIGRATION).toBe(folders.at(-1));
  });

  it("is ready once every migration is applied", async () => {
    expect(await schemaIsCurrent(scratchDb())).toBe(true);
  });

  it("is not ready when the newest migration was never applied", async () => {
    let seen: boolean | undefined;
    // Forgotten inside a transaction that is then thrown away, so no other test file sees the database behind.
    await expect(
      scratchDb().transaction(async (tx) => {
        await tx.execute(
          sql`delete from drizzle.__drizzle_migrations where name = ${LATEST_MIGRATION}`
        );
        seen = await schemaIsCurrent(tx);
        throw new RolledBackError();
      })
    ).rejects.toBeInstanceOf(RolledBackError);
    expect(seen).toBe(false);
  });
});

// A server refuses to start against a database behind its code, and only that: one it cannot reach still starts, and
// readiness says so, as before.

const NOBODY_LISTENS = "postgresql://postgres:password@127.0.0.1:1/nowhere";

describe("whether a server refuses its database", () => {
  it("starts against a database that has every migration", async () => {
    expect(await isBehind(scratchDb())).toBe(false);
  });

  it("refuses a database the newest migration was never applied to", async () => {
    let behind: boolean | undefined;
    await expect(
      scratchDb().transaction(async (tx) => {
        await tx.execute(
          sql`delete from drizzle.__drizzle_migrations where name = ${LATEST_MIGRATION}`
        );
        behind = await isBehind(tx);
        throw new RolledBackError();
      })
    ).rejects.toBeInstanceOf(RolledBackError);
    expect(behind).toBe(true);
  });

  it("refuses a database no migration has ever run against", async () => {
    let behind: boolean | undefined;
    // The record of migrations taken away, as a database that never had one: the question then fails, and that failure
    // is itself the answer.
    await expect(
      scratchDb().transaction(async (tx) => {
        await tx.execute(
          sql`alter table drizzle.__drizzle_migrations rename to forgotten`
        );
        behind = await isBehind(tx);
        throw new RolledBackError();
      })
    ).rejects.toBeInstanceOf(RolledBackError);
    expect(behind).toBe(true);
  });

  it("does not refuse a database it cannot reach", async () => {
    expect(await databaseIsBehind(NOBODY_LISTENS)).toBe(false);
  });

  it("asks the database at an address, on its own connection", async () => {
    expect(await databaseIsBehind(process.env.DATABASE_URL ?? "")).toBe(false);
  });
});
