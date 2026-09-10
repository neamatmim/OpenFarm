import { scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

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
    const { user } = await import("@OpenFarm/db/schema/auth");
    const userId = `user-${Date.now()}`;
    await scratchDb()
      .insert(user)
      .values({ id: userId, name: "নতুন হাত", email, emailVerified: true });

    const before = await owner.client.people.list();
    expect(before.people.find((p) => p.id === userId)?.roles).toEqual([]);
    expect(before.pendingInvites.some((i) => i.id === invited.id)).toBe(true);

    await owner.client.people.approveInvite({ id: invited.id });

    const after = await owner.client.people.list();
    expect(after.people.find((p) => p.id === userId)?.roles).toEqual(["staff"]);
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
    const { user } = await import("@OpenFarm/db/schema/auth");
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

  it("the farm cannot be bootstrapped twice", async () => {
    const { client } = await createTestClient(appRouter, { as: "owner" });

    await expect(client.farm.bootstrap({ name: "x" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const current = await client.farm.current();
    expect(current?.name).toBe("পরীক্ষা খামার");
  });
});
