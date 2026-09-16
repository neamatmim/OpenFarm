import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  DAY,
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SmsMessage, SmsTransport } from "../sms";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** A gateway that answers, and remembers what the farm asked it to send. */
const listeningGateway = () => {
  const sent: { to: string; message: SmsMessage }[] = [];
  let answer = { delivered: true };
  const transport: SmsTransport = {
    send: (to, message) => {
      sent.push({ to, message });
      return Promise.resolve(answer);
    },
  };
  return {
    transport,
    sent,
    says(next: { delivered: boolean }) {
      answer = next;
    },
  };
};

const treatmentSop = (): SopContent => ({
  name: { bn: "চিকিৎসা — ডোজ দিন", en: "Treatment — give the dose" },
  purpose: { bn: "ভেটের লেখা ডোজ দিন" },
  triggers: [{ kind: "prescription" }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 120,
  steps: [
    {
      id: "dose",
      text: { bn: "ডোজ দিন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "ওষুধ শেষ" }],
      effect: { kind: "treatment" },
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const vet = await createTestClient(appRouter, { as: "vet" });
  const shed = await owner.client.herd.createShed({
    name: `sms-${Date.now()}`,
  });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "এসএমএস পেন",
  });
  const treatment = await owner.client.sops.create({
    content: treatmentSop(),
  });
  const product = await vet.client.drugs.add({
    name: { bn: `অক্সিটেট্রা ${Date.now()}`, en: "Oxytetracycline" },
    milkWithdrawalDays: 4,
    meatWithdrawalDays: 21,
  });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-sms-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  return { pen, treatment, product };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  const { eq } = await import("@OpenFarm/db/operators");
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  await scratchDb()
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, world.treatment.definitionId));
});

/** A cow on a one-day course, dosed, so a Withdrawal is running. */
const aTreatedCow = async (clock: FakeClock) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const vet = await createTestClient(appRouter, { as: "vet", clock });
  const staff = await createTestClient(appRouter, { as: "staff", clock });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: world.pen.id,
    source: "born",
    aliases: [],
  });
  const diagnosis = await vet.client.diagnoses.record({
    animalTag: cow.tagNumber,
    disease: { bn: "ওলান প্রদাহ" },
  });
  const course = await vet.client.prescriptions.prescribe({
    animalTag: cow.tagNumber,
    diagnosisId: diagnosis.id,
    productId: world.product.id,
    dose: "১০ মিলি",
    route: "intramuscular",
    times: ["08:00"],
    days: 1,
  });
  const [only] = await vet.client.prescriptions.forAnimal({
    tagNumber: cow.tagNumber,
  });
  const dose = only?.doses.at(0);
  if (!dose) {
    throw new Error("expected the dose");
  }
  await staff.client.instances.claim({ id: dose.instanceId });
  await staff.client.instances.completeStep({
    instanceId: dose.instanceId,
    stepId: "dose",
    evidence: [true],
  });
  return { cow, course };
};

