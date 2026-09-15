import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const suffix = `${Date.now()}`;

const penIdsOfStaff = async () => {
  const { client } = await createTestClient(appRouter, { as: "staff" });
  const me = await client.people.me();
  // Their Pens are their Scope as Barn Staff.
  return "penIds" in me.scope ? me.scope.penIds : [];
};

const staffIdOf = async (staff: {
  people: { me: () => Promise<{ id: string }> };
}) => {
  const me = await staff.people.me();
  return me.id;
};

/** Two Pens of this file's own: every test file shares the farm and its Staff member. */
let sheds = 0;
const twoPens = async () => {
  const { client: manager } = await createTestClient(appRouter, {
    as: "manager",
  });
  sheds += 1;
  const shed = await manager.herd.createShed({
    name: `assign-${suffix}-${sheds}`,
  });
  const first = await manager.herd.createPen({
    shedId: shed.id,
    name: `ক ${suffix}`,
  });
  const second = await manager.herd.createPen({
    shedId: shed.id,
    name: `খ ${suffix}`,
  });
  return { manager, first, second };
};

describe("assigning Pens", () => {
  it("gives a Staff member the Pens the Manager names, and takes away the ones left out", async () => {
    const { manager, first, second } = await twoPens();
    const { client: staff } = await createTestClient(appRouter, {
      as: "staff",
    });
    const staffId = await staffIdOf(staff);

    await manager.people.assignPens({
      userId: staffId,
      add: [first.id, second.id],
      remove: [],
    });
    expect(await penIdsOfStaff()).toEqual(
      expect.arrayContaining([first.id, second.id])
    );

    await manager.people.assignPens({
      userId: staffId,
      add: [],
      remove: [second.id],
    });
    const penIds = await penIdsOfStaff();
    expect(penIds).toContain(first.id);
    expect(penIds).not.toContain(second.id);

    const list = await manager.people.list();
    const row = list.people.find((person) => person.id === staffId);
    expect(row?.penIds).toContain(first.id);
    expect(row?.penIds).not.toContain(second.id);

    // Handing the Pen back works: the old assignment reopens instead of clashing with itself.
    await manager.people.assignPens({
      userId: staffId,
      add: [second.id],
      remove: [],
    });
    expect(await penIdsOfStaff()).toEqual(
      expect.arrayContaining([first.id, second.id])
    );
  });

  it("is recorded in the audit trail", async () => {
    const { manager, first } = await twoPens();
    const { client: staff } = await createTestClient(appRouter, {
      as: "staff",
    });
    const staffId = await staffIdOf(staff);

    await manager.people.assignPens({
      userId: staffId,
      add: [first.id],
      remove: [],
    });

    const trail = await manager.audit.list({
      entity: "user",
      entityId: staffId,
    });
    expect(
      trail.some(
        (event) =>
          event.entityId === staffId &&
          JSON.stringify(event.after ?? {}).includes(first.id)
      )
    ).toBe(true);
  });

  it("refuses a Pen that is not the farm's, and refuses Staff doing it", async () => {
    const { manager, first } = await twoPens();
    const { client: staff } = await createTestClient(appRouter, {
      as: "staff",
    });
    const staffId = await staffIdOf(staff);

    await expect(
      manager.people.assignPens({
        userId: staffId,
        add: ["no-such-pen"],
        remove: [],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      staff.people.assignPens({ userId: staffId, add: [first.id], remove: [] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
