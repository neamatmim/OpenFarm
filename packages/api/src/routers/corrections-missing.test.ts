import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Records that had no Correction at all, so a slip stood for good: a Vet Fee, a dose not prescribed, a sighting off the
// round, what an animal is.

const suffix = `${Date.now()}`;
const NOW = "2096-03-10T04:00:00.000Z";

const as = (role: "owner" | "manager" | "vet" | "staff", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const feeMoney = async (feeId: string) => {
  const money = await scratchDb().query.moneyEvent.findFirst({
    where: { source: "vet_fee", sourceId: feeId },
    columns: { amountMoney: true },
  });
  return money?.amountMoney;
};

describe("a Vet Fee", () => {
  it("is put right by the Vet who charged it, its money with it", async () => {
    const vet = await as("vet");
    const fee = await vet.client.money.vetFee({
      amountMoney: 15_000,
      visitedOn: "2096-03-09",
      paymentMethod: "cash",
      note: `দেখা ${suffix}`,
    });

    await vet.client.money.correctVetFee({
      id: fee.id,
      reason: "একটা শূন্য বেশি",
      changes: { amountMoney: { from: 15_000, to: 1500 } },
    });

    expect(await feeMoney(fee.id)).toBe(1500);
  });

  it("written twice, is voided by the Owner, and its money is gone", async () => {
    const vet = await as("vet");
    const fee = await vet.client.money.vetFee({
      amountMoney: 2000,
      visitedOn: "2096-03-09",
      paymentMethod: "cash",
    });
    const owner = await as("owner");

    await owner.client.money.correctVetFee({
      id: fee.id,
      reason: "দুবার লেখা",
      changes: { voided: { from: false, to: true } },
    });

    expect(await feeMoney(fee.id)).toBeUndefined();
  });
});

describe("what an animal is", () => {
  it("is put right — breed, birth date, dam — and her sex refused once a calf of hers rests on it", async () => {
    const owner = await as("owner");
    const shed = await owner.client.sheds.create({ name: `facts-${suffix}` });
    const pen = await owner.client.sheds.pens.create({
      shedId: shed.id,
      name: `পেন ${suffix}`,
    });
    const register = () =>
      owner.client.animals.register({
        sex: "female",
        side: "dairy",
        state: "heifer",
        penId: pen.id,
        source: "born",
        aliases: [],
      });
    const mother = await register();
    const calf = await register();
    const breeds = await owner.client.breeds.list();
    const sahiwal = breeds.find((one) => one.key === "sahiwal")?.id ?? "";

    await owner.client.animals.correctFacts({
      tagNumber: calf.tagNumber,
      reason: "গেটে জাত লেখা হয়নি",
      changes: {
        breedId: { from: null, to: sahiwal },
        birthDate: { from: null, to: "2095-12-01" },
        damTag: { from: null, to: mother.tagNumber },
      },
    });

    const hers = await scratchDb().query.animal.findFirst({
      where: { tagNumber: calf.tagNumber, farmId: theFarm().id },
      columns: { breedId: true, damId: true },
    });
    const mothers = await scratchDb().query.animal.findFirst({
      where: { tagNumber: mother.tagNumber, farmId: theFarm().id },
      columns: { id: true },
    });
    expect(hers).toEqual({ breedId: sahiwal, damId: mothers?.id });
    await expect(
      owner.client.animals.correctFacts({
        tagNumber: mother.tagNumber,
        reason: "ভুল লিঙ্গ",
        changes: { sex: { from: "female", to: "male" } },
      })
    ).rejects.toMatchObject({ data: { refusal: "sex_rests_on_breeding" } });
  });
});

describe("a Correction of something the farm does not have", () => {
  it("says so by a word, not 'No such step' in English", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.work.correctStep({
        id: `not-sent-yet-${suffix}`,
        reason: "ভুল লিটার",
        changes: {
          answer: {
            from: {
              skipReason: null,
              evidence: [1],
              destination: null,
              outOfRange: null,
            },
            to: { evidence: [2] },
          },
        },
      })
    ).rejects.toMatchObject({ data: { refusal: "not_on_the_farm" } });
  });
});
