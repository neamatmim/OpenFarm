import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, inArray } from "@OpenFarm/db/operators";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { Side, SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm, thePerson } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Trail, Tx } from "./audit";
import {
  calves,
  correctHowSheLeft,
  entersState,
  leaves,
  redateCalving,
  walkByStep,
  walkTo,
} from "./herd-store";
import { calvingCauseOf, calvingKeyOf } from "./instances-store";
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

/** Where she is and what she is, and what has become of the work about her and the calving work she was raised. */
const standing = async (
  animalId: string,
  workId: string,
  calvingWorkId = ""
) => {
  const db = scratchDb();
  const row = await db.query.animal.findFirst({
    where: { id: animalId },
    columns: {
      penId: true,
      side: true,
      state: true,
      stateChangedAt: true,
      expectedCalvingAt: true,
      lactationNumber: true,
      lactationStartedAt: true,
    },
  });
  const work = await db.query.sopInstance.findFirst({
    where: { id: workId },
    columns: { penId: true, state: true },
  });
  const calvingWork = await db.query.sopInstance.findFirst({
    where: { id: calvingWorkId },
    columns: { state: true },
  });
  const moves = await db.query.animalMove.findMany({
    where: { animalId },
    columns: { fromPenId: true, toPenId: true, fromSide: true, toSide: true },
    orderBy: { movedAt: "asc", id: "asc" },
  });
  return { row, work, calvingWork, moves };
};

/** An animal standing in the first dairy Pen, carrying, with a piece of work raised about her and the Dry-off her
 *  Expected Calving raised — or, `inMilk`, one who has since calved, or, `open`, a heifer nobody has found in calf. */
