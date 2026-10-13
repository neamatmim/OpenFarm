import { standardPlaybook } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Milk for the house and the staff, and a cow giving less in front of the Vet.
//
// The house's milk had nowhere to go: a Dispatch needs a buyer and a price, so it went to the tank and out of the back
// door, and every week the farm was short by it — "not accounted for", told to the Owner past her line. Now it is
// a Destination of its own at milking, like the calves', that never reaches the tank and books no money.

const suffix = `house-milk-${Date.now()}`;

let milkingId = "";
let pen = { id: "" };
let cows = { inTheTank: "", forTheHouse: "" };

type Role = "owner" | "manager" | "staff" | "vet";

/** The morning milking among the day's work. */
const theMilking = <Row extends { definitionId: string }>(rows: Row[]) =>
  rows.find((row) => row.definitionId === milkingId);
const as = (role: Role, instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** The next morning, before any milking: the farm's 10th (UTC+6). */
const NEXT_MORNING = "2065-02-09T21:00:00.000Z";

beforeAll(async () => {
  const owner = await as("owner", "2065-01-01T00:00:00.000Z");
  const milking = await owner.client.sops.create({
    content: standardPlaybook().morningMilking,
  });
  milkingId = milking.definitionId;
  const shed = await owner.client.sheds.create({ name: suffix });
  const made = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `বাড়ির পেন ${suffix}`,
  });
  const imported = await owner.client.animals.importRegister({
    csv: [
      "sex,side,state,pen,source,calved_at",
      `female,dairy,milking,বাড়ির পেন ${suffix},bought,2064-12-01`,
      `female,dairy,milking,বাড়ির পেন ${suffix},bought,2064-12-01`,
    ].join("\n"),
  });
  pen = { id: made.id };
  cows = {
    inTheTank: imported.imported[0]?.tagNumber ?? "",
    forTheHouse: imported.imported[1]?.tagNumber ?? "",
  };

  // Each morning from the 1st to the 9th: the first cow's milk to the tank, all of it collected; the second cow's two
  // liters to the house. The first cow gives ten a morning until the 8th, then four — giving less.
  for (let day = 1; day <= 9; day += 1) {
    const morning = `2065-02-0${day}`;
    const inTheTank = day >= 8 ? 4 : 10;
    // Day after day, as the farm lives them.
    // oxlint-disable-next-line no-await-in-loop
    const manager = await as("manager", `${morning}T00:00:00.000Z`);
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.work.ensureDue();
    // oxlint-disable-next-line no-await-in-loop
    const today = await manager.client.work.today({ penId: pen.id });
    const work = theMilking(today);
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.work.claim({ id: work?.id ?? "" });
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.work.completeStep({
      instanceId: work?.id ?? "",
      stepId: "milk",
      animalTag: cows.inTheTank,
      evidence: [inTheTank],
    });
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.work.completeStep({
      instanceId: work?.id ?? "",
      stepId: "milk",
      animalTag: cows.forTheHouse,
      evidence: [2],
      destination: "house",
    });
    // oxlint-disable-next-line no-await-in-loop
    const atTheGate = await as("manager", `${morning}T03:00:00.000Z`);
    // oxlint-disable-next-line no-await-in-loop
    await atTheGate.client.milk.dispatch({
      dispatchedAt: new Date(`${morning}T02:00:00.000Z`),
      liters: inTheTank,
      buyer: { name: `মিষ্টির দোকান ${suffix}` },
      pricePerLiterMoney: 60,
    });
  }
});

describe("milk for the house", () => {
  it("is milk the farm can account for: never in the tank, said apart, and nothing left over", async () => {
    const manager = await as("manager", NEXT_MORNING);
    const week = await manager.client.milk.account();
    // The 4th to the 10th: six mornings. Ten a morning to the tank on the 4th to the 7th, four on the 8th and 9th — all
    // of it collected — and two liters a morning to the house.
    expect(week).toMatchObject({
      toBulk: 48,
      dispatched: 48,
      stillInTank: 0,
      notAccounted: 0,
      toHouse: 12,
    });
  });

  it("is never told to the Owner as milk nobody can account for", async () => {
    const sweeping = await as("manager", NEXT_MORNING);
    await sweeping.client.alerts.sweep();
    const told = await scratchDb().query.alert.findMany({
      where: { kind: "milk_unaccounted", userId: thePerson("owner").id },
    });
    expect(told).toHaveLength(0);
  });

  it("books no money: only the milk that left the gate did", async () => {
    const booked = await scratchDb().query.moneyEvent.findMany({
      where: { farmId: theFarm().id },
      columns: { source: true },
    });
    expect(booked.length).toBeGreaterThan(0);
    expect(booked.every((one) => one.source === "dispatch")).toBe(true);
  });

  it("is kept as the house's on the cow's own record", async () => {
    const records = await scratchDb().query.milkRecord.findMany({
      where: { farmId: theFarm().id, destination: "house" },
      columns: { liters: true },
    });
    expect(records).toHaveLength(9);
  });
});

describe("a cow giving less, in front of the Vet", () => {
  const theCow = () => cows.inTheTank;

  it("is on the Vet's list as on the Manager's", async () => {
    const vet = await as("vet", NEXT_MORNING);
    const list = await vet.client.milk.givingLess();
    const her = list.find((one) => one.tag === theCow());
    expect(her).toMatchObject({ lately: 4, usually: 10, seenTo: null });
  });

  it("is never Barn Staff's to read", async () => {
    const staff = await as("staff", NEXT_MORNING);
    await expect(staff.client.milk.givingLess()).rejects.toThrow();
  });

  it("counts a withdrawn Observation as nobody having asked", async () => {
    const manager = await as("manager", NEXT_MORNING);
    const { id } = await manager.client.observations.record({
      tagNumber: theCow(),
      saw: "giving_less",
    });
    await manager.client.observations.withdraw({
      id,
      reason: "the wrong cow",
      changes: { withdrawn: { from: false, to: true } },
    });
    const vet = await as("vet", NEXT_MORNING);
    const list = await vet.client.milk.givingLess();
    const her = list.find((one) => one.tag === theCow());
    expect(her?.seenTo).toBeNull();
  });

  it("is put in front of the Vet by an Observation, and the list says she has been", async () => {
    const manager = await as("manager", NEXT_MORNING);
    const { id } = await manager.client.observations.record({
      tagNumber: theCow(),
      saw: "giving_less",
    });
    const seen = await scratchDb().query.observation.findFirst({
      where: { id },
      columns: { saw: true },
    });
    expect(seen?.saw).toBe("giving_less");

    const vet = await as("vet", NEXT_MORNING);
    const list = await vet.client.milk.givingLess();
    const her = list.find((one) => one.tag === theCow());
    expect(her?.seenTo).toMatchObject({ by: "asked" });
  });
});
