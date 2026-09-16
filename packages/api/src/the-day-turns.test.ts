import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { buildContext } from "./context";
import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";
import type { Turning } from "./the-day-turns";
import { theDayTurns } from "./the-day-turns";

// What the farm does because time has passed: work falling due, the sweep, the evening's post — run by the server's
// own timer, with nobody asking. Turned twice at the same hour it must do the same work once, because the app turns it
// too whenever anybody opens it.

const suffix = `${Date.now()}`;
/**
 * Half past eight in the morning in Dhaka, in a year before every other test file's days.
 *
 * A sweep is the whole farm's, not this file's: it moves the farm's own watermark to the moment it swept, and the farm
 * is shared with every other test file. Turning the day in a year *after* theirs would step the watermark past their
 * work and leave their sweeps with nothing to find — so this file works in a year before anybody, as the schedule's
 * own test does.
 */
const MORNING = "2019-05-04T02:30:00.000Z";

const everyMorningSop = (): SopContent => ({
  name: { bn: `সকালের কাজ ${suffix}`, en: `Morning ${suffix}` },
  purpose: { bn: "প্রতিদিন সকালে" },
  triggers: [{ kind: "schedule", times: ["08:00"] }],
  appliesTo: { side: "dairy" },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 60,
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

/** The farm's day, as the server's own timer turns it: nobody signed in, the farm's own clock. */
const turnTheDay = async (at: string) => {
  const context = await buildContext({
    session: null,
    clock: new FakeClock(at),
    db: scratchDb(),
  });
  const { farm } = context;
  if (!farm) {
    throw new Error("expected the test farm");
  }
  return await theDayTurns({ ...context, farm } as Turning);
};

let world: { penId: string; definitionId: string };

beforeAll(async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(MORNING),
  });
  const shed = await client.herd.createShed({ name: `দিন ${suffix}` });
  const pen = await client.herd.createPen({
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });
  // A cow to do it to: work falls due over the Pens that have animals the procedure applies to.
  const manager = await createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock(MORNING),
  });
  await manager.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  const sop = await client.sops.create({ content: everyMorningSop() });
  world = { penId: pen.id, definitionId: sop.definitionId };
});

describe("the day turning", () => {
  it("raises the day's work once, however often the day is turned", async () => {
    // Half past eight: the eight o'clock round is due.
    const first = await turnTheDay("2019-05-04T02:30:00.000Z");
    expect(first.workRaised).toBeGreaterThan(0);
    expect(first.wentWrong).toEqual([]);

    // A minute later, because somebody opened the app: the same slot is not raised twice.
    const again = await turnTheDay("2019-05-04T02:31:00.000Z");
    expect(again.workRaised).toBe(0);
    expect(again.wentWrong).toEqual([]);

    // This file's own procedure only: the farm is shared, and every other file's work falls due in its Pens too.
    const raised = await scratchDb().query.sopInstance.findMany({
      where: { penId: world.penId, definitionId: world.definitionId },
      columns: { id: true, state: true },
    });
    expect(raised).toHaveLength(1);
  });

  it("carries no post while the farm is asleep", async () => {
    // Half past midnight on the farm's clock: quiet hours, so nothing buzzes whoever is awake.
    const night = await turnTheDay("2019-05-04T18:30:00.000Z");
    expect(night.toldTheDigest).toBe(0);
    expect(night.wentWrong).toEqual([]);
  });

  it("turns the rest of the day when the first piece of it fails", async () => {
    const context = await buildContext({
      session: null,
      clock: new FakeClock("2019-05-11T02:30:00.000Z"),
      db: scratchDb(),
    });
    const { farm } = context;
    if (!farm) {
      throw new Error("expected the test farm");
    }
    // A farm that cannot read its Playbook: raising the day's work is the piece that fails, and it is not the last
    // one — the sweep and the digest come after it and must still run.
    const turned = await theDayTurns({
      ...context,
      farm,
      db: {
        ...context.db,
        // Bound by hand: the farm's own database keeps these on its prototype, and spreading an object leaves them
        // behind — the pieces after this one open transactions of their own and must still work.
        transaction: context.db.transaction.bind(context.db),
        query: {
          ...context.db.query,
          sopDefinition: {
            findMany: () => Promise.reject(new Error("the Playbook is shut")),
          },
        },
      } as unknown as Turning["db"],
    });

    expect(turned.wentWrong).toEqual(["the day's work"]);
    // Nothing was thrown at the caller, and the pieces behind it turned.
    expect(turned.workRaised).toBe(0);
  });
});
