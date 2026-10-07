import { alert } from "@OpenFarm/db/schema/alert";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A notice whose cause has gone is cleared by the next sweep (the Owner, 2026-10-06). That rule reached five kinds; the
// rest stood until somebody tapped them away, and a Missing a Correction took back — its row deleted — kept its red
// notice for good, because nothing could find it to ask.

const suffix = `${Date.now()}`;
const NOW = "2094-02-01T04:00:00.000Z";

/** A notice to the Owner, still showing, about a thing that is no longer so. */
const showing = (
  kind:
    | "animal_missing"
    | "needs_review"
    | "receivable_overdue"
    | "reimbursement_due"
    | "monthly_sum_missed"
    | "investor_statement_due"
    | "withdrawal_ending"
    | "pen_sores_seen",
  entityId: string
) => ({
  id: `${kind}-${suffix}`,
  farmId: theFarm().id,
  userId: thePerson("owner").id,
  kind,
  entity: "sync_entry",
  entityId,
  params: {},
  createdAt: new Date(NOW),
});

describe("a notice whose cause has gone", () => {
  it("is cleared by the sweep: a Missing taken back, a review dealt with, a debt no longer overdue", async () => {
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock(NOW),
    });
    const notices = [
      showing("animal_missing", `missing-taken-back-${suffix}`),
      showing("needs_review", `review-dealt-with-${suffix}`),
      showing("receivable_overdue", `sale-paid-${suffix}@2094-01-01`),
    ];
    await scratchDb().insert(alert).values(notices);

    await owner.client.alerts.sweep();

    const after = await scratchDb().query.alert.findMany({
      where: { id: { in: notices.map((one) => one.id) } },
      columns: { kind: true, dismissedAt: true },
    });
    expect(after).toHaveLength(3);
    expect(after.filter((one) => one.dismissedAt === null)).toEqual([]);
  });

  it("is cleared for money repaid, a sum paid late, a Venture shut, a hold moved and sores withdrawn — and stays while so", async () => {
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock(NOW),
    });
    const shed = await owner.client.sheds.create({ name: `settle-${suffix}` });
    const pen = await owner.client.sheds.pens.create({
      shedId: shed.id,
      name: `পেন ${suffix}`,
    });
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    const { animal } = await import("@OpenFarm/db/schema/herd");
    const { eq } = await import("@OpenFarm/db/operators");
    const held = new Date("2094-02-03T04:00:00.000Z");
    await scratchDb()
      .update(animal)
      .set({ milkWithdrawalUntil: held })
      .where(eq(animal.id, cow.id));
    const gone = [
      showing("reimbursement_due", `no-venture-${suffix}:2094-01`),
      showing("monthly_sum_missed", `no-agreement-${suffix}|2094-01-07`),
      showing("investor_statement_due", `no-venture-${suffix}:2094-01`),
      showing(
        "withdrawal_ending",
        `${cow.id}:${new Date("2094-02-02T04:00:00.000Z").toISOString()}`
      ),
      showing("pen_sores_seen", `${pen.id}:no-such-sighting-${suffix}`),
    ];
    const stillSo = {
      ...showing("withdrawal_ending", `${cow.id}:${held.toISOString()}`),
      id: `withdrawal-still-${suffix}`,
    };
    await scratchDb()
      .insert(alert)
      .values([...gone, stillSo]);

    await owner.client.alerts.sweep();

    const after = await scratchDb().query.alert.findMany({
      where: { id: { in: [...gone, stillSo].map((one) => one.id) } },
      columns: { id: true, dismissedAt: true },
    });
    const showingNow = after
      .filter((one) => one.dismissedAt === null)
      .map((one) => one.id);
    expect(showingNow).toEqual([stillSo.id]);
  });
});
