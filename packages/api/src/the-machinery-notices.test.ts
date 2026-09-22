import { backupRun } from "@OpenFarm/db/schema/backup";
import {
  FakeClock,
  HOUR,
  MINUTE,
  createTestPrincipal,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { Tx } from "./audit";
import type { Quiet } from "./the-machinery-notices";
import {
  backupGap,
  dayNotTurning,
  tellTheOwnerAboutTheMachinery,
} from "./the-machinery-notices";

// The farm's own machinery going quiet is the one thing nobody on the farm would notice: no work raised looks like a
// quiet morning, and no copy taken looks like nothing at all. So the Owner is told, once for each time it happens.

const farmId = theFarm().id;
const clock = new FakeClock("2049-03-10T06:00:00.000Z");
const now = clock.now();

/** Everything here is written inside a transaction that is then thrown away: copies are of the whole database and
 *  not any one farm's, and another file reading the copy history must not find these. For the same reason the
 *  history other files have written is cleared first, inside the same transaction, so each test reads its own. */
const ROLLED_BACK = new Error("rolled back");
const inside = async (run: (tx: Tx) => Promise<void>): Promise<void> => {
  try {
    await scratchDb().transaction(async (tx) => {
      await tx.delete(backupRun);
      await run(tx);
      throw ROLLED_BACK;
    });
  } catch (error) {
    if (error !== ROLLED_BACK) {
      throw error;
    }
  }
};

const aCopy = (tx: Tx, id: string, hoursAgo: number, ok: "yes" | "no") =>
  tx.insert(backupRun).values({
    id,
    kind: "nightly",
    startedAt: new Date(now.getTime() - hoursAgo * HOUR),
    finishedAt: new Date(now.getTime() - hoursAgo * HOUR + MINUTE),
    destination: "offsite:openfarm",
    ok,
  });

const toldTheOwner = (tx: Tx, kind: Quiet["kind"]) =>
  tx.query.alert.findMany({
    where: { farmId, kind, userId: thePerson("owner").id },
  });

beforeAll(async () => {
  await createTestPrincipal("owner", now);
  await createTestPrincipal("manager", now);
});

describe("copies of the farm that have stopped", () => {
  it("are nothing to say while the last good copy is less than a day and a half old", async () => {
    await inside(async (tx) => {
      await aCopy(tx, "copy-fresh", 30, "yes");
      await aCopy(tx, "copy-failed-since", 6, "no");
      expect(await backupGap(tx, now)).toBeNull();
    });
  });

  it("tell the Owner once, and not the Manager, when the last good copy is older than that", async () => {
    await inside(async (tx) => {
      await aCopy(tx, "copy-last-good", 40, "yes");
      await aCopy(tx, "copy-failed-last-night", 16, "no");
      const gap = await backupGap(tx, now);
      expect(gap).toMatchObject({ kind: "backup_overdue" });

      const first = await tellTheOwnerAboutTheMachinery(
        tx,
        farmId,
        gap ? [gap] : [],
        now
      );
      expect(first.map((told) => told.userId)).toEqual([thePerson("owner").id]);
      const [notice] = await toldTheOwner(tx, "backup_overdue");
      expect(notice?.params).toEqual({
        since: new Date(now.getTime() - 40 * HOUR).toISOString(),
      });

      // The next turn, five minutes on, finds the same gap and says nothing more about it.
      const again = await backupGap(tx, new Date(now.getTime() + 5 * MINUTE));
      expect(
        await tellTheOwnerAboutTheMachinery(
          tx,
          farmId,
          again ? [again] : [],
          now
        )
      ).toEqual([]);
    });
  });

  it("are counted from the first try on a farm whose copies have never once worked", async () => {
    await inside(async (tx) => {
      await aCopy(tx, "copy-never-worked", 50, "no");
      expect(await backupGap(tx, now)).toMatchObject({
        kind: "backup_overdue",
        since: new Date(now.getTime() - 50 * HOUR),
      });
    });
  });
});

describe("a Day Turning that has stopped", () => {
  const lastClean = new Date(now.getTime() - 45 * MINUTE);

  it("is nothing to say for a turn that went whole, or for a blip of a few minutes", () => {
    expect(dayNotTurning({ failed: false, lastOkAt: lastClean, now })).toBe(
      null
    );
    expect(
      dayNotTurning({
        failed: true,
        lastOkAt: new Date(now.getTime() - 10 * MINUTE),
        now,
      })
    ).toBeNull();
  });

  it("tells the Owner once when it has not turned whole for half an hour", async () => {
    const stopped = dayNotTurning({ failed: true, lastOkAt: lastClean, now });
    expect(stopped).toMatchObject({
      kind: "day_not_turning",
      since: lastClean,
    });
    await inside(async (tx) => {
      const told = await tellTheOwnerAboutTheMachinery(
        tx,
        farmId,
        stopped ? [stopped] : [],
        now
      );
      expect(told).toHaveLength(1);
      const later = dayNotTurning({
        failed: true,
        lastOkAt: lastClean,
        now: new Date(now.getTime() + HOUR),
      });
      expect(
        await tellTheOwnerAboutTheMachinery(
          tx,
          farmId,
          later ? [later] : [],
          now
        )
      ).toEqual([]);
    });
  });
});
