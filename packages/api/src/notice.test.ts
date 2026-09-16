import { auditEvent } from "@OpenFarm/db/schema/audit";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { ALERT_KINDS, SAYS, goesNow } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { NOTICES, tell } from "./notice";
import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";

// Who hears each kind of Notice, and what raising one writes. The audience is the kind's to say, so these are about the
// table rather than about any one raiser: a kind with nobody to tell it to is a notice nobody ever gets.
//
// Each test asks whether the right sort of person was told and the wrong sort was not: who hears a kind of Notice is
// the kind's to say, and a farm may have two Managers.

const suffix = `${Date.now()}`;
const AT = "2044-03-02T04:00:00.000Z";

const db = () => scratchDb();

let world: { pen: string; staff: string };

beforeAll(async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(AT),
  });
  const shed = await client.herd.createShed({ name: `নোটিশ ${suffix}` });
  const pen = await client.herd.createPen({
    shedId: shed.id,
    name: `পেন ${suffix}`,
  });
  // The people this farm has: a Manager and a Vet to hear what is theirs, and a Barn Staff member who works that Pen,
  // so "the people of her Pen" has somebody in it.
  await createTestClient(appRouter, { as: "manager" });
  await createTestClient(appRouter, { as: "vet" });
  await createTestClient(appRouter, { as: "staff" });
  await db()
    .insert(penAssignment)
    .values({
      id: `pa-notice-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  world = { pen: pen.id, staff: thePerson("staff").id };
});

/** Who a Notice raised now reached. */
const toldBy = async (id: string) => {
  const rows = await db().query.alert.findMany({
    where: { farmId: theFarm().id, entityId: id },
    columns: { userId: true, kind: true, params: true },
  });
  return rows;
};

describe("who hears a Notice", () => {
  it("tells the Manager about the store running low, and nobody else", async () => {
    const id = `low-${suffix}`;
    const raised = await db().transaction((tx) =>
      tell(
        tx,
        theFarm().id,
        {
          kind: "low_stock",
          about: { id },
          facts: {
            feedItemId: `feed-${suffix}`,
            nameBn: "ভুট্টা",
            unit: "kg",
            onHand: 12,
            threshold: 50,
          },
        },
        new Date(AT)
      )
    );
    const heard = raised.map((one) => one.userId);
    expect(heard).toContain(thePerson("manager").id);
    // Not the milkers and not the Vet: a store running low is the Manager's to answer.
    expect(heard).not.toContain(world.staff);
    expect(heard).not.toContain(thePerson("vet").id);
    // Its facts are stored under the names the screens already read.
    const [told] = await toldBy(id);
    expect(told?.params).toMatchObject({ nameBn: "ভুট্টা", onHand: 12 });
  });

  it("tells the Manager and the people of her Pen that a hold is nearly over", async () => {
    const id = `withdrawal-${suffix}`;
    const raised = await db().transaction((tx) =>
      tell(
        tx,
        theFarm().id,
        {
          kind: "withdrawal_ending",
          about: { id, penId: world.pen },
          facts: { tag: "D-0001", animalId: `a-${suffix}`, until: AT },
        },
        new Date(AT)
      )
    );
    const heard = raised.map((one) => one.userId);
    expect(heard).toContain(thePerson("manager").id);
    expect(heard).toContain(world.staff);
  });

  it("tells whoever does the work that its procedure has changed", async () => {
    const id = `published-${suffix}`;
    const raised = await db().transaction((tx) =>
      tell(
        tx,
        theFarm().id,
        {
          kind: "sop_published",
          about: { id, assignedRole: "vet" },
          facts: { sopBn: `নতুন ${suffix}`, number: 2 },
        },
        new Date(AT)
      )
    );
    const heard = raised.map((one) => one.userId);
    // The Vets do this procedure, so the Vets hear of it — and the milkers, who do not, are left alone.
    expect(heard).toContain(thePerson("vet").id);
    expect(heard).not.toContain(world.staff);
  });

  it("writes the judgement owed in the same act as the notice about it", async () => {
    const id = `judgement-${suffix}`;
    const eventId = `event-${suffix}`;
    await db().transaction(async (tx) => {
      await tx.insert(auditEvent).values({
        id: eventId,
        farmId: theFarm().id,
        entity: "step_completion",
        entityId: id,
        action: "correct",
        actorId: thePerson("manager").id,
        roleUsed: "manager",
        recordedAt: new Date(AT),
        receivedAt: new Date(AT),
      });
      await tell(
        tx,
        theFarm().id,
        {
          kind: "needs_review",
          about: { id, entity: "step_completion", auditEventId: eventId },
          facts: { reason: "irreversible_effect", because: "moved_since" },
        },
        new Date(AT)
      );
    });
    const owed = await db().query.needsReview.findMany({
      where: { farmId: theFarm().id, entityId: id },
      columns: { reason: true, entity: true, resolvedAt: true },
    });
    expect(owed).toEqual([
      {
        reason: "irreversible_effect",
        entity: "step_completion",
        resolvedAt: null,
      },
    ]);
    // And the Manager is pointed at it, with why the Effect stood aside.
    const everyoneTold = await toldBy(id);
    const pointed = everyoneTold.find(
      (row) => row.userId === thePerson("manager").id
    );
    expect(pointed).toMatchObject({
      kind: "needs_review",
      params: { because: "moved_since" },
    });
  });

  it("tells the Owner what is the Owner's, and nobody else", async () => {
    // Money over the threshold, a change proposed to the Playbook, the Registration running out: three kinds, one
    // audience, and the Manager hears none of them.
    const owners = [
      {
        kind: "money_awaiting_approval" as const,
        id: `money-${suffix}`,
        facts: {
          moneyEventId: `m-${suffix}`,
          amountBdt: 40_000,
          categoryBn: "খাবার",
          categoryEn: "Feed",
        },
      },
      {
        kind: "sop_proposed" as const,
        id: `proposed-${suffix}`,
        facts: { sopBn: `প্রস্তাব ${suffix}`, sopEn: `Proposal ${suffix}` },
      },
      {
        kind: "registration_renewal_due" as const,
        id: `renewal-${suffix}`,
        facts: { expiresOn: AT },
      },
    ];
    for (const one of owners) {
      // Sequential: each is a telling of its own, as it is on the farm.
      // oxlint-disable-next-line no-await-in-loop
      const raised = await db().transaction((tx) =>
        tell(
          tx,
          theFarm().id,
          { kind: one.kind, about: { id: one.id }, facts: one.facts },
          new Date(AT)
        )
      );
      const heard = raised.map((row) => row.userId);
      expect(heard).toContain(thePerson("owner").id);
      expect(heard).not.toContain(thePerson("manager").id);
    }
  });

  it("tells the Owner and the Manager about a disease the farm must report", async () => {
    const id = `notifiable-${suffix}`;
    const raised = await db().transaction((tx) =>
      tell(
        tx,
        theFarm().id,
        {
          kind: "notifiable_diagnosis",
          about: { id },
          facts: { tag: "D-0003", disease: "তড়কা" },
        },
        new Date(AT)
      )
    );
    const heard = raised.map((row) => row.userId);
    // The Manager takes the letter to the office; the Owner answers for the farm if it does not go.
    expect(heard).toContain(thePerson("owner").id);
    expect(heard).toContain(thePerson("manager").id);
    expect(heard).not.toContain(world.staff);
  });

  it("tells a phone's own person that the farm would not take their entries", async () => {
    const id = `refused-${suffix}`;
    const raised = await db().transaction((tx) =>
      tell(
        tx,
        theFarm().id,
        {
          kind: "entry_rejected",
          about: { id, person: world.staff },
          facts: { count: 3, reason: "no animal with tag D-9999" },
        },
        new Date(AT)
      )
    );
    // Their own phone is holding the entries, so it is their own news and nobody else's.
    expect(raised.map((row) => row.userId)).toEqual([world.staff]);
  });

  it("says the same thing once, however often it is raised", async () => {
    const id = `twice-${suffix}`;
    const facts = { tag: "D-0002", until: AT };
    const first = await db().transaction((tx) =>
      tell(
        tx,
        theFarm().id,
        { kind: "withdrawal_changed", about: { id }, facts },
        new Date(AT)
      )
    );
    const again = await db().transaction((tx) =>
      tell(
        tx,
        theFarm().id,
        { kind: "withdrawal_changed", about: { id }, facts },
        new Date(AT)
      )
    );
    expect(first.length).toBeGreaterThan(0);
    // Nothing the second time: what comes back is what was written, and a notice already
    // sitting in somebody's list — dismissed or not — is not raised over.
    expect(again).toEqual([]);
  });
});

describe("the farm's list of who hears what", () => {
  it("has an audience for every kind of Notice the farm has", () => {
    for (const kind of ALERT_KINDS) {
      expect(NOTICES[kind].audience.length).toBeGreaterThan(0);
    }
  });

  it("gives every kind words in the app and in the evening's post", () => {
    for (const kind of ALERT_KINDS) {
      expect(SAYS[kind].app).toBeTruthy();
      expect(SAYS[kind].digest).toBeTruthy();
    }
  });

  it("gives every kind that goes now a way of reaching somebody who is not looking", () => {
    // In a pocket, or by text for the two the farm cannot afford to miss. A kind that goes now with neither would
    // reach only somebody who happened to open the app.
    for (const kind of ALERT_KINDS.filter(goesNow)) {
      expect(SAYS[kind].push ?? SAYS[kind].sms).toBeTruthy();
    }
  });
});
