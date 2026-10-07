import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { sql } from "@OpenFarm/db/operators";
import { scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

// The nightly copy counts the farm's key tables by name, so a restore can be held to what the copy held. A name that is
// no longer a table no longer stops the copy — it is counted as null — but then nothing checks that table's rows came
// back: so a rename has to reach the list too, and this is where it is told.

const BACKUP_SCRIPT = fileURLToPath(
  new URL("../../../scripts/backup.sh", import.meta.url)
);

/** The names the script counts, as it writes them: the array its query unnests. */
const countedBy = (script: string): string[] => {
  const list = /unnest\(array\[(?<names>[^\]]+)\]\)/u.exec(script)?.groups
    ?.names;
  return [...(list ?? "").matchAll(/'(?<name>[a-z_]+)'/gu)].map(
    (one) => one.groups?.name ?? ""
  );
};

describe("the tables the nightly copy counts", () => {
  it("are every one a table the farm has", async () => {
    const counted = countedBy(readFileSync(BACKUP_SCRIPT, "utf-8"));
    expect(counted.length).toBeGreaterThan(10);
    const found = await scratchDb().execute<{ name: string }>(
      sql`select table_name as name from information_schema.tables where table_schema = 'public'`
    );
    const tables = new Set(found.rows.map((row) => row.name));
    expect(counted.filter((name) => !tables.has(name))).toEqual([]);
  });
});
