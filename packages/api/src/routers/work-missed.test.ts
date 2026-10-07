import { eq } from "@OpenFarm/db/operators";
import { farm } from "@OpenFarm/db/schema/farm";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { aMonthOn } from "../test/carrying";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A server back after days down once told every late milking one by one — thirty-five pushes to the Manager and as
// many to the Owner in one turn, and the urgent notices pushed off the list. Late work from the silence is now one
// notice, and what went late within the last hour is told as ever.

const suffix = `${Date.now()}`;

/** Twice a day, at five and five, with half an hour of grace. */
const sop = (): SopContent => ({
  name: { bn: `দোহন ${suffix}`, en: "Milking" },
  purpose: { bn: "দুবেলা দোহন" },
  triggers: [{ kind: "schedule", times: ["05:00", "17:00"] }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 30,
  steps: [
    {
      id: "milk",
      text: { bn: "দোহন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

let penId = "";

beforeAll(async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.sheds.create({ name: `missed-${suffix}` });
  const pen = await owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });
  penId = pen.id;
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId,
    source: "born",
    aliases: [],
  });
  await owner.client.animals.setState({
    tagNumber: cow.tagNumber,
    state: "pregnant_heifer",
    expectedCalvingOn: aMonthOn(owner),
  });
  await owner.client.animals.setState({
    tagNumber: cow.tagNumber,
    state: "milking",
  });
  await createTestClient(appRouter, { as: "manager" });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-missed-${penId}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId,
    })
    .onConflictDoNothing();
  await owner.client.sops.create({ content: sop() });
});

const told = (kind: "instance_overdue" | "work_missed", who: string) =>
  scratchDb().query.alert.findMany({
    where: { farmId: theFarm().id, kind, userId: who },
    columns: { params: true },
  });

describe("work that went late while the farm's day was not turning", () => {
  it("is one notice to the Manager and the Owner, and only the last hour's is told one by one", async () => {
    // Four days of milkings raised and never done, and nobody told: the server was down.
    for (const day of ["01", "02", "03", "04"]) {
      // oxlint-disable-next-line no-await-in-loop -- one day after another
      const raising = await createTestClient(appRouter, {
        as: "owner",
        clock: new FakeClock(`2088-08-${day}T12:00:00.000Z`),
      });
      // oxlint-disable-next-line no-await-in-loop -- one day after another
      await raising.client.work.ensureDue();
    }
    await scratchDb()
      .update(farm)
      .set({ alertsSweptFrom: new Date("2088-07-31T20:00:00.000Z") })
      .where(eq(farm.id, theFarm().id));

    // Back at a quarter to six on the fifth: the morning's milking went late a quarter of an hour ago.
    const back = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2088-08-04T23:45:00.000Z"),
    });
    await back.client.work.ensureDue();
    await back.client.alerts.sweep();

    expect(
      await told("instance_overdue", thePerson("manager").id)
    ).toHaveLength(1);
    for (const who of [thePerson("manager").id, thePerson("owner").id]) {
      // oxlint-disable-next-line no-await-in-loop -- two people, one after the other
      const missed = await told("work_missed", who);
      expect(missed).toHaveLength(1);
      expect((missed[0]?.params as { count?: number } | undefined)?.count).toBe(
        8
      );
    }
  });
});
