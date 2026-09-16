import { penAssignment } from "@OpenFarm/db/schema/herd";
import { scratchDb, theFarm, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { appRouter } from "../routers/index";
import { createTestClient } from "../test/client";

// An Observation nobody's round asked for still starts the health chain. Whether it arrives this way or from a phone's
// Outbox is the parity suite's to say; this is what the Entry itself does.

const suffix = `${Date.now()}`;

let world: { ours: string; theirs: string };
beforeAll(async () => {
  const { client: owner } = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.herd.createShed({ name: `observation-${suffix}` });
  const ourPen = await owner.herd.createPen({
    shedId: shed.id,
    name: `আমাদের ${suffix}`,
  });
  const otherPen = await owner.herd.createPen({
    shedId: shed.id,
    name: `অন্যের ${suffix}`,
  });
  const cow = {
    sex: "female" as const,
    side: "dairy" as const,
    state: "heifer" as const,
    source: "born" as const,
    aliases: [],
  };
  const ours = await owner.animals.register({ ...cow, penId: ourPen.id });
  const theirs = await owner.animals.register({ ...cow, penId: otherPen.id });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-observation-${ourPen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: ourPen.id,
    })
    .onConflictDoNothing();
  world = { ours: ours.tagNumber, theirs: theirs.tagNumber };
});

describe("reporting what was seen", () => {
  it("puts an Observation in front of the Vet, with what the person said", async () => {
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
