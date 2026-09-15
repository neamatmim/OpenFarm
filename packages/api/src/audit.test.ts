import { user } from "@OpenFarm/db/schema/auth";
import { invite } from "@OpenFarm/db/schema/farm";
import { FakeClock, HOUR, MINUTE, scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

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
      actorId: "test-owner",
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
            farmId: "test-farm",
            email,
            name: "Ghost",
            roles: ["staff"],
            status: "pending",
            invitedBy: "test-owner",
            invitedByRole: "owner",
          })
      )
    ).rejects.toThrow();

    expect(
      await scratchDb().query.invite.findMany({ where: { email } })
    ).toHaveLength(0);
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
      new Set(["test-owner", "test-staff"])
    );
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((e) => e.actorId === "test-staff")).toBe(true);
    const filtered = await owner.client.audit.list({
      entity: "invite",
      fromDay: "2026-09-13",
    });
    expect(filtered.every((e) => e.entity === "invite")).toBe(true);
    // 2026-09-13 farm-local (UTC+6) ends at 2026-09-13T18:00Z, so this test's own events
    // fall inside that day and none appear on the next. Other test files share the
    // database and write their own events, so the window is scoped to this actor.
    const nextDay = await owner.client.audit.list({
      fromDay: "2026-09-14",
      toDay: "2026-09-14",
      actorId: "test-owner",
      entity: "invite",
    });
    expect(nextDay).toEqual([]);
  });
});
