import { eq } from "@OpenFarm/db/operators";
import { user } from "@OpenFarm/db/schema/auth";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { beforeAll, describe, expect, it } from "vitest";

import { buildContext } from "../context";
import { createTestClient } from "../test/client";
import { endExpiredVisits } from "../visits-store";
import { appRouter } from "./index";

// A vet called in for a visit sees the animals they were called in for, does the Vet's work on them, and nothing else
// on the farm — until the visit ends.

const suffix = `${Date.now()}`;
const DURING = "2029-03-01T04:00:00.000Z";
const AFTER = "2029-03-04T01:00:00.000Z";

/** A person who has signed up, calling as themselves at a given moment. */
const calling = async (userId: string, at: string) => {
  const row = await scratchDb().query.user.findFirst({ where: { id: userId } });
  const session = await scratchDb().query.session.findFirst({
    where: { userId: "test-staff" },
  });
  if (!row || !session) {
    throw new Error("seed failed");
  }
  const context = await buildContext({
    session: {
      user: row,
      session: { ...session, userId, expiresAt: new Date("2099-01-01") },
    },
    clock: new FakeClock(at),
    db: scratchDb(),
  });
  return createRouterClient(appRouter, { context });
};

let world: { vetId: string; onCase: string; notOnCase: string };

beforeAll(async () => {
  const clock = new FakeClock(DURING);
  // Somebody's session to borrow the shape of, for the people this file signs up by hand.
  await createTestClient(appRouter, { as: "staff" });
  const { client: owner } = await createTestClient(appRouter, {
    as: "owner",
    clock,
  });
  const { client: manager } = await createTestClient(appRouter, {
    as: "manager",
    clock,
  });

  // The Manager calls a vet in for three days; the Owner approves.
  const email = `visiting-${suffix}@test.openfarm`;
  const invited = await manager.people.invite({
    email,
    name: "ডা. অতিথি",
    roles: ["vet"],
    visitUntil: "2029-03-03",
  });
  expect(invited.status).toBe("pending");
  await owner.people.approveInvite({ id: invited.id });
  const vetId = `visiting-vet-${suffix}`;
  await scratchDb()
    .insert(user)
    .values({ id: vetId, name: "ডা. অতিথি", email, emailVerified: false });
  const vet = await calling(vetId, DURING);
  await vet.people.acceptInvite({ code: invited.code });

  const shed = await owner.herd.createShed({ name: `visit-${suffix}` });
  const pen = await owner.herd.createPen({
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });
  const cow = {
    sex: "female" as const,
    side: "dairy" as const,
    state: "heifer" as const,
    source: "born" as const,
    aliases: [],
    penId: pen.id,
  };
  const onCase = await owner.animals.register(cow);
  const notOnCase = await owner.animals.register(cow);
  await manager.vetCases.open({
    tagNumber: onCase.tagNumber,
    vetId,
    reason: "খোঁড়াচ্ছে, দেখে যাবেন",
  });
  world = { vetId, onCase: onCase.tagNumber, notOnCase: notOnCase.tagNumber };
});

