import { FakeClock, HOUR, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { EntryInput } from "../sync-entries";
import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { staffKeep } from "../test/staff-pens";
import { appRouter } from "./index";

// The tagging walk goes through barns with no signal. A photo taken there is held on the phone and sent when signal
// comes back, as every other barn record is (ADR 0002) — never lost because the phone could not reach the farm.

const suffix = `${Date.now()}`;
/** When the photo was taken, in a shed with no signal. */
const TAKEN = "2034-03-01T04:00:00.000Z";
/** When the phone found signal again. */
const SENT = new Date(new Date(TAKEN).getTime() + 3 * HOUR).toISOString();
/** A picture big enough to find in a trail that should not hold it. */
const IMAGE = `PHOTO-${suffix}-${"x".repeat(64)}`;

let world: { ours: string; theirs: string; gone: string; newer: string };

beforeAll(async () => {
  const { client: owner } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock("2034-02-28T04:00:00.000Z"),
  });
  const shed = await owner.sheds.create({ name: `photo-held-${suffix}` });
  const ourPen = await owner.sheds.pens.create({
    shedId: shed.id,
    name: `আমাদের ${suffix}`,
  });
  const otherPen = await owner.sheds.pens.create({
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
  const gone = await owner.animals.register({ ...cow, penId: ourPen.id });
  const newer = await owner.animals.register({ ...cow, penId: ourPen.id });
  await owner.animals.recordMortality({
    photo: A_DEATH_PHOTO,
    tagNumber: gone.tagNumber,
    kind: "died",
    cause: "পরীক্ষা",
    disposal: "buried",
  });
  await staffKeep(ourPen.id);
  world = {
    ours: ours.tagNumber,
    theirs: theirs.tagNumber,
    gone: gone.tagNumber,
    newer: newer.tagNumber,
  };
});

let nextSeq = 0;
/** A photo of her held on the staff member's phone since TAKEN, sent when it found signal. */
const sendHeld = async (tagNumber: string, data = IMAGE, key?: string) => {
  nextSeq += 1;
  const { client: phone } = await createTestClient(appRouter, {
    as: "staff",
    clock: new FakeClock(SENT),
  });
  const batch = {
    key: key ?? `photo-held-${suffix}-${nextSeq}`,
    entries: [
      {
        id: `photo-held-entry-${suffix}-${key ?? nextSeq}`,
        seq: nextSeq,
        recordedAt: new Date(TAKEN),
        kind: "animal_photo",
        tagNumber,
        contentType: "image/jpeg",
        data,
        thumb: "SMALL",
      } satisfies EntryInput,
    ],
  };
  const answer = await phone.sync.batch(batch);
  return { answer, again: () => phone.sync.batch(batch) };
};

const animalId = async (tagNumber: string) => {
  const row = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber },
    columns: { id: true },
  });
  return row?.id ?? "";
};

describe("an animal's photo taken with no signal", () => {
  it("reaches her page when the phone finds signal, dated when it was taken", async () => {
    const { answer } = await sendHeld(world.ours);

    expect(answer.results[0]?.outcome).toBe("applied");
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
    });
    expect(await owner.animals.photo({ tagNumber: world.ours })).toEqual({
      contentType: "image/jpeg",
      data: IMAGE,
    });
    expect(
      await owner.animals.photo({ tagNumber: world.ours, size: "thumb" })
    ).toEqual({ contentType: "image/jpeg", data: "SMALL" });
    const her = await owner.animals.get({ tagNumber: world.ours });
    expect(her.photoUpdatedAt?.toISOString()).toBe(TAKEN);
  });

  it("is the same photo however many times the phone sends it, with one trail entry", async () => {
    const id = await animalId(world.ours);
    const before = await scratchDb().query.auditEvent.findMany({
      where: { entity: "animal", entityId: id },
    });
    const { answer, again } = await sendHeld(
      world.ours,
      `${IMAGE}-twice`,
      `twice-${suffix}`
    );
    expect(await again()).toEqual(answer);

    const after = await scratchDb().query.auditEvent.findMany({
      where: { entity: "animal", entityId: id },
    });
    expect(after.length - before.length).toBe(1);
  });

  it("never writes the picture into the trail, taken or held", async () => {
    const picture = `${IMAGE}-trail`;
    await sendHeld(world.ours, picture);
    // Held for a person: the trail says what was sent, and the picture is kept on the held entry alone.
    await sendHeld(world.gone, picture);
    const events = await scratchDb().query.auditEvent.findMany({
      where: { farmId: theFarm().id },
    });
    expect(JSON.stringify(events)).not.toContain(picture);
  });

  it("of an animal in somebody else's Pen is not theirs to take", async () => {
    const { answer } = await sendHeld(world.theirs);
    expect(answer.results[0]).toMatchObject({
      outcome: "rejected",
      refusal: { category: "not_yours" },
    });
  });

  it("of an animal who has left since is kept for a person, not lost", async () => {
    const { answer } = await sendHeld(world.gone);
    expect(answer.results[0]).toMatchObject({
      outcome: "kept",
      refusal: { category: "late", word: "she_is_gone" },
    });
  });

  it("does not put back an older photo over the one somebody took since", async () => {
    // Somebody with signal photographed her after the phone in the shed did.
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock(
        new Date(new Date(TAKEN).getTime() + HOUR).toISOString()
      ),
    });
    await owner.animals.setPhoto({
      tagNumber: world.newer,
      contentType: "image/jpeg",
      data: "NEWER",
    });

    const { answer } = await sendHeld(world.newer);

    expect(answer.results[0]).toMatchObject({
      outcome: "kept",
      refusal: { category: "late", word: "newer_photo_kept" },
    });
    expect(await owner.animals.photo({ tagNumber: world.newer })).toEqual({
      contentType: "image/jpeg",
      data: "NEWER",
    });
  });
});
