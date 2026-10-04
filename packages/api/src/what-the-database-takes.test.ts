import { sql } from "@OpenFarm/db/operators";
import * as schema from "@OpenFarm/db/schema/index";
import { scratchDb } from "@OpenFarm/test-harness";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

// What the database itself will take is said in two places: the code's own lists, and the checks a migration gave the
// database. These tests hold the two together, so a word added to a list, or a new amount, fails here until a
// migration gives the database the same rule — rather than the database refusing the farm's first use of it.

/** Every check the database keeps, by its name, as the database says it. */
const checksInTheDatabase = async (): Promise<Map<string, string>> => {
  const result = await scratchDb().execute<{ name: string; def: string }>(
    sql`select conname as name, pg_get_constraintdef(oid) as def
        from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace`
  );
  return new Map(result.rows.map((row) => [row.name, row.def]));
};

/** The words a check allows, as the database writes them back: `'a'::text`. */
const QUOTED_WORD = /'(?<word>(?:[^']|'')*)'::text/gu;

const wordsIn = (def: string): string[] =>
  [...def.matchAll(QUOTED_WORD)].map((match) =>
    (match.groups?.word ?? "").replaceAll("''", "'")
  );

/** Every column the code keeps to a fixed list of words, with its list. */
const listedColumns = () =>
  Object.values<unknown>(schema)
    .filter((value): value is PgTable => value instanceof PgTable)
    .flatMap((table) => {
      const config = getTableConfig(table);
      return config.columns.flatMap((column) => {
        const words = (column as { enumValues?: readonly string[] }).enumValues;
        return words?.length
          ? [{ table: config.name, column: column.name, words }]
          : [];
      });
    });

// Left free, each for its reason: the Owner's settings, refused out of range by their own form; a balance the bank
// shows, which may be overdrawn; a plan's guesses; a Settlement's figures, which may be a loss; the tank's
// difference from the cows' own litres, either way; the sign-in limiter's own count; a Ration's expected gain.
const leftFree = (table: string, column: string): boolean =>
  [
    "farm",
    "farm_account_check",
    "venture_bank_check",
    "venture_plan",
    "venture_plan_line",
    "venture_settlement",
    "venture_settlement_share",
    "venture_settlement_adjustment",
  ].includes(table) ||
  [
    "milking_session.difference_litres",
    "rate_limit.count",
    "ration.expected_gain_high_kg",
    "ration.expected_gain_low_kg",
  ].includes(`${table}.${column}`);

describe("what the database takes", () => {
  it("takes only the words the code allows, in every column the code keeps to a list", async () => {
    const checks = await checksInTheDatabase();
    const columns = listedColumns();
    expect(columns.length).toBeGreaterThan(0);
    for (const { table, column, words } of columns) {
      const def = checks.get(`${table}_${column}_known`);
      expect(def, `${table}.${column} has no check of its words`).toBeDefined();
      expect(
        wordsIn(def ?? "").toSorted(),
        `${table}.${column} allows other words than the code's`
      ).toEqual([...words].toSorted());
    }
  });

  it("holds every amount, weight, litre and count at nothing or more, but those that may go below", async () => {
    const checks = await checksInTheDatabase();
    const result = await scratchDb().execute<{ table: string; column: string }>(
      sql`select table_name as table, column_name as column from information_schema.columns
          where table_schema = 'public' and data_type in ('numeric', 'integer', 'bigint')
            and column_name ~ '(money|_bdt|_kg|litres|quantity|doses|units|counted|amount|_days$|^days$|count$|animals$|sessions)'`
    );
    const unheld = result.rows
      .filter(({ table, column }) => !leftFree(table, column))
      .filter(
        ({ table, column }) =>
          checks.get(`${table}_${column}_not_negative`) !==
            `CHECK ((${column} >= (0)::numeric))` &&
          checks.get(`${table}_${column}_not_negative`) !==
            `CHECK ((${column} >= 0))`
      )
      .map(({ table, column }) => `${table}.${column}`);
    expect(unheld).toEqual([]);
  });

  it("keeps every moment with its zone, so any session reads the same instant", async () => {
    const result = await scratchDb().execute<{ column: string }>(
      sql`select table_name || '.' || column_name as column from information_schema.columns
          where table_schema = 'public' and data_type = 'timestamp without time zone'`
    );
    expect(result.rows.map((row) => row.column)).toEqual([]);
  });

  it("has validated every check it keeps, so no row written before one breaks it", async () => {
    const result = await scratchDb().execute<{ name: string }>(
      sql`select conname as name from pg_constraint
          where contype = 'c' and connamespace = 'public'::regnamespace and not convalidated`
    );
    expect(result.rows.map((row) => row.name)).toEqual([]);
  });
});
