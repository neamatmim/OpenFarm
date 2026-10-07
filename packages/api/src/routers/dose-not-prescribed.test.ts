import { eq } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { rowsOfRegister } from "../registers/rows";
import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
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

  it("is on the Owner's Withdrawal-ending list while her milk hold is nearly over, and off it once it is", async () => {
    const tag = await aCow(`শেষ হচ্ছে ${suffix}`);
    const manager = await as("manager");
    await manager.client.treatments.giveNotPrescribed({
      animalTag: tag,
      productId: known,
      givenAt: new Date(NOW),
      advice: `জ্বর ${suffix}`,
    });
    const listed = async (at: string) => {
      const owner = await as("owner", at);
      const home = await owner.client.overview.get();
      return home.needsYou.endingWithdrawal.some(
        (one) => one.tagNumber === tag
      );
    };
    // Four days of milk: three and a half days on, nearly over.
    expect(await listed(after(3.5))).toBe(true);
    // Nine days on her milk is clear five days since — her meat still held — and nothing is ending.
    expect(await listed(after(9))).toBe(false);
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

/** Every notice of one kind about one animal, to anybody. */
const toldAbout = async (
  kind: "withdrawal_changed" | "withdrawal_ending",
  tagNumber: string
) => {
  const all = await scratchDb().query.alert.findMany({
    where: { kind, farmId: theFarm().id },
    columns: { params: true },
  });
  return all.filter(
    (one) => (one.params as { tag?: string } | null)?.tag === tagNumber
  );
};

describe("the milk-hold notices", () => {
  const dosed = async (tag: string, productId = known) => {
    const manager = await as("manager");
    await manager.client.treatments.giveNotPrescribed({
      animalTag: tag,
      productId,
      givenAt: new Date(NOW),
      advice: `জ্বর ${suffix}`,
    });
  };

  const sweptAt = async (at: string) => {
    const manager = await as("manager", at);
    await manager.client.alerts.sweep();
  };

  it("are never about a fattening bull: his hold is his meat's, and nobody is told or texted of his milk", async () => {
    const tag = await aCow(`ষাঁড় ${suffix}`);
    await scratchDb()
      .update(animal)
      .set({ sex: "male", side: "fattening", state: "fattening" })
      .where(eq(animal.tagNumber, tag));
    await dosed(tag);
    await sweptAt(after(3.5));

    expect(await toldAbout("withdrawal_changed", tag)).toEqual([]);
    expect(await toldAbout("withdrawal_ending", tag)).toEqual([]);
    // His meat is still held: the gate that matters for him stands.
    const held = await heldUntil(tag);
    expect(held.meat).not.toBeNull();
  });

  it("are not about a cow who died during her hold", async () => {
    const tag = await aCow(`মারা গেছে ${suffix}`);
    await dosed(tag);
    const owner = await as("owner", after(1));
    await owner.client.animals.recordMortality({
      photo: A_DEATH_PHOTO,
      tagNumber: tag,
      kind: "died",
      cause: "test",
      disposal: "buried",
    });
    await sweptAt(after(3.5));

    expect(await toldAbout("withdrawal_ending", tag)).toEqual([]);
  });

  it("tell the Manager when the Vet's days raised hold a cow again whose milk was clear", async () => {
    const vet = await as("vet");
    const product = await vet.client.drugs.create({
      name: { bn: `লেবেল ভুল পড়া ${suffix}` },
      milkWithdrawalDays: 4,
      meatWithdrawalDays: 21,
    });
    const tag = await aCow(`আবার আটকানো ${suffix}`);
    await dosed(tag, product.id);
    const before = await toldAbout("withdrawal_changed", tag);

    // Five days on her milk is clear; the label was read wrong, and it is ten.
    const later = await as("vet", after(5));
    await later.client.drugs.setWithdrawal({
      id: product.id,
      milkWithdrawalDays: 10,
      meatWithdrawalDays: 21,
    });

    const heldNow = await heldUntil(tag);
    expect(heldNow.milk).toBe(after(10));
    const now = await toldAbout("withdrawal_changed", tag);
    expect(now.length - before.length).toBe(1);
  });
});
