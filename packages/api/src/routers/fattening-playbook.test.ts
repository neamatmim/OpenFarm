import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The bought-in bull's chain from the Standard Playbook: work raised from his own arrival, and thirty days on, let
// out of Quarantine to the Pen whose Ration's Weight Band suits what the scale last said of him.

const suffix = `chain-${Date.now()}`;
const ARRIVED = "2038-01-05T04:00:00.000Z";
/** A day past his thirty days in Quarantine. */
const RELEASE_DAY = "2038-02-05T05:00:00.000Z";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const setup = async () => {
  const owner = await as("owner", ARRIVED);
  const playbook = standardPlaybook();
  const release = await owner.client.sops.create({
    content: playbook.quarantineRelease,
  });
  const arrival = await owner.client.sops.create({
    content: playbook.arrivalCheck,
  });
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.herd.createShed({ name: suffix });
  const pen = async (name: string) =>
    await manager.client.herd.createPen({ shedId: shed.id, name });
  const quarantine = await pen("কোয়ারেন্টিন");
  const growers = await pen("গ্রোয়ার");
  const finishers = await pen("ফিনিশার");
  const straw = await manager.client.feed.addItem({
    name: { bn: `খড় ${suffix}` },
  });
  const banded = async (
    name: string,
    penId: string,
    band: { fromKg: number | null; toKg: number | null }
  ) => {
    const saved = await manager.client.feed.saveRation({
      name: { bn: `${name} ${suffix}` },
      items: [{ feedItemId: straw.id, kgPer100KgPerDay: 1 }],
      band,
    });
    await manager.client.feed.assignRation({
      penId,
      rationId: saved.rationId,
    });
  };
  await banded("গ্রোয়ার", growers.id, { fromKg: 150, toKg: 250 });
  await banded("ফিনিশার", finishers.id, { fromKg: 250, toKg: null });
  const bull = async (weightKg: number) => {
    const arrived = await manager.client.intake.record({
      penId: quarantine.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 60_000,
      weightKg,
      estimatedAgeMonths: 18,
      arrivedAt: new Date(ARRIVED),
      targetWindowStart: "2038-06-01",
      targetWindowEnd: "2038-06-05",
    });
    return arrived.tagNumber;
  };
  const heifer = await manager.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: quarantine.id,
    source: "born",
    aliases: [],
  });
  return {
    sops: { release: release.definitionId, arrival: arrival.definitionId },
    pens: { quarantine, growers, finishers },
    heifer: heifer.tagNumber,
    tags: {
      grower: await bull(180),
      light: await bull(120),
      unwell: await bull(200),
    },
  };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** The open work one procedure raised about one animal, once the day is turned at `at`. */
const workAbout = async (
  at: string,
  definitionId: string,
  tagNumber: string
) => {
  const manager = await as("manager", at);
  await manager.client.instances.ensureDue();
  const him = await manager.client.animals.byTag({ tagNumber });
  const rows = await scratchDb().query.sopInstance.findMany({
    where: { definitionId, animalId: him.id },
    columns: { id: true, state: true, dueAt: true },
  });
  return { manager, rows };
};

/** His release, walked as the Manager walks it: well, every dose given, let out — or kept in. */
const releaseHim = async (tagNumber: string, { kept = false } = {}) => {
  const { manager, rows } = await workAbout(
    RELEASE_DAY,
    world.sops.release,
    tagNumber
  );
  const [work] = rows;
  if (!work) {
    throw new Error("expected his release to be due");
  }
  await manager.client.instances.claim({ id: work.id });
  for (const stepId of ["healthy", "doses", "release"]) {
    const skipping = kept && stepId !== "doses";
    // oxlint-disable-next-line no-await-in-loop -- the steps are walked in their order
    await manager.client.instances.completeStep({
      instanceId: work.id,
      stepId,
      animalTag: tagNumber,
      evidence: skipping ? [] : [true],
      ...(skipping ? { skipReason: "অসুস্থ — কোয়ারেন্টিনে থাকবে" } : {}),
    });
  }
  return await manager.client.animals.byTag({ tagNumber });
};

describe("the bought-in bull's chain", () => {
  it("raises his arrival check the day he comes, and none for a heifer born the same day", async () => {
    const bull = await workAbout(
      "2038-01-05T05:00:00.000Z",
      world.sops.arrival,
      world.tags.grower
    );
    expect(bull.rows).toHaveLength(1);
    const heifer = await workAbout(
      "2038-01-05T05:00:00.000Z",
      world.sops.arrival,
      world.heifer
    );
    expect(heifer.rows).toEqual([]);
  });

  it("hangs his release on the morning his thirty days are up", async () => {
    const hung = await workAbout(
      "2038-01-20T05:00:00.000Z",
      world.sops.release,
      world.tags.grower
    );
    // Arrived on the 5th of January, Dhaka time: due from the start of the farm's 4th of February.
    expect(hung.rows.map((one) => one.dueAt.toISOString())).toEqual([
      "2038-02-03T18:00:00.000Z",
    ]);
  });

  it("lets him out to the Pen whose Ration's band suits his weight", async () => {
    const him = await releaseHim(world.tags.grower);
    expect(him).toMatchObject({
      state: "fattening",
      pen: { id: world.pens.growers.id },
    });
  });

  it("lets out a bull no band suits where he stands, for the Manager to move", async () => {
    const him = await releaseHim(world.tags.light);
    expect(him).toMatchObject({
      state: "fattening",
      pen: { id: world.pens.quarantine.id },
    });
  });

  it("keeps an unwell bull in Quarantine", async () => {
    const him = await releaseHim(world.tags.unwell, { kept: true });
    expect(him).toMatchObject({
      state: "quarantine",
      pen: { id: world.pens.quarantine.id },
    });
  });
});