describe("a visiting Vet", () => {
  it("sees only the animals on their cases", async () => {
    const vet = await calling(world.vetId, DURING);
    const me = await vet.people.me();
    expect(me.scopes.vet?.kind).toBe("cases");
    const herd = await vet.animals.list({});
    expect(herd.map((beast) => beast.tagNumber)).toEqual([world.onCase]);
    await expect(
      vet.animals.byTag({ tagNumber: world.notOnCase })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const her = await vet.animals.byTag({ tagNumber: world.onCase });
    expect(her.tagNumber).toBe(world.onCase);
    const mine = await vet.vetCases.mine();
    expect(mine.cases.map((row) => row.tagNumber)).toEqual([world.onCase]);
  });

  it("does the Vet's work on a case, and not on any other animal", async () => {
    const vet = await calling(world.vetId, DURING);
    await vet.diagnoses.record({
      animalTag: world.onCase,
      disease: { bn: "খুরের ঘা" },
    });
    await expect(
      vet.diagnoses.record({
        animalTag: world.notOnCase,
        disease: { bn: "খুরের ঘা" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reaches nothing else a full Vet may", async () => {
    const vet = await calling(world.vetId, DURING);
    await expect(vet.farm.identity()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(vet.breeding.repeatBreeders()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(vet.observations.recent({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("reads none of the farm's settings, layout or notices beyond their cases", async () => {
    const vet = await calling(world.vetId, DURING);
    const me = await vet.people.me();
    expect(Object.keys(me.farm ?? {}).toSorted()).toEqual(["id", "name"]);
    // And their screens are told their Scope is their Cases, and nothing of the farm besides.
    expect(me.scopes).toMatchObject({ vet: { kind: "cases" } });
    await expect(vet.herd.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(vet.sops.card({ definitionId: "any" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(vet.alerts.sweep()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("sees a sighting's own words in the inbox, and no conclusion once the case is closed", async () => {
    const clock = new FakeClock(DURING);
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock,
    });
    await owner.observations.record({
      tagNumber: world.onCase,
      saw: "other",
      note: "চোখ দিয়ে পানি পড়ছে",
    });
    const vet = await calling(world.vetId, DURING);
    const inbox = await vet.diagnoses.waiting({});
    expect(inbox.find((row) => row.saw === "other")?.note).toBe(
      "চোখ দিয়ে পানি পড়ছে"
    );
    expect(inbox.every((row) => row.tagNumber === world.onCase)).toBe(true);

    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock,
    });
    const [open] = await manager.vetCases.forAnimal({
      tagNumber: world.onCase,
    });
    await manager.vetCases.close({ id: open?.id ?? "" });
    const closed = await calling(world.vetId, DURING);
    expect(await closed.diagnoses.mine({})).toEqual([]);
    await expect(
      closed.animals.byTag({ tagNumber: world.onCase })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Called in again for the rest of this file.
    await manager.vetCases.open({
      tagNumber: world.onCase,
      vetId: world.vetId,
      reason: "আবার দেখবেন",
    });
  });

  it("loses access when the visit ends, and their cases close", async () => {
    const later = await calling(world.vetId, AFTER);
    const after = await later.people.me();
    expect(after.roles).toEqual([]);
    await expect(
      later.animals.byTag({ tagNumber: world.onCase })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const system = await buildContext({
      session: null,
      clock: new FakeClock(AFTER),
      db: scratchDb(),
    });
    if (!system.farm) {
      throw new Error("no farm");
    }
    expect(
      await endExpiredVisits({ ...system, farm: system.farm })
    ).toBeGreaterThanOrEqual(1);
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(AFTER),
    });
    expect(
      await manager.vetCases.forAnimal({ tagNumber: world.onCase })
    ).toEqual([]);
  });
});

describe("a visiting Vet who also works the barn", () => {
  it("keeps what their other Role reaches", async () => {
    const clock = new FakeClock(DURING);
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock,
    });
    const email = `both-${suffix}@test.openfarm`;
    const asStaff = await owner.people.invite({
      email,
      name: "দুই কাজ",
      roles: ["staff"],
    });
    const asVet = await owner.people.invite({
      email,
      name: "দুই কাজ",
      roles: ["vet"],
      visitUntil: "2029-03-03",
    });
    const id = `both-${suffix}`;
    await scratchDb()
      .insert(user)
      .values({ id, name: "দুই কাজ", email, emailVerified: false });
    const first = await calling(id, DURING);
    await first.people.acceptInvite({ code: asStaff.code });
    await first.people.acceptInvite({ code: asVet.code });

    const both = await calling(id, DURING);
    const me = await both.people.me();
    expect(me.roles.toSorted()).toEqual(["staff", "vet"]);
    await expect(both.sops.list()).resolves.toBeDefined();

    // Called in about a cow outside any Pen of theirs: they see her with their Pens, and read her clinical record.
    await owner.vetCases.open({
      tagNumber: world.onCase,
      vetId: id,
      reason: "দুই কাজের মানুষ দেখবেন",
    });
    const withCase = await calling(id, DURING);
    const told = await withCase.people.me();
    expect(told.scopes).toMatchObject({
      staff: { kind: "pens_or_cases" },
      vet: { kind: "cases" },
    });
    const herd = await withCase.animals.list({});
    expect(herd.map((beast) => beast.tagNumber)).toContain(world.onCase);
    const her = await withCase.animals.byTag({ tagNumber: world.onCase });
    expect(her.diagnoses.length + her.observations.length).toBeGreaterThan(0);

    // And the work raised about her is on their list for today, as she is on their herd list: what a visit reaches
    // is added to what the barn does, not a second list they have to know to ask for.
    const { definitionId, versionId } = await owner.sops.create({
      content: {
        name: { bn: `তার চিকিৎসা ${suffix}`, en: "Her treatment" },
        purpose: { bn: "একটি পশুর কাজ" },
        triggers: [],
        assignedRole: "vet",
        checkerRole: null,
        graceMinutes: 60,
        steps: [
          {
            id: "look",
            text: { bn: "দেখুন" },
            repeatPerAnimal: false,
            evidence: [{ type: "tick", required: true }],
            skipReasons: [],
          },
        ],
      },
    });
    const workId = `case-work-${suffix}`;
    await scratchDb()
      .insert(sopInstance)
      .values({
        id: workId,
        farmId: TEST_FARM.id,
        definitionId,
        versionId,
        penId: her.penId,
        animalId: her.id,
        state: "due",
        dueAt: new Date(DURING),
        graceMinutes: 60,
        assignedRole: "vet",
        cause: `visit-test:${her.id}`,
        createdAt: new Date(DURING),
      });
    try {
      const today = await withCase.instances.today({});
      expect(today.map((work) => work.id)).toContain(workId);
      // And they may open it, though it stands in no Pen of theirs: it is about an animal on their Case.
      await expect(
        withCase.instances.get({ id: workId })
      ).resolves.toMatchObject({
        id: workId,
      });
    } finally {
      // The farm's list is every file's: nothing this test raised is left for a later clock to find late.
      await scratchDb()
        .update(sopInstance)
        .set({ state: "missed" })
        .where(eq(sopInstance.id, workId));
      await scratchDb()
        .update(sopDefinition)
        .set({ retiredAt: new Date(DURING) })
        .where(eq(sopDefinition.id, definitionId));
    }
  });
});
