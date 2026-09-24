import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Retiring a procedure is how the Owner switches off a rule the farm published: nothing more of its work is raised,
// and the work it had raised that nobody has started is called off. Work somebody took is theirs to finish.

/** Late morning on a day in October, after the biosecurity check's 09:00 has come round. */
const onDay = (day: number) =>
  new FakeClock(`2026-10-${String(day).padStart(2, "0")}T05:30:00.000Z`);

const asOwner = (clock: FakeClock) =>
  createTestClient(appRouter, { as: "owner", clock });

/** The work a procedure has raised, oldest first, and where each piece stands. */
const workOf = (definitionId: string) =>
  scratchDb().query.sopInstance.findMany({
    where: { definitionId },
    columns: { id: true, state: true },
    orderBy: { dueAt: "asc" },
  });

/** A heifer in a Pen, so the farm's whole-farm work has somewhere to be owed. */
beforeAll(async () => {
  const { client } = await asOwner(onDay(1));
  const shed = await client.herd.createShed({ name: `retire-${Date.now()}` });
  const pen = await client.herd.createPen({ shedId: shed.id, name: "পেন" });
  await client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
});

describe("retiring a procedure", () => {
  it("calls off the work nobody started, leaves the work somebody took, and raises no more", async () => {
    const day1 = await asOwner(onDay(1));
    const { definitionId } = await day1.client.sops.create({
      content: standardPlaybook().biosecurity,
    });
    await day1.client.instances.ensureDue();
    const day2 = await asOwner(onDay(2));
    await day2.client.instances.ensureDue();
    const [owed, taken] = await workOf(definitionId);
    if (!(owed && taken)) {
      throw new Error("expected two days of the check");
    }
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: onDay(2),
    });
    await manager.client.instances.claim({ id: taken.id });

    const retired = await day2.client.sops.retire({
      definitionId,
      note: "the footbath is checked at the gate now",
    });

    expect(retired.calledOff).toBe(1);
    expect(await workOf(definitionId)).toEqual([
      { id: owed.id, state: "called_off" },
      { id: taken.id, state: "in_progress" },
    ]);
    const trail = await scratchDb().query.auditEvent.findMany({
      where: { entity: "sop_instance", entityId: owed.id, action: "update" },
      columns: { after: true },
    });
    expect(trail.map((event) => event.after)).toContainEqual({
      state: "called_off",
      calledOffBy: "sop_retired",
    });

    const card = await day2.client.sops.card({ definitionId });
    expect(card.retired).toBe(true);

    const day3 = await asOwner(onDay(3));
    await day3.client.instances.ensureDue();
    expect(await workOf(definitionId)).toHaveLength(2);
  });

  it("is the Owner's", async () => {
    const owner = await asOwner(onDay(4));
    const { definitionId } = await owner.client.sops.create({
      content: standardPlaybook().feeding,
    });
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: onDay(4),
    });

    await expect(
      manager.client.sops.retire({ definitionId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("stops it being changed: nothing is published, proposed or approved into it", async () => {
    const owner = await asOwner(onDay(5));
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: onDay(5),
    });
    const { feeding } = standardPlaybook();
    const { definitionId } = await owner.client.sops.create({
      content: feeding,
    });
    const waiting = await manager.client.sops.propose({
      definitionId,
      content: { ...feeding, graceMinutes: 60 },
    });

    await owner.client.sops.retire({ definitionId });

    const refusedAsRetired = { data: { refusal: "sop_retired" } };
    await expect(
      owner.client.sops.publish({ definitionId, content: feeding })
    ).rejects.toMatchObject(refusedAsRetired);
    await expect(
      manager.client.sops.propose({ definitionId, content: feeding })
    ).rejects.toMatchObject(refusedAsRetired);
    await expect(
      owner.client.sops.approveProposal({ id: waiting.id })
    ).rejects.toMatchObject(refusedAsRetired);
    const proposals = await owner.client.sops.proposals();
    expect(proposals.some((one) => one.id === waiting.id)).toBe(false);
  });
});

describe("bringing a procedure back", () => {
  it("raises its work again from the next time it is due, and what was called off stays called off", async () => {
    const day6 = await asOwner(onDay(6));
    const { definitionId } = await day6.client.sops.create({
      content: standardPlaybook().biosecurity,
    });
    await day6.client.instances.ensureDue();
    await day6.client.sops.retire({ definitionId });
    const [calledOff] = await workOf(definitionId);

    const day7 = await asOwner(onDay(7));
    await day7.client.sops.restore({ definitionId });
    await day7.client.instances.ensureDue();

    const work = await workOf(definitionId);
    expect(work.map((one) => one.state)).toEqual(["called_off", "due"]);
    expect(work[0]?.id).toBe(calledOff?.id);
    const listed = await day7.client.sops.list();
    expect(listed.find((one) => one.id === definitionId)?.retiredAt).toBeNull();
  });

  it("is refused while another procedure a prescription raises is in force", async () => {
    const owner = await asOwner(onDay(8));
    const { treatmentDose } = standardPlaybook();
    const first = await owner.client.sops.create({ content: treatmentDose });
    await owner.client.sops.retire({ definitionId: first.definitionId });
    // Retiring the first is what lets the farm write another.
    await owner.client.sops.create({ content: treatmentDose });

    await expect(
      owner.client.sops.restore({ definitionId: first.definitionId })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: { refusal: "treatment_sop_exists" },
    });
  });
});
