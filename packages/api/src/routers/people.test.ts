import { user } from "@OpenFarm/db/schema/auth";
import {
  FakeClock,
  createTestPrincipal,
  scratchDb,
} from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { buildContext } from "../context";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

describe("roles", () => {
  it("tells a person which Roles they hold", async () => {
    const { client } = await createTestClient(appRouter, { as: "manager" });

    const me = await client.people.me();

    expect(me.roles).toEqual(["manager"]);
  });

  it("refuses a Staff client an Owner-only procedure", async () => {
    const { client } = await createTestClient(appRouter, { as: "staff" });

    await expect(
      client.people.approveInvite({ id: "any" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("a person with no Roles is signed in but can do nothing role-gated", async () => {
    const { client } = await createTestClient(appRouter, { as: "newcomer" });

    const me = await client.people.me();
    expect(me.roles).toEqual([]);
    await expect(client.people.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

/** Somebody who has just signed up with an email of their own, as the API sees them. */
const signedUp = async (email: string, name = "নতুন") => {
  const userId = `person-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await scratchDb()
    .insert(user)
    .values({ id: userId, name, email, emailVerified: false });
  const row = await scratchDb().query.user.findFirst({ where: { id: userId } });
  const session = await scratchDb().query.session.findFirst({
    where: { userId: "test-staff" },
  });
  if (!row || !session) {
    throw new Error("seed failed");
  }
  const context = await buildContext({
    session: { user: row, session: { ...session, userId } },
    clock: new FakeClock(),
    db: scratchDb(),
  });
  return {
    userId,
    context,
    client: createRouterClient(appRouter, { context }),
  };
};

describe("invitations", () => {
  it("a Manager's invite is not usable until the Owner approves it", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const owner = await createTestClient(appRouter, { as: "owner" });
    const email = `hand-${Date.now()}@test.openfarm`;

    const invited = await manager.client.people.invite({
      email,
      name: "নতুন হাত",
      roles: ["staff"],
    });
    expect(invited.status).toBe("pending");

    // the person signs up (simulated: their user row appears) before approval
    const userId = `user-${Date.now()}`;
    await scratchDb()
      .insert(user)
      .values({ id: userId, name: "নতুন হাত", email, emailVerified: true });

    const before = await owner.client.people.list();
    expect(before.people.find((p) => p.id === userId)?.roles).toEqual([]);
    expect(before.pendingInvites.some((i) => i.id === invited.id)).toBe(true);

    await owner.client.people.approveInvite({ id: invited.id });

    // Approved, but not taken up: the Roles wait for the person to enter the code they were handed.
    const after = await owner.client.people.list();
    expect(after.people.find((p) => p.id === userId)?.roles).toEqual([]);
    expect(after.pendingInvites.some((i) => i.id === invited.id)).toBe(false);
  });

  it("a Manager may not invite anyone but Staff", async () => {
    const { client } = await createTestClient(appRouter, { as: "manager" });

    await expect(
      client.people.invite({
        email: "v@test.openfarm",
        name: "V",
        roles: ["vet"],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("records the Role the inviter acted under", async () => {
    const { client } = await createTestClient(appRouter, { as: "owner" });

    const { id } = await client.people.invite({
      email: `cook-${Date.now()}@test.openfarm`,
      name: "C",
      roles: ["staff"],
    });
    const row = await scratchDb().query.invite.findFirst({ where: { id } });

    expect(row?.invitedByRole).toBe("owner");
    expect(row?.status).toBe("approved");
  });
});

describe("access", () => {
  it("the Owner can assign several Roles and the highest is the one used", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const userId = `multi-${Date.now()}`;
    await scratchDb()
      .insert(user)
      .values({
        id: userId,
        name: "M",
        email: `${userId}@test.openfarm`,
        emailVerified: true,
      });

    const result = await owner.client.people.assignRoles({
      userId,
      roles: ["staff", "manager"],
    });

    expect(result.roles.toSorted()).toEqual(["manager", "staff"]);
    const rows = await scratchDb().query.roleAssignment.findMany({
      where: { userId },
    });
    expect(rows.every((r) => r.grantedByRole === "owner")).toBe(true);
  });

  it("a disabled person is refused everywhere, even with a live session", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const vet = await createTestClient(appRouter, { as: "vet" });

    await owner.client.people.disable({ userId: "test-vet" });
    const afterDisable = await createTestClient(appRouter, { as: "vet" });

    await expect(afterDisable.client.people.me()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await owner.client.people.enable({ userId: "test-vet" });
    const restored = await vet.client.people.me();
    expect(restored.roles).toEqual(["vet"]);
  });

  it("a person signed in before the farm exists is told so, and can do nothing else", async () => {
    // The first person to sign up on a new install: a real session, and a database with no Farm in it yet.
    const principal = await createTestPrincipal("newcomer", new Date());
    const db = scratchDb();
    const noFarmYet = new Proxy(db, {
      get: (target, key) =>
        key === "query"
          ? {
              ...target.query,
              farm: { ...target.query.farm, findFirst: async () => {} },
            }
          : Reflect.get(target, key),
    });
    const context = await buildContext({
      session: { user: principal.user, session: principal.session },
      clock: new FakeClock(),
      db: noFarmYet,
    });
    const client = createRouterClient(appRouter, { context });

    // Who they are, and that there is no farm: the screen sends them to set it up.
    expect(await client.people.me()).toMatchObject({
      id: principal.user.id,
      farm: null,
      roles: [],
    });
    await expect(client.people.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("the farm cannot be bootstrapped twice", async () => {
    const { client } = await createTestClient(appRouter, { as: "owner" });

    await expect(client.farm.bootstrap({ name: "x" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const current = await client.farm.current();
    expect(current?.name).toBe("পরীক্ষা খামার");
  });
});

describe("review findings", () => {
  it("the farm always keeps an Owner: the sole Owner cannot drop their own Role", async () => {
    const { client } = await createTestClient(appRouter, { as: "owner" });

    await expect(
      client.people.assignRoles({ userId: "test-owner", roles: ["manager"] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const me = await client.people.me();
    expect(me.roles).toContain("owner");
  });

  it("an invite is taken up with its code, by the person it was addressed to, once", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const email = `coded-${Date.now()}@test.openfarm`;
    const { code } = await owner.client.people.invite({
      email,
      name: "কোড",
      roles: ["staff"],
    });
    expect(code).toMatch(/^[A-Z0-9]{8}$/u);

    // Signing up with the invited email is not enough on its own.
    const person = await signedUp(email);
    expect(person.context.roles).toEqual([]);
    const listed = await owner.client.people.list();
    expect(listed.awaitingSignup.some((i) => i.email === email)).toBe(true);

    // Somebody else holding the code cannot take it up either.
    const stranger = await signedUp(`stranger-${Date.now()}@test.openfarm`);
    await expect(
      stranger.client.people.acceptInvite({ code })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const taken = await person.client.people.acceptInvite({ code });
    expect(taken.roles).toEqual(["staff"]);
    await expect(
      person.client.people.acceptInvite({ code })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const after = await owner.client.people.list();
    expect(after.people.find((p) => p.id === person.userId)?.roles).toEqual([
      "staff",
    ]);
    expect(after.awaitingSignup.some((i) => i.email === email)).toBe(false);
  });

  it("a Manager's invite cannot be taken up until the Owner approves it, and a new code replaces the old", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const owner = await createTestClient(appRouter, { as: "owner" });
    const email = `waiting-${Date.now()}@test.openfarm`;
    const { id, code } = await manager.client.people.invite({
      email,
      name: "অপেক্ষা",
      roles: ["staff"],
    });
    const person = await signedUp(email);

    await expect(
      person.client.people.acceptInvite({ code })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await owner.client.people.approveInvite({ id });
    const { code: fresh } = await manager.client.people.reissueInviteCode({
      id,
    });
    await expect(
      person.client.people.acceptInvite({ code })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const taken = await person.client.people.acceptInvite({
      code: fresh.toLowerCase(),
    });
    expect(taken.roles).toEqual(["staff"]);
  });

  it("approving an invite is atomic: a second approval finds nothing and writes no audit row", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const owner = await createTestClient(appRouter, { as: "owner" });
    const { id } = await manager.client.people.invite({
      email: `twice-${Date.now()}@test.openfarm`,
      name: "T",
      roles: ["staff"],
    });

    await owner.client.people.approveInvite({ id });
    await expect(
      owner.client.people.approveInvite({ id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Ordered, because a query without one is answered in whatever order the database
    // finds the rows — and the trail is a sequence, so the test has to ask for it as one.
    const events = await scratchDb().query.auditEvent.findMany({
      where: { entity: "invite", entityId: id },
      orderBy: { receivedAt: "asc", id: "asc" },
    });
    expect(events.map((e) => e.action)).toEqual(["create", "update"]);
  });

  it("re-assigning Roles leaves kept Roles and their attribution untouched", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const userId = `keep-${Date.now()}`;
    await scratchDb()
      .insert(user)
      .values({
        id: userId,
        name: "K",
        email: `${userId}@test.openfarm`,
        emailVerified: true,
      });
    await owner.client.people.assignRoles({ userId, roles: ["staff"] });
    const [before] = await scratchDb().query.roleAssignment.findMany({
      where: { userId, role: "staff" },
    });

    await owner.client.people.assignRoles({ userId, roles: ["staff", "vet"] });

    const rows = await scratchDb().query.roleAssignment.findMany({
      where: { userId },
      orderBy: { role: "asc" },
    });
    expect(rows.map((r) => [r.role, r.revokedAt === null])).toEqual([
      ["staff", true],
      ["vet", true],
    ]);
    expect(rows.find((r) => r.role === "staff")?.createdAt).toEqual(
      before?.createdAt
    );
  });

  it("disabling a person expires their sessions", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await createTestClient(appRouter, { as: "vet" });

    await owner.client.people.disable({ userId: "test-vet" });

    const session = await scratchDb().query.session.findFirst({
      where: { userId: "test-vet" },
    });
    expect(
      session && session.expiresAt.getTime() <= owner.clock.now().getTime()
    ).toBe(true);
    await owner.client.people.enable({ userId: "test-vet" });
  });
});
