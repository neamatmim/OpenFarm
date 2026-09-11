/**
 * Proves a restored database holds the farm, not just a schema.
 *
 * A restore that produces an empty database succeeds quietly, which is the worst way for a
 * backup to be wrong: the drill passes, the runbook is ticked, and the farm finds out on the
 * day it matters. So this asks for the things a farm cannot be without — its own record of
 * itself, its herd, its Playbook, the work that was done and the trail of it — and fails
 * loudly, by name, when any of them is missing.
 *
 * It is deliberately a check of *contents*, not of rules. The rules are tested by the suite
 * in packages/api, which builds its own database from nothing; pointing that at a restored
 * one would test the migrations, not the restore. What a drill needs to know is whether the
 * farm came back, and whether the parts still hang together.
 *
 * Run by scripts/restore.sh against the scratch database, never against the live one.
 */
import { createDb } from "@OpenFarm/db";
import { sql } from "@OpenFarm/db/operators";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required");
}
const name = (url.split("/").pop() ?? "").split("?")[0] ?? "";
if (!name.includes("scratch")) {
  throw new Error(
    `refusing: '${name}' is not a scratch database, and this drops nothing but reads everything`
  );
}

/** What a farm cannot be without, and the least of it that means the restore worked. */
const MUST_HOLD: { table: string; why: string }[] = [
  { table: "farm", why: "the farm's own record of itself" },
  { table: "animal", why: "the herd register" },
  { table: "sop_definition", why: "the Playbook" },
  { table: "sop_version", why: "the Versions the Playbook was worked on" },
  { table: "sop_instance", why: "the work the Playbook raised" },
  { table: "step_completion", why: "the Steps somebody actually did" },
  {
    table: "milk_record",
    why: "the litres — the whole subject of increment 1",
  },
  { table: "milking_session", why: "the Sessions those litres were drawn in" },
  { table: "audit_event", why: "the trail of what happened" },
];

/**
 * Rows that should not be able to exist alone. A dump that came back missing its photos or
 * its Milk Records leaves Completions pointing at nothing, and a count alone would not
 * notice: the numbers would all be non-zero and the drill would pass.
 */
const MUST_HANG_TOGETHER: { what: string; query: string }[] = [
  {
    what: "every Milk Record still has the Completion it came from",
    query: `select count(*)::text as total from milk_record m
            left join step_completion c on c.id = m.completion_id
            where c.id is null`,
  },
  {
    what: "every photo still has the Completion it is evidence for",
    query: `select count(*)::text as total from completion_photo p
            left join step_completion c on c.id = p.completion_id
            where c.id is null`,
  },
  {
    what: "every Animal is still in a Pen the farm has",
    query: `select count(*)::text as total from animal a
            left join pen p on p.id = a.pen_id
            where p.id is null`,
  },
];

/** Postgres for "no such table". */
const NO_SUCH_TABLE = "42P01";

const db = createDb(url);

const totalFrom = async (query: string): Promise<number> => {
  const rows = await db.execute<{ total: string }>(sql.raw(query));
  const first = (rows as unknown as { rows?: { total: string }[] }).rows?.[0];
  return Number(first?.total ?? 0);
};

/** How many rows a table holds, and zero when the table is not even there — a restore that
 *  produced no schema is the same failure as one that produced an empty schema, and should
 *  read the same way. Anything else — a wrong password, a database that is not listening —
 *  is a different problem, and saying "not a farm" would send the drill after the wrong
 *  thing entirely. */
const countOf = async (table: string): Promise<number> => {
  try {
    return await totalFrom(`select count(*)::text as total from "${table}"`);
  } catch (error) {
    const code = (error as { cause?: { code?: string }; code?: string }).cause
      ?.code;
    if (code === NO_SUCH_TABLE) {
      return 0;
    }
    throw error;
  }
};

const missing: string[] = [];
for (const want of MUST_HOLD) {
  // Deliberately sequential: a dozen counts, and a clear message beats a fast one.
  // oxlint-disable-next-line no-await-in-loop
  const held = await countOf(want.table);
  if (held === 0) {
    missing.push(`${want.table}: 0 — expected ${want.why}`);
  } else {
    process.stdout.write(`  ${want.table}: ${held}\n`);
  }
}

const broken: string[] = [];
for (const check of MUST_HANG_TOGETHER) {
  // oxlint-disable-next-line no-await-in-loop
  const orphans = await totalFrom(check.query);
  if (orphans > 0) {
    broken.push(`${orphans} rows where ${check.what} — and they do not`);
  }
}

if (missing.length > 0 || broken.length > 0) {
  process.stderr.write("\n");
  for (const line of [...missing, ...broken]) {
    process.stderr.write(`  ${line}\n`);
  }
  process.stderr.write("\nthe restore produced a database, but not a farm.\n");
  process.exit(1);
}

process.stdout.write(
  "\nthe restored database holds a farm, and it hangs together.\n"
);
process.exit(0);
