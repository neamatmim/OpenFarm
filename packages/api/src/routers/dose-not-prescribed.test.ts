import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { rowsOfRegister } from "../registers/rows";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A dose not prescribed: the pharmacy's advice, given before the Vet saw her, written afterwards by the Manager so her
// milk and her meat are held as any dose holds them — and the Vet told of it at once.

const suffix = `dose-not-prescribed-${Date.now()}`;
const NOW = "2074-03-10T06:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

const as = (role: "owner" | "manager" | "vet" | "staff", instant = NOW) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let known = "";
let unknown = "";
let penId = "";

beforeAll(async () => {
  const owner = await as("owner");
  const vet = await as("vet");
  const manager = await as("manager");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `গাভী পেন ${suffix}`,
  });
  penId = pen.id;
  const product = await vet.client.drugs.create({
    name: { bn: `অক্সিটেট্রাসাইক্লিন ${suffix}` },
    milkWithdrawalDays: 4,
    meatWithdrawalDays: 21,
  });
  known = product.id;
  // Bought at the pharmacy and not yet read off the label by the Vet: no days.
  const blank = await manager.client.drugs.create({
    name: { bn: `ফার্মেসির ইনজেকশন ${suffix}` },
  });
  unknown = blank.id;
});

const aCow = async (name: string) => {
  const owner = await as("owner");
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId,
    source: "born",
    aliases: [name],
  });
  return cow.tagNumber;
};

const heldUntil = async (tagNumber: string) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { tagNumber, farmId: theFarm().id },
    columns: { milkWithdrawalUntil: true, meatWithdrawalUntil: true },
  });
  return {
    milk: her?.milkWithdrawalUntil?.toISOString() ?? null,
    meat: her?.meatWithdrawalUntil?.toISOString() ?? null,
  };
};

/** What the Manager has been told of holds starting or changing. */
const heldNews = () =>
  scratchDb().query.alert.findMany({
    where: {
      kind: "withdrawal_changed",
      userId: thePerson("manager").id,
    },
    columns: { params: true },
  });

const after = (days: number) =>
  new Date(new Date(NOW).getTime() + days * DAY_MS).toISOString();

