import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The week's milk: into the tank against out of the gate, allowing for the tank, and what nobody can account for told to
// the Owner and the Manager in the evening's post past the Owner's line.

const suffix = `milk-account-${Date.now()}`;

let milkingId = "";
let pen = { id: "", tag: "" };

type Role = "owner" | "manager";
const as = (role: Role, instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** The morning milking among the day's work. */
const theMilking = <Row extends { definitionId: string }>(rows: Row[]) =>
  rows.find((row) => row.definitionId === milkingId);

beforeAll(async () => {
  const owner = await as("owner", "2065-01-01T00:00:00.000Z");
  const milking = await owner.client.sops.create({
    content: standardPlaybook().morningMilking,
  });
  milkingId = milking.definitionId;
  const shed = await owner.client.herd.createShed({ name: suffix });
  const made = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `হিসাব পেন ${suffix}`,
  });
  const imported = await owner.client.animals.importRegister({
    csv: [
      "sex,side,state,pen,source,calved_at",
      `female,dairy,milking,হিসাব পেন ${suffix},bought,2064-12-01`,
    ].join("\n"),
  });
  pen = { id: made.id, tag: imported.imported[0]?.tagNumber ?? "" };

  // Ten litres into the tank each morning from the 1st to the 9th, and a litre short of it out of the gate at eight.
  for (let day = 1; day <= 9; day += 1) {
    const morning = `2065-02-0${day}`;
    // Day after day, as the farm lives them.
    // oxlint-disable-next-line no-await-in-loop
    const manager = await as("manager", `${morning}T00:00:00.000Z`);
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.instances.ensureDue();
    // oxlint-disable-next-line no-await-in-loop
    const today = await manager.client.instances.today({ penId: pen.id });
    const work = theMilking(today);
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.instances.claim({ id: work?.id ?? "" });
    // oxlint-disable-next-line no-await-in-loop
    await manager.client.instances.completeStep({
      instanceId: work?.id ?? "",
      stepId: "milk",
      animalTag: pen.tag,
      evidence: [10],
    });
    // oxlint-disable-next-line no-await-in-loop
    const atTheGate = await as("manager", `${morning}T03:00:00.000Z`);
    // oxlint-disable-next-line no-await-in-loop
    await atTheGate.client.milk.dispatch({
      dispatchedAt: new Date(`${morning}T02:00:00.000Z`),
      litres: 9,
      buyer: { name: `মিষ্টির দোকান ${suffix}` },
      challan: `CH-${day}`,
      pricePerLitreBdt: 60,
      fatPercent: 4,
      snfPercent: 8.5,
    });
  }
});

/** The next morning, before any milking. */
const NEXT_MORNING = "2065-02-09T21:00:00.000Z";

const told = async (role: Role) => {
  const rows = await scratchDb().query.alert.findMany({
    where: { kind: "milk_unaccounted", userId: thePerson(role).id },
    columns: { entityId: true, params: true },
  });
  return rows;
};

describe("the week's milk", () => {
  it("sets what went into the tank against what left the gate and what is in it", async () => {
    const manager = await as("manager", NEXT_MORNING);
    const week = await manager.client.milk.account();
    // The last seven farm days are the 4th to the 10th (UTC+6): six mornings milked, ten litres each, and six
    // Dispatches of nine. The short litres of the 1st to the 3rd are before the week, and not in it.
    expect(week).toMatchObject({
      carriedIn: 0,
      toBulk: 60,
      dispatched: 54,
      stillInTank: 0,
      notAccounted: 6,
      notAccountedPercent: 10,
      linePercent: 3,
    });
  });

  it("tells the Owner and the Manager once a farm day while it is past the Owner's line", async () => {
    const sweeping = await as("manager", NEXT_MORNING);
    await sweeping.client.alerts.sweep();
    await sweeping.client.alerts.sweep();
    expect(await told("owner")).toHaveLength(1);
    expect(await told("manager")).toHaveLength(1);
  });

  it("is the Owner's line to move, not the Manager's", async () => {
    const manager = await as("manager", NEXT_MORNING);
    await expect(
      manager.client.farm.setParameters({ milkUnaccountedPercent: 50 })
    ).rejects.toThrow("Owner");
  });
});
