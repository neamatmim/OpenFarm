import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { nominationOnFile, theWhole } from "../test/nominations";
import { appRouter } from "./index";

// An Investor's Nominees, kept as each Nomination on file and never on their record: the latest is the list in force
// for all their Agreements, a list carried over from before Nominations says it was never signed for, and the history
// of who was named, and when, is kept whole.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2063-01-01T04:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(JANUARY) + seconds * 1000);

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(JANUARY),
  });
  return client;
};

let karimId = "";
let nobodysId = "";

beforeAll(async () => {
  const owner = await as("owner");
  const karim = await owner.investors.record({
    name: `করিম ${suffix}`,
    phone: `0171${suffix}`,
  });
  karimId = karim.id;
  const nobody = await owner.investors.record({
    name: `রহিম ${suffix}`,
    phone: `0172${suffix}`,
  });
  nobodysId = nobody.id;
});

describe("an Investor's Nominees", () => {
  it("are none for somebody who has never had any on file", async () => {
    const owner = await as("owner");

    const { people } = await owner.investors.list();

    expect(people.find((one) => one.id === nobodysId)?.nomination).toBeNull();
    expect(await owner.investors.nominations({ id: nobodysId })).toEqual([]);
  });

  it("are the latest Nomination on file, even two signed the same day and recorded at the same moment", async () => {
    const owner = await as("owner");
    await nominationOnFile({
      investorId: karimId,
      nominees: [theWhole(`আগের নমিনি ${suffix}`)],
      signedOn: "2062-12-01",
      recordedAt: at(0),
    });
    // Two recorded in one moment: the one recorded second is in force, by the order the farm made them.
    await nominationOnFile({
      investorId: karimId,
      how: "nomination",
      nominees: [{ ...theWhole(`প্রথম ${suffix}`), bornOn: "1980-01-01" }],
      signedOn: "2063-01-01",
      recordedAt: at(1),
    });
    await nominationOnFile({
      investorId: karimId,
      how: "nomination",
      nominees: [
        {
          ...theWhole(`দ্বিতীয় ${suffix}`),
          bornOn: "1980-01-01",
          sharePercent: 50,
        },
        {
          ...theWhole(`নাতি ${suffix}`, "নাতি"),
          bornOn: "2055-01-01",
          sharePercent: 50,
          receiver: { name: `দ্বিতীয় ${suffix}`, relation: "মা", phone: null },
        },
      ],
      signedOn: "2063-01-01",
      recordedAt: at(1),
    });

    const { people } = await owner.investors.list();
    const history = await owner.investors.nominations({ id: karimId });

    expect(people.find((one) => one.id === karimId)?.nomination).toMatchObject({
      how: "nomination",
      signedOn: "2063-01-01",
      nominees: [
        { name: `দ্বিতীয় ${suffix}`, sharePercent: 50, minor: false },
        { name: `নাতি ${suffix}`, minor: true, receiver: { relation: "মা" } },
      ],
    });
    // Every one kept, newest first; the one carried over says it was never signed for.
    expect(history.map((one) => [one.how, one.nominees[0]?.name])).toEqual([
      ["nomination", `দ্বিতীয় ${suffix}`],
      ["nomination", `প্রথম ${suffix}`],
      ["carried_over", `আগের নমিনি ${suffix}`],
    ]);
  });

  it("are not written on the Investor's record, whatever a correction sends", async () => {
    const owner = await as("owner");
    const before = await owner.investors.nominations({ id: karimId });

    await owner.investors.update({
      id: karimId,
      name: `করিম ${suffix}`,
      phone: `0171${suffix}`,
      // Not a field of the record any more: a correction that carries one changes nobody's Nominees.
      ...({ nominee: { name: "অন্য কেউ" } } as object),
    });

    expect(await owner.investors.nominations({ id: karimId })).toEqual(before);
  });

  it("are the Owner's alone to read", async () => {
    const manager = await as("manager");

    await expect(
      manager.investors.nominations({ id: karimId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
