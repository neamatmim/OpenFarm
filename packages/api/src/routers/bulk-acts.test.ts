import { randomUUID } from "node:crypto";

import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A pen at a time: before Eid the farm suggests a whole shed as ready at once, and a pharmacy's advice is given to a
// whole group of calves. Each animal still goes through her own door — her Withdrawal checked, her dose recorded and
// held as one tap would — and one refused never stops the rest.

const suffix = `bulk-acts-${Date.now()}`;
const NOW = "2075-04-10T06:00:00.000Z";

const as = (role: "owner" | "manager" | "staff") =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(NOW) });

let penName = "";
let productId = "";

beforeAll(async () => {
  const owner = await as("owner");
  const shed = await owner.client.sheds.create({ name: suffix });
  penName = `ষাঁড় পেন ${suffix}`;
  await owner.client.sheds.pens.create({ shedId: shed.id, name: penName });
  const vet = await createTestClient(appRouter, {
    as: "vet",
    clock: new FakeClock(NOW),
  });
  const product = await vet.client.drugs.create({
    name: { bn: `কৃমিনাশক ${suffix}` },
    milkWithdrawalDays: 3,
    meatWithdrawalDays: 14,
  });
  productId = product.id;
});

/** Bulls standing on the Fattening side, brought in by the opening register. */
const bulls = async (count: number) => {
  const owner = await as("owner");
  const rows = Array.from(
    { length: count },
    () => `male,fattening,fattening,${penName},bought`
  );
  const result = await owner.client.animals.importRegister({
    csv: ["sex,side,state,pen,source", ...rows].join("\n"),
  });
  return result.imported.map((one) => one.tagNumber);
};

/** Each animal with the id her dose is written under, as the screen sends them: sent again, the same ids. */
const dosing = (tags: readonly string[]) =>
  tags.map((tagNumber) => ({ tagNumber, id: randomUUID() }));

/** How many doses she has been written. */
const dosesOf = async (tagNumber: string) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber },
    columns: { id: true },
  });
  const doses = await scratchDb().query.treatment.findMany({
    where: { animalId: her?.id ?? "" },
    columns: { id: true },
  });
  return doses.length;
};

const meatHeldUntil = async (tagNumber: string) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber },
    columns: { meatWithdrawalUntil: true },
  });
  return her?.meatWithdrawalUntil ?? null;
};

