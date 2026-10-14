import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { settleWhatIsSettled } from "../settled-notices";
import { createTestClient } from "../test/client";
import type { Turning } from "../the-day-turns";
import {
  drillOverdue,
  tellTheOwnerAboutTheMachinery,
} from "../the-machinery-notices";
import { appRouter } from "./index";

// The quarterly Restore Drill, written down in the farm it rehearsed whether or not it went well, with the next one's
// day said on the Backups page and the Owner told once it has gone by.

const as = (role: "owner" | "manager" | "staff" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

describe("the Restore Drill", () => {
  it("is written down with its day, who did it, how it went and a note, and says when the next is due", async () => {
    const manager = await as("manager", "2051-01-20T06:00:00.000Z");
    await manager.client.backups.recordDrill({
      doneOn: "2051-01-18",
      wentWell: true,
      backupUsed: "nightly 2051-01-17",
      note: "Herd, milk, history and the trail all there",
    });

    const drills = await manager.client.backups.drills();

    expect(drills.last).toMatchObject({
      doneOn: "2051-01-18",
      wentWell: true,
      backupUsed: "nightly 2051-01-17",
      note: "Herd, milk, history and the trail all there",
      recordedByName: expect.any(String),
    });
    expect(drills.dueOn).toBe("2051-04-18");
    expect(drills.overdue).toBe(false);
  });

  it("is written down when it went badly, saying what was missing", async () => {
    const owner = await as("owner", "2051-05-02T06:00:00.000Z");
    await expect(
      owner.client.backups.recordDrill({
        doneOn: "2051-05-01",
        wentWell: false,
      })
    ).rejects.toMatchObject({
      data: { refusal: "drill_says_what_went_wrong" },
    });

    await owner.client.backups.recordDrill({
      doneOn: "2051-05-01",
      wentWell: false,
      note: "Yesterday's milk was not in the copy",
    });
    const drills = await owner.client.backups.drills();
    // The latest stands, and the next is counted from it though it went badly: the next drill checks the mend.
    expect(drills.last).toMatchObject({
      doneOn: "2051-05-01",
      wentWell: false,
    });
    expect(drills.dueOn).toBe("2051-08-01");
    expect(drills.drills.map((one) => one.doneOn).slice(0, 2)).toEqual([
      "2051-05-01",
      "2051-01-18",
    ]);
  });

  it("is not a day still to come, and not Barn Staff's or the Vet's to write", async () => {
    const manager = await as("manager", "2051-05-03T06:00:00.000Z");
    await expect(
      manager.client.backups.recordDrill({
        doneOn: "2051-05-04",
        wentWell: true,
      })
    ).rejects.toMatchObject({ data: { refusal: "drill_not_done_yet" } });
    for (const role of ["staff", "vet"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const them = await as(role, "2051-05-03T06:00:00.000Z");
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        them.client.backups.recordDrill({
          doneOn: "2051-05-02",
          wentWell: true,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("tells the Owner once it is overdue, and the notice goes once a drill is written down", async () => {
    const farmId = theFarm().id;
    // A quarter after 1 May is 1 August: overdue from the 2nd.
    expect(
      await drillOverdue(scratchDb(), farmId, new Date("2051-08-01T12:00:00Z"))
    ).toBeNull();
    const late = new Date("2051-08-05T06:00:00.000Z");
    const overdue = await drillOverdue(scratchDb(), farmId, late);
    expect(overdue).toMatchObject({
      kind: "restore_drill_overdue",
      id: "drill:2051-08-01",
    });

    await scratchDb().transaction((tx) =>
      tellTheOwnerAboutTheMachinery(tx, farmId, overdue ? [overdue] : [], late)
    );
    const showing = () =>
      scratchDb().query.alert.findMany({
        where: {
          farmId,
          kind: "restore_drill_overdue",
          dismissedAt: { isNull: true },
        },
      });
    const told = await showing();
    expect(told.length).toBeGreaterThan(0);
    const owner = await as("owner", "2051-08-05T06:00:00.000Z");
    expect(await owner.client.backups.drills()).toMatchObject({
      dueOn: "2051-08-01",
      overdue: true,
    });

    await owner.client.backups.recordDrill({
      doneOn: "2051-08-05",
      wentWell: true,
    });
    const farm = await scratchDb().query.farm.findFirst({
      where: { id: farmId },
    });
    await settleWhatIsSettled({
      db: scratchDb(),
      farm,
      clock: new FakeClock("2051-08-05T07:00:00.000Z"),
    } as unknown as Turning);
    expect(await showing()).toEqual([]);
  });

  it("says who did it — the one writing it down unless they name the other — and only one who runs the farm", async () => {
    await as("staff", "2051-08-06T05:00:00.000Z");
    const manager = await as("manager", "2051-08-06T06:00:00.000Z");
    await manager.client.backups.recordDrill({
      doneOn: "2051-08-06",
      wentWell: true,
      doneBy: thePerson("owner").id,
    });
    const named = await manager.client.backups.drills();
    expect(named.last).toMatchObject({
      doneByName: thePerson("owner").name,
      recordedByName: thePerson("manager").name,
    });
    await expect(
      manager.client.backups.recordDrill({
        doneOn: "2051-08-06",
        wentWell: true,
        doneBy: thePerson("staff").id,
      })
    ).rejects.toMatchObject({
      data: { refusal: "drill_done_by_who_runs_the_farm" },
    });

    const later = await as("manager", "2051-08-07T06:00:00.000Z");
    await later.client.backups.recordDrill({
      doneOn: "2051-08-07",
      wentWell: true,
    });
    const own = await later.client.backups.drills();
    expect(own.last).toMatchObject({ doneByName: thePerson("manager").name });
  });

  it("stands as last written down, though it puts the drill on an earlier day than the one it corrects", async () => {
    const wrong = await as("owner", "2051-09-10T06:00:00.000Z");
    await wrong.client.backups.recordDrill({
      doneOn: "2051-09-09",
      wentWell: true,
    });
    const right = await as("owner", "2051-09-10T07:00:00.000Z");
    await right.client.backups.recordDrill({
      doneOn: "2051-08-09",
      wentWell: true,
      note: "The day was typed wrong: it was done a month ago",
    });

    const drills = await right.client.backups.drills();
    expect(drills.last).toMatchObject({ doneOn: "2051-08-09" });
    expect(drills.dueOn).toBe("2051-11-09");
    const standing = await drillOverdue(
      scratchDb(),
      theFarm().id,
      new Date("2051-11-10T06:00:00.000Z")
    );
    expect(standing).toMatchObject({ id: "drill:2051-11-09" });
  });
});
