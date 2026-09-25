import { readFile } from "node:fs/promises";
import path from "node:path";

import { sql } from "@OpenFarm/db/operators";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The Pay-in Code: what an Investor writes on the transfer that sends an Agreement's capital, given when the
 * Agreement is recorded and never changed, and given by the migration to every Agreement recorded before it.
 */
const suffix = `pay-in-${Date.now()}`;

const as = (instant: string) =>
  createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(instant),
  });

const plan = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2050-03-01",
  targetWindowStart: "2050-06-01",
  targetWindowEnd: "2050-06-03",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 750_000,
};

const paper = {
  units: 2,
  investorsPercent: 60,
  arbitrator: `মাওলানা আব্দুল হক ${suffix}`,
  stampValueBdt: 300,
  stampedOn: "2050-01-02",
  stampSerial: `AA ${suffix}`,
};

const opened = async (instant: string, name: string) => {
  const { client } = await as(instant);
  const { id } = await client.ventures.open({
    name: `${name} ${suffix}`,
    ...plan,
  });
  return id;
};

const people: string[] = [];

const signed = async (instant: string, ventureId: string, who: number) => {
  const { client } = await as(instant);
  return client.ventures.sign({
    ventureId,
    investorId: people[who] ?? "",
    ...paper,
  });
};

const codesOn = async (ventureId: string) => {
  const { client } = await as("2050-01-10T04:00:00.000Z");
  const rows = await client.ventures.agreements({ ventureId });
  return rows.map((one) => one.payInCode);
};

let first = "";
let second = "";
let third = "";
const given = new Map<string, string>();

beforeAll(async () => {
  const { client } = await as("2050-01-01T04:00:00.000Z");
  for (const which of [1, 2, 3]) {
    // One after another, so the three are the first, second and third people in the order the Agreements name them.
    // oxlint-disable-next-line no-await-in-loop
    const person = await client.investors.record({
      name: `বিনিয়োগকারী ${which} ${suffix}`,
      phone: `0181${String(which).padStart(7, "0")}`,
    });
    people.push(person.id);
  }
  first = await opened("2050-01-01T04:00:00.000Z", "প্রথম");
  for (const [instant, venture, who] of [
    ["2050-01-02T04:00:00.000Z", first, 0],
    ["2050-01-02T05:00:00.000Z", first, 1],
  ] as const) {
    // Signed in turn: the order of signing is what the codes count.
    // oxlint-disable-next-line no-await-in-loop
    const one = await signed(instant, venture, who);
    given.set(one.id, one.payInCode);
  }
  second = await opened("2050-01-03T04:00:00.000Z", "দ্বিতীয়");
  const onSecond = await signed("2050-01-04T04:00:00.000Z", second, 0);
  given.set(onSecond.id, onSecond.payInCode);
  // Written up with a day before the first was, as a Venture opened on paper last month and typed in today is.
  third = await opened("2049-12-01T04:00:00.000Z", "তৃতীয়");
  const onThird = await signed("2050-01-05T04:00:00.000Z", third, 0);
  given.set(onThird.id, onThird.payInCode);
  const lateOnFirst = await signed("2050-01-05T05:00:00.000Z", first, 2);
  given.set(lateOnFirst.id, lateOnFirst.payInCode);
});

describe("a Pay-in Code given at signing", () => {
  it("is the Venture's place on the farm and the Agreement's on the Venture, and signing says it", () => {
    expect([...given.values()]).toEqual([
      "PAY-1-01",
      "PAY-1-02",
      "PAY-2-01",
      "PAY-3-01",
      "PAY-1-03",
    ]);
  });

  it("is on every Agreement the capital form reads", async () => {
    expect(await codesOn(first)).toEqual(["PAY-1-01", "PAY-1-02", "PAY-1-03"]);
    expect(await codesOn(second)).toEqual(["PAY-2-01"]);
    expect(await codesOn(third)).toEqual(["PAY-3-01"]);
  });

  it("is in the trail's record of the signing", async () => {
    const [id, code] = [...given][0] ?? [];
    const events = await scratchDb().query.auditEvent.findMany({
      where: { entity: "investment_agreement", entityId: id },
    });
    expect(events).toEqual([
      expect.objectContaining({
        action: "create",
        after: expect.objectContaining({ payInCode: code }),
      }),
    ]);
  });

  it("is not moved by a Venture written with an earlier day", async () => {
    // The third Venture carries the earliest day of the three, and still took the third place: counting places by
    // the day would have renumbered the first two under Agreements already holding their codes.
    const rows = await scratchDb().query.venture.findMany({
      where: { farmId: theFarm().id },
      columns: { id: true, ordinal: true },
    });
    expect(
      Object.fromEntries(rows.map((one) => [one.id, one.ordinal]))
    ).toEqual({ [first]: 1, [second]: 2, [third]: 3 });
  });
});