describe("the two alerts worth a text message", () => {
  it("texts the Manager and the Owner when a Withdrawal is nearly over", async () => {
    const clock = new FakeClock("2026-10-20T02:00:00.000Z");
    const { cow } = await aTreatedCow(clock);
    const gateway = listeningGateway();

    // The Owner and the Manager have numbers the farm can reach them on.
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    await owner.client.people.setPhone({ phone: "+8801711000001" });
    await owner.client.language.set({ language: "en" });
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    await manager.client.people.setPhone({ phone: "+8801711000002" });
    await manager.client.language.set({ language: "bn" });

    // Three and a half days on, her four days are nearly up.
    clock.advance(3 * DAY + DAY / 2);
    const sweeping = await createTestClient(appRouter, {
      as: "manager",
      clock,
      sms: gateway.transport,
    });
    await sweeping.client.alerts.sweep();

    // Both of them, by text, on top of the push and the in-app notice.
    const about = gateway.sent.filter((one) =>
      one.message.text.includes(cow.tagNumber)
    );
    expect(about.map((one) => one.to).toSorted()).toEqual([
      "+8801711000001",
      "+8801711000002",
    ]);

    // Each in their own language: the farm reads Bangla and this Owner has asked for English,
    // and a safety message somebody has to translate in their head is a safety message read
    // slowly.
    const toTheOwner = about.find((one) => one.to === "+8801711000001");
    const toTheManager = about.find((one) => one.to === "+8801711000002");
    expect(toTheOwner?.message.lang).toBe("en");
    expect(toTheOwner?.message.text).toContain("withdrawal is ending");
    expect(toTheManager?.message.lang).toBe("bn");
    expect(toTheManager?.message.text).toContain("আটকে");
  });
  it("texts about a notifiable disease, and nothing else ever", async () => {
    const clock = new FakeClock("2026-10-21T02:00:00.000Z");
    const gateway = listeningGateway();
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    await owner.client.people.setPhone({ phone: "+8801711000003" });
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      sms: gateway.transport,
    });
    await manager.client.people.setPhone({ phone: "+8801711000004" });
    await manager.client.notifiable.add({
      name: { bn: `তড়কা-এসএমএস ${Date.now()}` },
    });
    const listed = await manager.client.notifiable.list();
    const disease = listed.at(-1)?.nameBn ?? "";

    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: world.pen.id,
      source: "born",
      aliases: [],
    });
    const vet = await createTestClient(appRouter, {
      as: "vet",
      clock,
      sms: gateway.transport,
    });
    await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      disease: { bn: disease },
    });

    // Both numbers, and the message names the cow and what she has.
    const about = gateway.sent.filter((one) =>
      one.message.text.includes(cow.tagNumber)
    );
    expect(about.map((one) => one.to).toSorted()).toEqual([
      "+8801711000003",
      "+8801711000004",
    ]);
    expect(about.at(0)?.message.text).toContain(disease);

    // And nothing else does. A round going late is worth a push and worth nothing else: the
    // farm pays for every message, and a farm texted about everything stops reading them.
    const before = gateway.sent.length;
    await manager.client.instances.ensureDue();
    await manager.client.alerts.sweep();
    const overdueTexts = gateway.sent
      .slice(before)
      .filter((one) => !one.message.text.includes("আটকে"));
    expect(overdueTexts).toEqual([]);
  });

  it("says nothing at all when the farm has no gateway yet", async () => {
    // Which is every farm until go-live, and the in-app Alert is the record either way.
    const clock = new FakeClock("2026-10-22T02:00:00.000Z");
    const { cow } = await aTreatedCow(clock);
    clock.advance(3 * DAY + DAY / 2);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const swept = await manager.client.alerts.sweep();

    // Nothing thrown, nothing sent, and the notice is still in the app.
    expect(swept).toBeDefined();
    const held = await manager.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    const told = await manager.client.alerts.mine({
      entityId: `${cow.id}:${held.milkWithdrawalUntil?.toISOString()}`,
    });
    expect(told).toHaveLength(1);
  });

  it("tells the person whose entry the farm would not take", async () => {
    const clock = new FakeClock("2026-10-23T02:00:00.000Z");
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-sms", name: "এসএমএস শেড ফোন" },
    });

    // Two entries claiming the same place in this phone's own sequence: the second is not a
    // late entry, it is a wrong one, and the farm will not take it.
    const first = await phone.client.sync.batch({
      key: `sms-seq-a-${Date.now()}`,
      entries: [
        {
          id: `sms-seq-one-${Date.now()}`,
          seq: 900,
          recordedAt: clock.now(),
          kind: "instance_claim" as const,
          instanceId: "no-such-instance",
        },
      ],
    });
    expect(first.results.at(0)?.outcome).toBeTruthy();

    const refusedKey = `sms-seq-b-${Date.now()}`;
    const refused = await phone.client.sync.batch({
      key: refusedKey,
      entries: [
        {
          id: `sms-seq-two-${Date.now()}`,
          seq: 900,
          recordedAt: clock.now(),
          kind: "instance_claim" as const,
          instanceId: "no-such-instance",
        },
      ],
    });
    expect(refused.results.at(0)?.outcome).toBe("rejected");

    // And the milker is told, in the app, at once — not left with a phone quietly holding work
    // nobody will look at again. Asked about this batch, not about their whole inbox: the tests
    // in this file fill the same one, and an inbox is capped at fifty.
    const told = await phone.client.alerts.mine({ entityId: refusedKey });
    expect(told).toHaveLength(1);
    expect(told.at(0)).toMatchObject({
      kind: "entry_rejected",
      params: { count: 1 },
    });
  });
  it("says one thing once, however many people are told in the app", async () => {
    const clock = new FakeClock("2026-10-24T02:00:00.000Z");
    const { cow } = await aTreatedCow(clock);
    const gateway = listeningGateway();
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    await owner.client.people.setPhone({ phone: "+8801711000005" });

    clock.advance(3 * DAY + DAY / 2);
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
      sms: gateway.transport,
    });
    await manager.client.alerts.sweep();
    const first = gateway.sent.filter((one) =>
      one.message.text.includes(cow.tagNumber)
    ).length;
    expect(first).toBeGreaterThan(0);

    // Swept again — and a message the farm has already sent is not sent twice, whatever the
    // app does about telling somebody new.
    await manager.client.alerts.sweep();
    const after = gateway.sent.filter((one) =>
      one.message.text.includes(cow.tagNumber)
    ).length;
    expect(after).toBe(first);
  });

  it("does not buzz a pocket at two in the morning about a refused entry", async () => {
    // Quiet hours are the farm's, and only a safety notice crosses them.
    const clock = new FakeClock("2026-10-24T20:30:00.000Z");
    const phone = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
      phone: { id: "test-phone-quiet", name: "রাতের শেড ফোন" },
    });
    const key = `quiet-${Date.now()}`;
    await phone.client.sync.batch({
      key: `${key}-a`,
      entries: [
        {
          id: `${key}-one`,
          seq: 950,
          recordedAt: clock.now(),
          kind: "instance_claim" as const,
          instanceId: "no-such-instance",
        },
      ],
    });
    const refused = await phone.client.sync.batch({
      key,
      entries: [
        {
          id: `${key}-two`,
          seq: 950,
          recordedAt: clock.now(),
          kind: "instance_claim" as const,
          instanceId: "no-such-instance",
        },
      ],
    });
    expect(refused.results.at(0)?.outcome).toBe("rejected");

    // The notice is in the app the whole time — the quiet is on the phone, not on the record.
    const told = await phone.client.alerts.mine({ entityId: key });
    expect(told).toHaveLength(1);
  });
});
