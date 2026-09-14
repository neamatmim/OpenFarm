import { penAssignment } from "@OpenFarm/db/schema/herd";
import { TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Something seen of an animal with no round asking still starts the health chain.

const suffix = `${Date.now()}`;

let world: { ours: string; theirs: string };
beforeAll(async () => {
  const { client: owner } = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.herd.createShed({ name: `sightings-${suffix}` });
  const ourPen = await owner.herd.createPen({
    shedId: shed.id,
    name: `আমাদের ${suffix}`,
  });
  const otherPen = await owner.herd.createPen({
    shedId: shed.id,
    name: `অন্যের ${suffix}`,
  });
  const cow = {
    sex: "female",
    side: "dairy",
    state: "heifer",
    source: "born",
    aliases: [],
  } as const;
  const ours = await owner.animals.register({ ...cow, penId: ourPen.id });
  const theirs = await owner.animals.register({ ...cow, penId: otherPen.id });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-sight-${ourPen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: ourPen.id,
    })
    .onConflictDoNothing();
  world = { ours: ours.tagNumber, theirs: theirs.tagNumber };
});

describe("reporting what was seen", () => {
  it("puts a sighting in front of the Vet, with what the person said", async () => {
    const { client: staff } = await createTestClient(appRouter, {
      as: "staff",
    });
    await staff.observations.record({
      tagNumber: world.ours,
      saw: "lame",
      note: "গেটে খোঁড়াচ্ছিল",
    });

    const { client: vet } = await createTestClient(appRouter, { as: "vet" });
    const inbox = await vet.diagnoses.waiting({});
    expect(
      inbox.some((row) => row.tagNumber === world.ours && row.saw === "lame")
    ).toBe(true);
    const her = await vet.animals.byTag({ tagNumber: world.ours });
    expect(her.observations[0]).toMatchObject({
      saw: "lame",
      note: "গেটে খোঁড়াচ্ছিল",
      instanceId: null,
    });
  });

  it("keeps Barn Staff to their own Pens, and asks what 'something else' was", async () => {
    const { client: staff } = await createTestClient(appRouter, {
      as: "staff",
    });
    await expect(
      staff.observations.record({ tagNumber: world.theirs, saw: "cough" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      staff.observations.record({ tagNumber: world.ours, saw: "other" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      staff.observations.record({ tagNumber: world.ours, saw: "sneezing" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
