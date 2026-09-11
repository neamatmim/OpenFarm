/**
 * Proves a restored database holds the farm, not just a schema.
 *
 * A restore that produces an empty database succeeds quietly, which is the worst way for a
 * backup to be wrong: the drill passes, the runbook is ticked, and the farm finds out on the
 * day it matters. So this asks for the things a farm cannot be without — its own record of
 * itself, its animals, its Playbook, and the trail that says what happened to them — and
 * fails loudly when any of them is missing.
 *
 * Run by scripts/restore.sh against the scratch database, never against the live one.
 */
import { createDb } from "@OpenFarm/db";
import { sql } from "@OpenFarm/db/operators";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required");
}
if (!url.includes("scratch")) {
  throw new Error(
    "refusing: this checks a restored scratch database, not a live one"
  );
}

/** What a farm cannot be without, and the least of it that means the restore worked. */
const MUST_HOLD: { table: string; atLeast: number; why: string }[] = [
  { table: "farm", atLeast: 1, why: "the farm's own record of itself" },
  { table: "animal", atLeast: 1, why: "the herd register" },
  { table: "sop_definition", atLeast: 1, why: "the Playbook" },
  {
    table: "sop_version",
    atLeast: 1,
    why: "the Versions the Playbook was worked on",
  },
  { table: "audit_event", atLeast: 1, why: "the trail of what happened" },
];

const db = createDb(url);

/** How many rows a table holds, and zero when the table is not even there. A restore that
 *  produced no schema at all is the same failure as one that produced an empty one, and it
 *  should read the same way rather than as a driver's complaint. */
const countOf = async (table: string): Promise<number> => {
  try {
    const rows = await db.execute<{ total: string }>(
      sql.raw(`select count(*)::text as total from "${table}"`)
    );
    const first = (rows as unknown as { rows?: { total: string }[] }).rows?.[0];
    return Number(first?.total ?? 0);
  } catch {
    return 0;
  }
};

const missing: string[] = [];
for (const want of MUST_HOLD) {
  // Deliberately sequential: five counts, and a clear message beats a fast one.
  // oxlint-disable-next-line no-await-in-loop
  const held = await countOf(want.table);
  const line = `${want.table}: ${held}`;
  if (held < want.atLeast) {
    missing.push(`${line} — expected ${want.why}`);
  } else {
    process.stdout.write(`  ${line}\n`);
  }
}

if (missing.length > 0) {
  process.stderr.write("\n");
  for (const line of missing) {
    process.stderr.write(`  ${line}\n`);
  }
  process.stderr.write("\nthe restore produced a database, but not a farm.\n");
  process.exit(1);
}

process.stdout.write("\nthe restored database holds a farm.\n");
process.exit(0);