/** The migration's own statements, as the database runs them. */
const migration = async () => {
  const text = await readFile(
    path.resolve(
      import.meta.dirname,
      "../../../db/src/migrations/20260925103629_a_pay_in_code/migration.sql"
    ),
    "utf-8"
  );
  return text.split("--> statement-breakpoint");
};

/** Thrown to undo the backfill's rehearsal once it has been read. */
class RolledBackError extends Error {
  override name = "RolledBackError";
}

describe("the migration's backfill", () => {
  it("gives every Agreement recorded before the codes its Venture's place by opening, and its own by signing", async () => {
    const statements = await migration();
    // Everything after the two new columns: both backfills, then the NOT NULLs and unique indexes that must hold of
    // what they wrote.
    const backfill = statements.filter((one) => !one.includes("ADD COLUMN"));
    expect(backfill).toHaveLength(6);
    let read: { venture: number; code: string; investorId: string }[] = [];
    // Rehearsed with both columns emptied and their rules taken off, as the migration finds them, and undone afterwards.
    // That empties every farm's rows in this run's database, not only this file's: safe because the files run one at
    // a time (`fileParallelism: false`) and the transaction is rolled back.
    await expect(
      scratchDb().transaction(async (tx) => {
        await tx.execute(sql`
          DROP INDEX "investment_agreement_pay_in_code_uidx";
          DROP INDEX "venture_ordinal_uidx";
          ALTER TABLE "venture" ALTER COLUMN "ordinal" DROP NOT NULL;
          ALTER TABLE "investment_agreement" ALTER COLUMN "pay_in_code" DROP NOT NULL;
          UPDATE "venture" SET "ordinal" = NULL;
          UPDATE "investment_agreement" SET "pay_in_code" = NULL;
        `);
        for (const statement of backfill) {
          // In the migration's order: the Agreements' codes read the Ventures' places the first one writes.
          // oxlint-disable-next-line no-await-in-loop
          await tx.execute(sql.raw(statement));
        }
        const rows = await tx.execute<{
          venture_id: string;
          ordinal: number;
          pay_in_code: string;
          investor_id: string;
        }>(sql`
          SELECT "venture"."id" AS "venture_id", "venture"."ordinal", "investment_agreement"."pay_in_code",
            "investment_agreement"."investor_id"
          FROM "investment_agreement" JOIN "venture" ON "venture"."id" = "investment_agreement"."venture_id"
          WHERE "venture"."farm_id" = ${theFarm().id}
          ORDER BY "investment_agreement"."pay_in_code"
        `);
        read = rows.rows.map((one) => ({
          venture: one.ordinal,
          code: one.pay_in_code,
          investorId: one.investor_id,
        }));
        throw new RolledBackError("undone");
      })
    ).rejects.toBeInstanceOf(RolledBackError);
    // By the day each was opened the third comes first; on the first, the Agreements in the order they were signed.
    expect(read).toEqual([
      { venture: 1, code: "PAY-1-01", investorId: people[0] },
      { venture: 2, code: "PAY-2-01", investorId: people[0] },
      { venture: 2, code: "PAY-2-02", investorId: people[1] },
      { venture: 2, code: "PAY-2-03", investorId: people[2] },
      { venture: 3, code: "PAY-3-01", investorId: people[0] },
    ]);
    // And nothing of the rehearsal stayed.
    expect(await codesOn(first)).toEqual(["PAY-1-01", "PAY-1-02", "PAY-1-03"]);
  });
});