describe("a dose not prescribed", () => {
  it("holds her milk and her meat for the product's own days", async () => {
    const tag = await aCow(`জ্বর ${suffix}`);
    const manager = await as("manager");
    await manager.client.treatments.giveNotPrescribed({
      animalTag: tag,
      productId: known,
      givenAt: new Date(NOW),
      advice: "জ্বর, ফার্মেসির পরামর্শে",
    });
    expect(await heldUntil(tag)).toEqual({ milk: after(4), meat: after(21) });
  });

  it("is refused for a product with no days until the Vet writes the farm's default", async () => {
    const tag = await aCow(`ইনজেকশন ${suffix}`);
    const manager = await as("manager");
    await expect(
      manager.client.treatments.giveNotPrescribed({
        animalTag: tag,
        productId: unknown,
        givenAt: new Date(NOW),
        advice: "পাতলা পায়খানা, দোকানের পরামর্শে",
      })
    ).rejects.toMatchObject({ data: { refusal: "ask_the_vet_for_days" } });
    expect(await heldUntil(tag)).toEqual({ milk: null, meat: null });
  });

  it("takes the Vet's Default Withdrawal Days, kept on the dose, when its product has none", async () => {
    const vet = await as("vet");
    await vet.client.drugs.setDefaultDays({ milkDays: 7, meatDays: 28 });
    const tag = await aCow(`ডিফল্ট ${suffix}`);
    const manager = await as("manager");
    const dose = await manager.client.treatments.giveNotPrescribed({
      animalTag: tag,
      productId: unknown,
      givenAt: new Date(NOW),
      advice: "পাতলা পায়খানা, দোকানের পরামর্শে",
    });
    expect(await heldUntil(tag)).toEqual({ milk: after(7), meat: after(28) });
    const row = await scratchDb().query.treatment.findFirst({
      where: { id: dose.id },
      columns: {
        milkWithdrawalDays: true,
        meatWithdrawalDays: true,
        prescriptionId: true,
        instanceId: true,
      },
    });
    expect(row).toEqual({
      milkWithdrawalDays: 7,
      meatWithdrawalDays: 28,
      prescriptionId: null,
      instanceId: null,
    });
  });

  it("stands on the treatment register, why it was given and when she is clear", async () => {
    const vet = await as("vet");
    await vet.client.drugs.setDefaultDays({ milkDays: 7, meatDays: 28 });
    const tag = await aCow(`খাতা ${suffix}`);
    const manager = await as("manager");
    const dose = await manager.client.treatments.giveNotPrescribed({
      animalTag: tag,
      productId: unknown,
      givenAt: new Date(NOW),
      advice: `কাশি, ফার্মেসির পরামর্শে ${suffix}`,
    });
    const rows = await manager.client.inspectorView.rows({
      register: "treatment_register",
      from: "2074-03-01",
      to: "2074-03-31",
    });
    expect(
      rowsOfRegister(rows, "treatment_register").find(
        (row) => row.id === dose.id
      )
    ).toMatchObject({
      tagNumber: tag,
      diagnosis: `কাশি, ফার্মেসির পরামর্শে ${suffix}`,
      prescribedBy: null,
      // The Vet's Default Withdrawal Days, seven and twenty-eight, from the day it was given.
      milkClearOn: "2074-03-17",
      meatClearOn: "2074-04-07",
    });
  });

  it("is told to the Vet once, by the sweep", async () => {
    const tag = await aCow(`বলা ${suffix}`);
    const manager = await as("manager");
    const dose = await manager.client.treatments.giveNotPrescribed({
      animalTag: tag,
      productId: known,
      givenAt: new Date(NOW),
      advice: `গা গরম ${suffix}`,
    });
    await manager.client.alerts.sweep();
    await manager.client.alerts.sweep();
    const told = await scratchDb().query.alert.findMany({
      where: { kind: "dose_not_prescribed", entityId: dose.id },
      columns: { userId: true, params: true },
    });
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({
      userId: thePerson("vet").id,
      params: { tag, advice: `গা গরম ${suffix}` },
    });
  });

  it("tells the Manager her milk is held from now, once, and not again for a second dose inside the hold", async () => {
    const tag = await aCow(`দুধ আটকানো ${suffix}`);
    const manager = await as("manager");
    const already = await heldNews();
    const before = already.length;
    await manager.client.treatments.giveNotPrescribed({
      animalTag: tag,
      productId: known,
      givenAt: new Date(NOW),
      advice: `জ্বর ${suffix}`,
    });
    // A second dose the next morning only lengthens the hold she is already under: nothing new for the tank.
    const nextDay = await as("manager", after(1));
    await nextDay.client.treatments.giveNotPrescribed({
      animalTag: tag,
      productId: known,
      givenAt: new Date(after(1)),
      advice: `জ্বর ${suffix}`,
    });
    const now = await heldNews();
    expect(now.length - before).toBe(1);
  });

  it("is the Owner's or the Manager's to write, and the default days the Vet's alone", async () => {
    const tag = await aCow(`কর্মী ${suffix}`);
    const staff = await as("staff");
    await expect(
      staff.client.treatments.giveNotPrescribed({
        animalTag: tag,
        productId: known,
        givenAt: new Date(NOW),
        advice: "জ্বর",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const manager = await as("manager");
    await expect(
      manager.client.drugs.setDefaultDays({ milkDays: 1, meatDays: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cannot have been given at a time not yet come", async () => {
    const tag = await aCow(`পরে ${suffix}`);
    const manager = await as("manager");
    await expect(
      manager.client.treatments.giveNotPrescribed({
        animalTag: tag,
        productId: known,
        givenAt: new Date(after(1)),
        advice: "জ্বর",
      })
    ).rejects.toMatchObject({ data: { refusal: "given_in_the_future" } });
  });
});
