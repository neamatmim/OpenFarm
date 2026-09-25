import { user } from "@OpenFarm/db/schema/auth";
import { invite } from "@OpenFarm/db/schema/farm";
import {
  FakeClock,
  HOUR,
  MINUTE,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import type { Tx } from "./audit";
import { audited } from "./audit";
import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";

const eventsFor = (entity: string, entityId: string) =>
  scratchDb().query.auditEvent.findMany({
    where: { entity, entityId },
    orderBy: { receivedAt: "asc", id: "asc" },
  });

describe("audit events", () => {
  it("records who did what, in which Role, on both clocks, with before and after", async () => {
    const clock = new FakeClock("2026-09-12T04:00:00.000Z");
    const { client } = await createTestClient(appRouter, {
      as: "owner",
      clock,
    });

    const { id } = await client.people.invite({
      email: `audited-${Date.now()}@test.openfarm`,
      name: "A",
      roles: ["staff"],
    });
    const [event] = await eventsFor("invite", id);

    expect(event).toMatchObject({
      action: "create",
      actorId: thePerson("owner").id,
      roleUsed: "owner",
      deviceId: null,
      deviceSeq: null,
      recordedAt: new Date("2026-09-12T04:00:00.000Z"),
      receivedAt: new Date("2026-09-12T04:00:00.000Z"),
      before: null,
    });
    expect(event?.after).toMatchObject({
      roles: ["staff"],
      status: "approved",
    });
  });

  it("leaves neither row when the audit insert fails after the domain write", async () => {
    const { context } = await createTestClient(appRouter, { as: "owner" });
    const email = `ghost-${Date.now()}@test.openfarm`;

    // A farm id that does not exist makes the audit row's foreign key fail after the
    // domain insert; both are in one transaction, so both roll back.
    await expect(
      audited(context, "no-such-farm").write(
        { entity: "invite", entityId: "x", action: "create" },
        (tx) =>
          tx.insert(invite).values({
            id: `inv-${Date.now()}`,
            farmId: theFarm().id,
            email,
            name: "Ghost",
            roles: ["staff"],
            status: "pending",
            invitedBy: thePerson("owner").id,
            invitedByRole: "owner",
          })
      )
    ).rejects.toThrow();

    expect(
      await scratchDb().query.invite.findMany({ where: { email } })
    ).toHaveLength(0);
  });

  it("keeps a before that read nothing as nothing, not what the write made", async () => {
    const { context } = await createTestClient(appRouter, { as: "owner" });
    const email = `made-${Date.now()}@test.openfarm`;
    const id = `inv-made-${Date.now()}`;
    const read = async (tx: Tx) => {
      const found = await tx.query.invite.findFirst({
        where: { id },
        columns: { email: true },
      });
      return found ? { ...found } : null;
    };

    await audited(context).write(
      {
        entity: "invite",
        entityId: id,
        action: "create",
        before: read,
        after: read,
      },
      (tx) =>
        tx.insert(invite).values({
          id,
          farmId: theFarm().id,
          email,
          name: "Made",
          roles: ["staff"],
          status: "pending",
          invitedBy: thePerson("owner").id,
          invitedByRole: "owner",
        })
    );

    const [event] = await eventsFor("invite", id);
    expect(event?.before).toBeNull();
    expect(event?.after).toEqual({ email });
  });

  it("writes no audit row when the domain write finds nothing (NOT_FOUND rolls back)", async () => {
    const { client } = await createTestClient(appRouter, { as: "owner" });

    await expect(
      client.people.enable({ userId: "ghost-user" })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    expect(await eventsFor("user", "ghost-user")).toHaveLength(0);
  });

  it("a Correction supersedes the previous event, needs a reason, and keeps the original readable", async () => {
    const clock = new FakeClock("2026-09-12T06:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const userId = `typo-${Date.now()}`;
    await scratchDb()
      .insert(user)
      .values({
        id: userId,
        name: "Rahmi",
        email: `${userId}@test.openfarm`,
        emailVerified: true,
      });
    await owner.client.people.assignRoles({ userId, roles: ["staff"] });
    clock.advance(MINUTE);

    await expect(
      owner.client.people.correctName({
        id: userId,
        changes: { name: { from: "Rahmi", to: "Rahim" } },
        reason: "",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await owner.client.people.correctName({
      id: userId,
      changes: { name: { from: "Rahmi", to: "Rahim" } },
      reason: "typo at invite",
    });

    const events = await eventsFor("user", userId);
    const correction = events.at(-1);
    expect(correction).toMatchObject({
      action: "correct",
      reason: "typo at invite",
      before: { name: "Rahmi" },
      after: { name: "Rahim" },
    });
    expect(correction?.supersedesId).toBe(events.at(-2)?.id);
    const row = await scratchDb().query.user.findFirst({
      where: { id: userId },
      columns: { name: true },
    });
    expect(row?.name).toBe("Rahim");
  });

  it("Owner sees everyone's actions; Staff see only their own; day filters are farm-local", async () => {
    const clock = new FakeClock("2026-09-13T04:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    await staff.client.language.set({ language: "en" });
    clock.advance(HOUR);
    await owner.client.people.invite({
      email: `seen-${Date.now()}@test.openfarm`,
      name: "S",
      roles: ["staff"],
    });

    const all = await owner.client.audit.list({
      fromDay: "2026-09-13",
      toDay: "2026-09-13",
      limit: 50,
    });
    const own = await staff.client.audit.list({
      fromDay: "2026-09-13",
      limit: 50,
    });

    expect(new Set(all.map((e) => e.actorId))).toEqual(
      new Set([thePerson("owner").id, thePerson("staff").id])
    );
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((e) => e.actorId === thePerson("staff").id)).toBe(true);
    const filtered = await owner.client.audit.list({
      entity: "invite",
      fromDay: "2026-09-13",
    });
    expect(filtered.every((e) => e.entity === "invite")).toBe(true);
    // 2026-09-13 farm-local (UTC+6) ends at 2026-09-13T18:00Z, so this test's own events
    // fall inside that day and none appear on the next. The tests around this one write
    // their own events, so the window is scoped to this actor.
    const nextDay = await owner.client.audit.list({
      fromDay: "2026-09-14",
      toDay: "2026-09-14",
      actorId: thePerson("owner").id,
      entity: "invite",
    });
    expect(nextDay).toEqual([]);
  });

  it("keeps who trusted the Owner with money, and how much, from the Manager's trail", async () => {
    const clock = new FakeClock("2026-09-15T04:00:00.000Z");
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const { id } = await owner.client.investors.record({
      name: `গোপন বিনিয়োগকারী ${Date.now()}`,
      phone: "01830000001",
      nid: "1984000000001",
      bankAccount: "IBBL 2050 1234 5678",
    });
    await owner.client.ventures.open({
      name: `গোপন ভেঞ্চার ${Date.now()}`,
      targetCapitalBdt: 2_000_000,
      floorBdt: 0,
      decideBy: "2046-08-15",
      targetWindowStart: "2047-05-17",
      targetWindowEnd: "2047-05-19",
      unitPriceBdt: 50_000,
      units: 40,
      cattleBudgetBdt: 1_500_000,
    });

    // Asked for by name, by the one record, or not at all, the Manager is shown none of it: the investors
    // page and every Venture's money are the Owner's alone, and the trail is not a way round them.
    await expect(
      manager.client.audit.list({ entity: "investor" })
    ).resolves.toEqual([]);
    await expect(
      manager.client.audit.list({ entity: "investor", entityId: id })
    ).resolves.toEqual([]);
    const everything = await manager.client.audit.list({
      fromDay: "2026-09-15",
      toDay: "2026-09-15",
      limit: 200,
    });
    expect(
      everything.filter((one) => ["investor", "venture"].includes(one.entity))
    ).toEqual([]);

    // The Owner still reads it all.
    const theirs = await owner.client.audit.list({
      entity: "investor",
      entityId: id,
    });
    expect(theirs[0]?.after).toMatchObject({
      bankAccount: "IBBL 2050 1234 5678",
    });
  });
});