describe("one dose for several animals", () => {
  it("records a dose for each, each held, and names the one it could not dose without stopping the rest", async () => {
    const tags = await bulls(3);
    const manager = await as("manager");

    const result = await manager.client.treatments.giveNotPrescribedMany({
      animals: dosing([...tags, "F-99999"]),
      productId,
      advice: "ফার্মেসির পরামর্শে কৃমিনাশক",
    });

    expect(result.given.toSorted()).toEqual(tags.toSorted());
    expect(result.refused).toMatchObject([{ tagNumber: "F-99999" }]);
    const held = await Promise.all(tags.map((tag) => meatHeldUntil(tag)));
    expect(held.every((until) => until !== null)).toBe(true);
  });

  it("is refused to Barn Staff, as one dose is", async () => {
    const [tag] = await bulls(1);
    const staff = await as("staff");
    await expect(
      staff.client.treatments.giveNotPrescribedMany({
        animals: dosing([tag ?? ""]),
        productId,
        advice: "ফার্মেসির পরামর্শে",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sent again after a dropped answer, doses nobody twice and still names everyone done", async () => {
    const tags = await bulls(2);
    const manager = await as("manager");
    const animals = dosing(tags);
    const ask = {
      animals,
      productId,
      advice: "ফার্মেসির পরামর্শে",
    };

    await manager.client.treatments.giveNotPrescribedMany(ask);
    const again = await manager.client.treatments.giveNotPrescribedMany(ask);

    expect(again.given.toSorted()).toEqual(tags.toSorted());
    expect(again.refused).toEqual([]);
    const counts = await Promise.all(tags.map((tag) => dosesOf(tag)));
    expect(counts).toEqual([1, 1]);
  });

  it("counts one animal written two ways as one", async () => {
    const [tag] = await bulls(1);
    const manager = await as("manager");
    const result = await manager.client.treatments.giveNotPrescribedMany({
      animals: dosing([tag ?? "", (tag ?? "").toLowerCase()]),
      productId,
      advice: "ফার্মেসির পরামর্শে",
    });

    expect(result.given).toEqual([tag]);
    expect(await dosesOf(tag ?? "")).toBe(1);
  });

  it("refuses the whole request, writing nobody, for a medicine that may not be given", async () => {
    const tags = await bulls(2);
    const vet = await createTestClient(appRouter, {
      as: "vet",
      clock: new FakeClock(NOW),
    });
    const retired = await vet.client.drugs.create({
      name: { bn: `পুরনো ওষুধ ${suffix}` },
      milkWithdrawalDays: 1,
      meatWithdrawalDays: 1,
    });
    await vet.client.drugs.retire({ id: retired.id });
    const manager = await as("manager");

    await expect(
      manager.client.treatments.giveNotPrescribedMany({
        animals: dosing(tags),
        productId: retired.id,
        advice: "ফার্মেসির পরামর্শে",
      })
    ).rejects.toMatchObject({ data: { refusal: "product_retired" } });
    await expect(
      manager.client.treatments.giveNotPrescribedMany({
        animals: dosing(tags),
        productId: "no-such-medicine",
        advice: "ফার্মেসির পরামর্শে",
      })
    ).rejects.toMatchObject({ data: { refusal: "no_such_product" } });
    const counts = await Promise.all(tags.map((tag) => dosesOf(tag)));
    expect(counts).toEqual([0, 0]);
  });
});

describe("several confirmed ready at once", () => {
  it("makes each ready that may be, and says which is still held and until when", async () => {
    const [free, alsoFree, held] = await bulls(3);
    const manager = await as("manager");
    await manager.client.treatments.giveNotPrescribed({
      animalTag: held ?? "",
      productId,
      advice: "ফার্মেসির পরামর্শে",
    });

    const result = await manager.client.readyForSale.confirmMany({
      tagNumbers: [free ?? "", alsoFree ?? "", held ?? ""],
    });

    expect(result.confirmed.toSorted()).toEqual([free, alsoFree].toSorted());
    expect(result.refused).toMatchObject([
      { tagNumber: held, refusal: "meat_withdrawal" },
    ]);
    const fitOn = await meatHeldUntil(held ?? "");
    expect(result.refused[0]?.fitOn).toBe(fitOn?.toISOString());
    const owner = await as("owner");
    const her = await owner.client.animals.get({ tagNumber: free ?? "" });
    expect(her.state).toBe("ready_for_sale");
    const still = await owner.client.animals.get({ tagNumber: held ?? "" });
    expect(still.state).toBe("fattening");
  });

  it("is refused to Barn Staff", async () => {
    const [tag] = await bulls(1);
    const staff = await as("staff");
    await expect(
      staff.client.readyForSale.confirmMany({ tagNumbers: [tag ?? ""] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sent again, counts one already made ready as confirmed, not refused", async () => {
    const tags = await bulls(2);
    const manager = await as("manager");
    await manager.client.readyForSale.confirmMany({ tagNumbers: tags });

    const again = await manager.client.readyForSale.confirmMany({
      tagNumbers: tags,
    });

    expect(again.confirmed.toSorted()).toEqual(tags.toSorted());
    expect(again.refused).toEqual([]);
  });

  it("counts one animal written two ways as one", async () => {
    const [tag] = await bulls(1);
    const manager = await as("manager");
    const result = await manager.client.readyForSale.confirmMany({
      tagNumbers: [tag ?? "", (tag ?? "").toLowerCase()],
    });

    expect(result.confirmed).toEqual([tag]);
    expect(result.refused).toEqual([]);
  });
});