const her = async ({ inMilk = false, open = false } = {}) => {
  const { tagNumber, id } = await world.owner.animals.register({
    sex: "female",
    side: "dairy",
    penId: world.dairyPen,
    source: "born",
    aliases: [],
    ...(open
      ? { state: "heifer" as const }
      : { state: "pregnant_heifer" as const, expectedCalvingOn: "2034-05-01" }),
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
      farmId: theFarm().id,
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
  const registered = await scratchDb().query.animal.findFirst({
    where: { id },
    columns: { lactationNumber: true },
  });
  const calvingWorkId = uuidv7(new Date(AT));
  await scratchDb()
    .insert(sopInstance)
    .values({
      id: calvingWorkId,
      farmId: theFarm().id,
      definitionId: world.work.definitionId,
      versionId: world.work.versionId,
      penId: world.dairyPen,
      animalId: id,
      state: "due",
      dueAt: new Date("2034-03-02T04:00:00.000Z"),
      graceMinutes: 24 * 60,
      assignedRole: "staff",
      cause: calvingCauseOf(
        calvingKeyOf({ id, lactationNumber: registered?.lactationNumber ?? 0 }),
        "dry_off"
      ),
      createdAt: new Date(AT),
    });
  return {
    tagNumber,
    id,
    workId,
    calvingWorkId,
    before: await standing(id, workId, calvingWorkId),
  };
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
  /** The Dry-off her Expected Calving raised: still owed, or gone with the calving it prepared for. */
  calvingWork: "open" | "closed";
}

/** Where the work about her went, against where it was. */
const workAfter = (
  before: { penId: string | null } | undefined,
  after: { penId: string | null; state: string } | undefined
): Followed["work"] => {
  if (after?.state === "called_off") {
    return "closed";
  }
  return after?.penId === before?.penId ? "stays" : "follows";
};

const followed = async (
  subject: Awaited<ReturnType<typeof her>>
): Promise<Followed> => {
  const { row, work, calvingWork, moves } = await standing(
    subject.id,
    subject.workId,
    subject.calvingWorkId
  );
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
    calvingWork: calvingWork?.state === "called_off" ? "closed" : "open",
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

/** A trail nobody reads: these tests are about the herd, and the trail of work it calls off is the routers' tests'. */
const nobodysTrail: Trail = () => Promise.resolve("");

/** The herd walks her. */
const walked = (animalId: string, to: { toPenId: string; toSide?: Side }) =>
  onHer(animalId, (tx, beast) =>
    walkTo(tx, {
      farmId: theFarm().id,
      beast,
      ...to,
      movedBy: null,
      movedAt: later.at,
      now: later.now,
      calvingLeadDays: DEFAULT_LEADS,
      trail: nobodysTrail,
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
      calvingWork: "open",
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
      calvingWork: "closed",
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
      calves(tx, theFarm().id, beast, {
        ...later,
        calvingLeadDays: DEFAULT_LEADS,
        trail: nobodysTrail,
      })
    );
    expect(await followed(subject)).toEqual({
      move: null,
      side: "dairy",
      state: "milking",
      stateChanged: true,
      work: "stays",
      expectedCalving: "cleared",
      calvingWork: "closed",
    });
  });

  it("is dried off: Dry, and nothing else moves", async () => {
    const subject = await her({ inMilk: true });
    await onHer(subject.id, (tx, beast) =>
      entersState(tx, theFarm().id, beast, { state: "dry", ...later })
    );
    expect(await followed(subject)).toEqual({
      move: null,
      side: "dairy",
      state: "dry",
      stateChanged: true,
      work: "stays",
      expectedCalving: "cleared",
      calvingWork: "open",
    });
  });

  it("is found in calf: a Pregnant Heifer, and nothing else moves", async () => {
    const subject = await her({ open: true });
    await onHer(subject.id, (tx, beast) =>
      entersState(tx, theFarm().id, beast, {
        state: "pregnant_heifer",
        ...later,
      })
    );
    expect(await followed(subject)).toEqual({
      move: null,
      side: "dairy",
      state: "pregnant_heifer",
      stateChanged: true,
      work: "stays",
      expectedCalving: "cleared",
      calvingWork: "open",
    });
  });

  it("is confirmed ready for sale on Fattening: Ready for Sale, where the crossing left her", async () => {
    const subject = await her();
    await walked(subject.id, {
      toPenId: world.fatteningPen,
      toSide: "fattening",
    });
    await onHer(subject.id, (tx, beast) =>
      entersState(tx, theFarm().id, beast, {
        state: "ready_for_sale",
        ...later,
      })
    );
    expect(await followed(subject)).toEqual({
      move: {
        toPenId: world.fatteningPen,
        fromSide: "dairy",
        toSide: "fattening",
      },
      side: "fattening",
      state: "ready_for_sale",
      stateChanged: true,
      work: "follows",
      expectedCalving: "cleared",
      calvingWork: "closed",
    });
  });

  it("loses the calf: a Heifer again, and the dates of the pregnancy are breeding's to put right", async () => {
    const subject = await her();
    await onHer(subject.id, (tx, beast) =>
      entersState(tx, theFarm().id, beast, { state: "heifer", ...later })
    );
    expect(await followed(subject)).toEqual({
      move: null,
      side: "dairy",
      state: "heifer",
      stateChanged: true,
      work: "stays",
      expectedCalving: "kept",
      calvingWork: "open",
    });
  });

  it("does not reach Milking but by calving, nor anything once she has left", async () => {
    const subject = await her();
    await expect(
      onHer(subject.id, (tx, beast) =>
        entersState(tx, theFarm().id, beast, { state: "milking", ...later })
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await onHer(subject.id, (tx, beast) =>
      leaves(tx, theFarm().id, beast, {
        state: "died",
        ...later,
        trail: nobodysTrail,
      })
    );
    await expect(
      onHer(subject.id, (tx, beast) =>
        entersState(tx, theFarm().id, beast, { state: "heifer", ...later })
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
        leaves(tx, theFarm().id, subject, {
          state,
          at: new Date(LATER),
          now: new Date(LATER),
          trail: nobodysTrail,
        })
      );
      expect(await followed(subject)).toEqual({
        move: null,
        side: "dairy",
        state,
        stateChanged: true,
        work: "closed",
        expectedCalving: "cleared",
        calvingWork: "closed",
      });
      await expect(
        world.later.owner.animals.move({
          tagNumber: subject.tagNumber,
          toPenId: world.otherDairyPen,
        })
      ).rejects.toMatchObject({ data: { late: true } });
      // The herd itself says so, whoever asks it.
      await expect(
        walked(subject.id, { toPenId: world.otherDairyPen })
      ).rejects.toMatchObject({ data: { late: true } });
      // And she leaves once: a second exit over the first would lose which one the farm stands behind.
      await expect(
        scratchDb().transaction((tx) =>
          leaves(tx, theFarm().id, subject, {
            state: "culled",
            at: new Date(LATER),
            now: new Date(LATER),
            trail: nobodysTrail,
          })
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  );
});
describe("what follows from putting it right", () => {
  const step = (
    animalId: string,
    completionId: string,
    toPenId: string | null,
    at = later.at
  ) =>
    onHer(animalId, (tx, beast) =>
      walkByStep(tx, {
        farmId: theFarm().id,
        beast,
        completionId,
        toPenId,
        movedBy: thePerson("owner").id,
        movedAt: at,
        now: at,
        calvingLeadDays: DEFAULT_LEADS,
        trail: nobodysTrail,
      })
    );

  it("a Step's Move put right to another Pen: the one Move says so, and she and her work go there", async () => {
    const subject = await her();
    const completionId = `step-move-${subject.id}`;
    await step(subject.id, completionId, world.otherDairyPen);
    await step(subject.id, completionId, world.fatteningPen);
    expect(await followed(subject)).toMatchObject({
      move: { toPenId: world.fatteningPen, fromSide: "dairy", toSide: "dairy" },
      side: "dairy",
      work: "follows",
    });
    const journeys = await scratchDb().query.animalMove.findMany({
      where: { completionId },
    });
    expect(journeys).toHaveLength(1);
  });

  it("a Step's Move taken back: no Move, and she and her work are back where they were", async () => {
    const subject = await her();
    const completionId = `step-back-${subject.id}`;
    await step(subject.id, completionId, world.otherDairyPen);
    await step(subject.id, completionId, null);
    expect(await followed(subject)).toMatchObject({
      move: null,
      side: "dairy",
      work: "stays",
    });
    const { row } = await standing(subject.id, subject.workId);
    expect(row?.penId).toBe(world.dairyPen);
  });

  it("a Step's Move put right after she has been walked on since: the Move says it, and she stays where she was last seen", async () => {
    const subject = await her();
    const completionId = `step-since-${subject.id}`;
    // The Step walked her at half past four; somebody walked her on at five.
    const stepAt = new Date("2034-02-01T04:30:00.000Z");
    await step(subject.id, completionId, world.otherDairyPen, stepAt);
    await walked(subject.id, { toPenId: world.fatteningPen });
    const since = await standing(subject.id, subject.workId);
    await step(subject.id, completionId, world.dairyPen, stepAt);
    const after = await standing(subject.id, subject.workId);
    expect(after.row?.penId).toBe(since.row?.penId);
  });

  it("how she left put right: the way she went and when, and she is still gone", async () => {
    const subject = await her();
    await onHer(subject.id, (tx, beast) =>
      leaves(tx, theFarm().id, beast, {
        state: "died",
        ...later,
        trail: nobodysTrail,
      })
    );
    const earlier = new Date("2034-02-01T04:30:00.000Z");
    await onHer(subject.id, (tx, beast) =>
      correctHowSheLeft(tx, theFarm().id, beast, {
        state: "culled",
        at: earlier,
        now: later.now,
      })
    );
    const { row } = await standing(subject.id, subject.workId);
    expect(row).toMatchObject({ state: "culled", stateChangedAt: earlier });
    // An animal on the farm has no leaving to put right.
    const other = await her();
    await expect(
      onHer(other.id, (tx, beast) =>
        correctHowSheLeft(tx, theFarm().id, beast, {
          state: "died",
          now: later.now,
        })
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("a calving's hour put right: her Lactation and her reaching Milking move with it", async () => {
    const subject = await her();
    await onHer(subject.id, (tx, beast) =>
      calves(tx, theFarm().id, beast, {
        ...later,
        calvingLeadDays: DEFAULT_LEADS,
        trail: nobodysTrail,
      })
    );
    const { row: calved } = await standing(subject.id, subject.workId);
    const truly = new Date("2034-02-01T03:15:00.000Z");
    await scratchDb().transaction((tx) =>
      redateCalving(
        tx,
        theFarm().id,
        {
          damId: subject.id,
          lactationNumber: calved?.lactationNumber ?? 0,
          from: later.at,
          to: truly,
          calfIds: [],
        },
        later.now
      )
    );
    const { row } = await standing(subject.id, subject.workId);
    expect(row).toMatchObject({
      state: "milking",
      stateChangedAt: truly,
      lactationStartedAt: truly,
    });
  });
});
