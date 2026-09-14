import { uuidv7 } from "@OpenFarm/db/ids";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { Recorder } from "../completion-store";
import { appRouter } from "../routers/index";
import { createTestClient } from "../test/client";
import { recordHeld } from "./entry";
import { moveEntry } from "./move";

// A Move a phone held, taken on the Batch's own transaction: what the parity suite cannot see, because only a phone
// out of signal can hold a Move while the farm moves on without it.

const suffix = `${Date.now()}`;
const at = (hour: number) => new Date(`2033-08-01T0${hour}:00:00.000Z`);

let world: { owner: Recorder; pens: [string, string, string] };

beforeAll(async () => {
  const clock = new FakeClock("2033-07-31T12:00:00.000Z");
  const { client, context } = await createTestClient(appRouter, {
    as: "owner",
    clock,
  });
  const shed = await client.herd.createShed({ name: `move-${suffix}` });
  const pens = await Promise.all(
    ["ক", "খ", "গ"].map((name) =>
      client.herd.createPen({ shedId: shed.id, name: `${name} ${suffix}` })
    )
  );
  world = {
    owner: context as Recorder,
    pens: pens.map((pen) => pen.id) as [string, string, string],
  };
});

const heiferIn = async (penId: string) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock("2033-07-31T12:00:00.000Z"),
  });
  const { tagNumber } = await client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId,
    source: "born",
    aliases: [],
  });
  return tagNumber;
};

/** A Move the phone held since `recordedAt`, arriving at `receivedAt`. */
const heldMove = (
  tagNumber: string,
  toPenId: string,
  recordedAt: Date,
  receivedAt: Date
) =>
  scratchDb().transaction((tx) =>
    recordHeld(
      tx,
      world.owner,
      moveEntry,
      { tagNumber, toPenId },
      {
        recordedAt,
        receivedAt,
        id: uuidv7(receivedAt),
        eventId: uuidv7(receivedAt),
        device: { id: null, seq: 1 },
      }
    )
  );

const standing = async (tagNumber: string) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: TEST_FARM.id, tagNumber },
    columns: { id: true, penId: true },
  });
  const moves = await scratchDb().query.animalMove.findMany({
    where: { animalId: her?.id ?? "" },
    orderBy: { movedAt: "asc", id: "asc" },
    columns: { toPenId: true, movedAt: true },
  });
  return { penId: her?.penId, moves };
};

describe("a Move a phone held", () => {
  it("is late when somebody has walked her somewhere else since, and she stays where they took her", async () => {
    const [first, second, third] = world.pens;
    const tagNumber = await heiferIn(first);
    const { client } = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock(at(5)),
    });
    await client.animals.move({ tagNumber, toPenId: third });

    await expect(
      heldMove(tagNumber, second, at(4), at(6))
    ).rejects.toMatchObject({ data: { late: true } });
    const after = await standing(tagNumber);
    expect(after.penId).toBe(third);
    expect(after.moves.map((move) => move.toPenId)).toEqual([first, third]);
  });

  it("is dated no later than the farm heard of it, however far ahead the phone's clock ran", async () => {
    const [first, second] = world.pens;
    const tagNumber = await heiferIn(first);

    await heldMove(tagNumber, second, at(9), at(7));

    const after = await standing(tagNumber);
    expect(after.penId).toBe(second);
    expect(after.moves.at(-1)?.movedAt).toEqual(at(7));
  });
});
