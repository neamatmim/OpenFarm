import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LATEST_MIGRATION } from "@OpenFarm/db/latest-migration";
import { sql } from "@OpenFarm/db/operators";
import { scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { schemaIsCurrent } from "./readiness";

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
