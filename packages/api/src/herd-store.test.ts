import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, inArray } from "@OpenFarm/db/operators";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { Side, SopContent } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Tx } from "./audit";
import { calves, entersState, leaves, walkTo } from "./herd-store";
import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";

// Everything that can happen to where an Animal is and what she is, held to one list of what must follow: the Move
// written, her Side and State, when she reached it, the work raised about her, and her Expected Calving. Each row is one
// way it happens; a row that forgets something the others remember is how a bug is found before the farm finds it.

const suffix = `${Date.now()}`;
/** When she is set up. */
const AT = "2034-02-01T04:00:00.000Z";
/** When what happens to her happens: later, so a State she reaches is seen to be reached then. */
const LATER = "2034-02-01T05:00:00.000Z";

const workSop = (): SopContent => ({
  name: { bn: `তার কাজ ${suffix}`, en: "Her work" },
  purpose: { bn: "একটি পশুর কাজ" },
  triggers: [],
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 24 * 60,
  steps: [
    {
      id: "look",
      text: { bn: "দেখুন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

type Client = Awaited<
  ReturnType<typeof createTestClient<typeof appRouter>>
>["client"];

let world: {
  owner: Client;
  manager: Client;
  /** The Owner and the Manager an hour on, doing what happens to her. */
  later: { owner: Client; manager: Client };
  dairyPen: string;
  otherDairyPen: string;
  fatteningPen: string;
  work: { definitionId: string; versionId: string };
};

/** Somebody's phone, at a moment. */
const as = async (who: "owner" | "manager", at: string) => {
  const { client } = await createTestClient(appRouter, {
    as: who,
    clock: new FakeClock(at),
  });
  return client;
};

beforeAll(async () => {
  const owner = await as("owner", AT);
  const shed = await owner.herd.createShed({ name: `lifecycle-${suffix}` });
  const pen = async (name: string) => {
    const made = await owner.herd.createPen({
      shedId: shed.id,
      name: `${name} ${suffix}`,
    });
    return made.id;
  };
  world = {
    owner,
    manager: await as("manager", AT),
    later: {
      owner: await as("owner", LATER),
      manager: await as("manager", LATER),
    },
    dairyPen: await pen("দুধ ক"),
    otherDairyPen: await pen("দুধ খ"),
    fatteningPen: await pen("মোটা"),
    work: await owner.sops.create({ content: workSop() }),
  };
});

afterAll(async () => {
  if (!world) {
    return;
  }
  const db = scratchDb();
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.work.definitionId));
  // Nothing this file raised is left open for a later file's clock to find late.
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        eq(sopInstance.definitionId, world.work.definitionId),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
});

/** Where she is and what she is, and what has become of the work about her. */
const standing = async (animalId: string, workId: string) => {
  const db = scratchDb();
  const row = await db.query.animal.findFirst({
    where: { id: animalId },
    columns: {
      penId: true,
      side: true,
      state: true,
      stateChangedAt: true,
      expectedCalvingAt: true,
      lactationStartedAt: true,
    },
  });
  const work = await db.query.sopInstance.findFirst({
    where: { id: workId },
    columns: { penId: true, state: true },
  });
  const moves = await db.query.animalMove.findMany({
    where: { animalId },
    columns: { fromPenId: true, toPenId: true, fromSide: true, toSide: true },
    orderBy: { movedAt: "asc", id: "asc" },
  });
  return { row, work, moves };
};

/** An animal standing in the first dairy Pen, carrying, with a piece of work raised about her — or, `inMilk`, one who
 *  has since calved. */
const her = async ({ inMilk = false } = {}) => {
  const { tagNumber, id } = await world.owner.animals.register({
    sex: "female",
    side: "dairy",
    state: "pregnant_heifer",
    penId: world.dairyPen,
    source: "born",
    aliases: [],
    expectedCalvingOn: "2034-05-01",
  });
  if (inMilk) {
    await world.owner.animals.setState({
      tagNumber,
      state: "milking",
      calvedAt: new Date("2034-01-10T04:00:00.000Z"),
    });
  }
  const workId = uuidv7(new Date(AT));
  await scratchDb()
    .insert(sopInstance)
    .values({
      id: workId,
      farmId: TEST_FARM.id,
      definitionId: world.work.definitionId,
      versionId: world.work.versionId,
      penId: world.dairyPen,
      animalId: id,
      state: "due",
      dueAt: new Date("2034-02-02T04:00:00.000Z"),
      graceMinutes: 24 * 60,
      assignedRole: "staff",
      cause: `lifecycle-test:${id}`,
      createdAt: new Date(AT),
    });
  return { tagNumber, id, workId, before: await standing(id, workId) };
};

interface Followed {
  /** The Move this wrote, or none. */
  move: { toPenId: string; fromSide: string; toSide: string } | null;
  side: string;
  state: string;
  /** Whether when she reached her State moved. */
  stateChanged: boolean;
  /** The work about her: gone with her to her new Pen, closed because she is gone, or left where it was. */
  work: "follows" | "closed" | "stays";
  expectedCalving: "kept" | "cleared";
}

/** Where the work about her went, against where it was. */
const workAfter = (
  before: { penId: string | null } | undefined,
  after: { penId: string | null; state: string } | undefined
): Followed["work"] => {
  if (after?.state === "missed") {
    return "closed";
  }
  return after?.penId === before?.penId ? "stays" : "follows";
};

const followed = async (
  subject: Awaited<ReturnType<typeof her>>
): Promise<Followed> => {
  const { row, work, moves } = await standing(subject.id, subject.workId);
  const before = subject.before.row;
  const move = moves.slice(subject.before.moves.length).at(-1);
  return {
    move: move
      ? {
          toPenId: move.toPenId,
          fromSide: move.fromSide ?? "",
          toSide: move.toSide,
        }
      : null,
    side: row?.side ?? "",
    state: row?.state ?? "",
    stateChanged:
      row?.stateChangedAt?.getTime() !== before?.stateChangedAt?.getTime(),
    work: workAfter(subject.before.work, work),
    expectedCalving: row?.expectedCalvingAt ? "kept" : "cleared",
  };
};

/** The farm's calving leads as it starts: the Dry-off sixty days before, the calving pen a week. */
const DEFAULT_LEADS = { dry_off: 60, calving_prep: 7 } as const;

/** Something the herd does to her, on its own transaction, an hour after she was set up. */
const onHer = (
  animalId: string,
  act: (
    tx: Tx,
    beast: NonNullable<Awaited<ReturnType<Tx["query"]["animal"]["findFirst"]>>>
  ) => Promise<unknown>
) =>
  scratchDb().transaction(async (tx) => {
    const beast = await tx.query.animal.findFirst({ where: { id: animalId } });
    if (!beast) {
      throw new Error("no such animal");
    }
    await act(tx, beast);
  });

const later = { at: new Date(LATER), now: new Date(LATER) };

/** The herd walks her. */
const walked = (animalId: string, to: { toPenId: string; toSide?: Side }) =>
  onHer(animalId, (tx, beast) =>
    walkTo(tx, {
      farmId: TEST_FARM.id,
      beast,
      ...to,
      movedBy: null,
      movedAt: later.at,
      now: later.now,
      calvingLeadDays: DEFAULT_LEADS,
    })
  );

describe("what follows from what happens to her", () => {
  it("walked to another Pen on her Side: a Move, and her work goes with her", async () => {
    const subject = await her();
    await walked(subject.id, { toPenId: world.otherDairyPen });
    expect(await followed(subject)).toEqual({
      move: {
        toPenId: world.otherDairyPen,
        fromSide: "dairy",
        toSide: "dairy",
      },
      side: "dairy",
      state: "pregnant_heifer",
      stateChanged: false,
      work: "follows",
      expectedCalving: "kept",
    });
  });

  it("crosses to Fattening: a Move across, her work with her, and no calving to prepare for", async () => {
    const subject = await her();
    await walked(subject.id, {
      toPenId: world.fatteningPen,
      toSide: "fattening",
    });
    expect(await followed(subject)).toEqual({
      move: {
        toPenId: world.fatteningPen,
        fromSide: "dairy",
        toSide: "fattening",
      },
      side: "fattening",
      state: "fattening",
      stateChanged: true,
      work: "follows",
      expectedCalving: "cleared",
    });
  });

  it("is never put on Fattening by a change of State, which would leave her in a dairy Pen with no Move", async () => {
    const subject = await her();
    await expect(
      world.later.owner.animals.setState({
        tagNumber: subject.tagNumber,
        state: "fattening",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await followed(subject)).toMatchObject({
      move: null,
      side: "dairy",
      state: "pregnant_heifer",
    });
  });

  it("calves: in milk from the calving, the calving behind her, her work where it was", async () => {
    const subject = await her();
    await onHer(subject.id, (tx, beast) =>
      calves(tx, TEST_FARM.id, beast, {
        ...later,
        calvingLeadDays: DEFAULT_LEADS,
      })
    );
    expect(await followed(subject)).toEqual({
      move: null,
      side: "dairy",
      state: "milking",
      stateChanged: true,
      work: "stays",
      expectedCalving: "cleared",
    });
  });

  it("is dried off: Dry, and nothing else moves", async () => {
    const subject = await her({ inMilk: true });
    await onHer(subject.id, (tx, beast) =>
      entersState(tx, TEST_FARM.id, beast, { state: "dry", ...later })
    );
    expect(await followed(subject)).toEqual({
      move: null,
      side: "dairy",
      state: "dry",
      stateChanged: true,
      work: "stays",
      expectedCalving: "cleared",
    });
  });

  it("loses the calf: a Heifer again, and the dates of the pregnancy are breeding's to put right", async () => {
    const subject = await her();
    await onHer(subject.id, (tx, beast) =>
      entersState(tx, TEST_FARM.id, beast, { state: "heifer", ...later })
    );
    expect(await followed(subject)).toEqual({
      move: null,
      side: "dairy",
      state: "heifer",
      stateChanged: true,
      work: "stays",
      expectedCalving: "kept",
    });
  });

  it("does not reach Milking but by calving, nor anything once she has left", async () => {
    const subject = await her();
    await expect(
      onHer(subject.id, (tx, beast) =>
        entersState(tx, TEST_FARM.id, beast, { state: "milking", ...later })
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await onHer(subject.id, (tx, beast) =>
      leaves(tx, TEST_FARM.id, beast, { state: "died", ...later })
    );
    await expect(
      onHer(subject.id, (tx, beast) =>
        entersState(tx, TEST_FARM.id, beast, { state: "heifer", ...later })
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it.each([
    ["is sold", "sold"],
    ["dies", "died"],
    ["is culled", "culled"],
  ] as const)(
    "%s: gone, her work closed, no calving to prepare for, and nothing moves her after",
    async (_how, state) => {
      const subject = await her();
      await scratchDb().transaction((tx) =>
        leaves(tx, TEST_FARM.id, subject, {
          state,
          at: new Date(LATER),
          now: new Date(LATER),
        })
      );
      expect(await followed(subject)).toEqual({
        move: null,
        side: "dairy",
        state,
        stateChanged: true,
        work: "closed",
        expectedCalving: "cleared",
      });
      await expect(
        world.later.owner.animals.move({
          tagNumber: subject.tagNumber,
          toPenId: world.otherDairyPen,
        })
      ).rejects.toMatchObject({ data: { late: true } });
      // And she leaves once: a second exit over the first would lose which one the farm stands behind.
      await expect(
        scratchDb().transaction((tx) =>
          leaves(tx, TEST_FARM.id, subject, {
            state: "culled",
            at: new Date(LATER),
            now: new Date(LATER),
          })
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  );
});
