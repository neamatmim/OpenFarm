import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A procedure published for the first time catches up with the animals already on their way — work still ahead of
// the publishing is raised, work that would already be overdue is not, and a later Version raises nothing again.

const suffix = `catch-up-${Date.now()}`;
/** Twenty days before the release is published: still ten days of Quarantine to go. */
const ARRIVED_A = "2039-03-01T04:00:00.000Z";
/** Fifty days before it: his release would already be overdue. */
const ARRIVED_B = "2039-01-30T04:00:00.000Z";
const PUBLISHED = "2039-03-21T04:00:00.000Z";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const bullArriving = async (penId: string, at: string) => {
  const manager = await as("manager", at);
  const arrived = await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 18,
    arrivedAt: new Date(at),
    targetWindowStart: "2039-08-01",
    targetWindowEnd: "2039-08-05",
  });
  return arrived.tagNumber;
};

const setup = async () => {
  const manager = await as("manager", ARRIVED_B);
  const shed = await manager.client.herd.createShed({ name: suffix });
  const pen = await manager.client.herd.createPen({
    shedId: shed.id,
    name: "কোয়ারেন্টিন",
  });
  const late = await bullArriving(pen.id, ARRIVED_B);
  const onHisWay = await bullArriving(pen.id, ARRIVED_A);
  // Published after both came.
  const owner = await as("owner", PUBLISHED);
  const playbook = standardPlaybook();
  const release = await owner.client.sops.create({
    content: playbook.quarantineRelease,
  });
  const arrival = await owner.client.sops.create({
    content: playbook.arrivalCheck,
  });
  const turning = await as("manager", "2039-03-21T05:00:00.000Z");
  await turning.client.instances.ensureDue();
  return {
    tags: { onHisWay, late },
    sops: { release: release.definitionId, arrival: arrival.definitionId },
  };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** The work one procedure raised about one animal. */
const workAbout = async (definitionId: string, tagNumber: string) => {
  const manager = await as("manager", "2039-03-21T06:00:00.000Z");
  const him = await manager.client.animals.byTag({ tagNumber });
  return await scratchDb().query.sopInstance.findMany({
    where: { definitionId, animalId: him.id },
    columns: { dueAt: true },
  });
};

describe("a procedure published after the animals came", () => {
  it("hangs the release of a bull still in his thirty days, on the day they end", async () => {
    const rows = await workAbout(world.sops.release, world.tags.onHisWay);
    // In on the 1st of March, Dhaka time: out on the farm's 31st.
    expect(rows.map((one) => one.dueAt.toISOString())).toEqual([
      "2039-03-30T18:00:00.000Z",
    ]);
  });

  it("raises nothing that would already be overdue", async () => {
    expect(await workAbout(world.sops.release, world.tags.late)).toEqual([]);
    // His arrival check fell due the day he came, long before it was written.
    expect(await workAbout(world.sops.arrival, world.tags.onHisWay)).toEqual(
      []
    );
  });

  it("raises nothing again under a later Version", async () => {
    const owner = await as("owner", "2039-03-22T04:00:00.000Z");
    const shorter = standardPlaybook().quarantineRelease;
    await owner.client.sops.publish({
      definitionId: world.sops.release,
      content: {
        ...shorter,
        triggers: [{ kind: "state", state: "quarantine", offsetDays: 25 }],
      },
      note: "পঁচিশ দিন",
    });
    const turning = await as("manager", "2039-03-22T05:00:00.000Z");
    await turning.client.instances.ensureDue();
    expect(
      await workAbout(world.sops.release, world.tags.onHisWay)
    ).toHaveLength(1);
  });
});
