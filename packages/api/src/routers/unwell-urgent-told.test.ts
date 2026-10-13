import { standardPlaybook } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { PushMessage, PushTarget, PushTransport } from "../push";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Bloat and labored breathing kill within hours. The round that sees one raises the Manager an hour's work, and the
// Manager used to hear of it only when that hour had run out and the work was late. Now the work is told the moment it
// is raised, by push, through the quiet hours as a notifiable disease is; and while it waits the Manager's home says it
// is theirs to do, never "nothing needs you".

const suffix = `unwell-urgent-told-${Date.now()}`;
const ENDPOINT = `https://fcm.googleapis.com/fcm/send/${suffix}`;

const sent: { target: PushTarget; message: PushMessage }[] = [];
const transport: PushTransport = {
  send: (target, message) => {
    sent.push({ target, message });
    return Promise.resolve({ delivered: true, gone: false });
  },
};

type Role = "owner" | "manager";
const as = (role: Role, instant: string) =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(instant),
    push: transport,
  });

let roundId = "";
let urgentId = "";

beforeAll(async () => {
  const owner = await as("owner", "2061-05-01T00:00:00.000Z");
  const manager = await as("manager", "2061-05-01T00:00:00.000Z");
  const playbook = standardPlaybook();
  const [round, , urgent] = await Promise.all([
    owner.client.sops.create({ content: playbook.healthRound }),
    owner.client.sops.create({ content: playbook.seeToUnwell }),
    owner.client.sops.create({ content: playbook.seeToUnwellUrgent }),
  ]);
  roundId = round.definitionId;
  urgentId = urgent.definitionId;
  await manager.client.push.subscribe({
    endpoint: ENDPOINT,
    p256dh: "test-p256dh-key",
    auth: "test-auth-key",
  });
});

/** A cow in a Pen of her own, so each question's work is hers alone. */
const aCow = async (name: string) => {
  const owner = await as("owner", "2061-05-01T00:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: `${suffix}-${name}` });
  const pen = await owner.client.sheds.pens.create({ shedId: shed.id, name });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  return { penId: pen.id, tag: cow.tagNumber };
};

/** The morning round in her Pen, recording what was seen of her at an instant. */
const seen = async (
  instant: string,
  cow: { penId: string; tag: string },
  saw: string
) => {
  const manager = await as("manager", instant);
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today({ penId: cow.penId });
  const id = today.find((row) => row.definitionId === roundId)?.id ?? "";
  await manager.client.work.claim({ id });
  await manager.client.work.completeStep({
    instanceId: id,
    stepId: "look",
    animalTag: cow.tag,
    evidence: [saw],
  });
};

/** The day turned at an instant, as the Manager opening the app turns it. */
const theDayTurns = async (instant: string) => {
  const manager = await as("manager", instant);
  await manager.client.work.ensureDue();
};

/** The urgent work about her, once the day has raised it. */
const urgentWorkFor = async (cow: { tag: string }) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber: cow.tag },
    columns: { id: true },
  });
  return await scratchDb().query.sopInstance.findFirst({
    where: {
      farmId: theFarm().id,
      animalId: her?.id ?? "",
      definitionId: urgentId,
    },
    columns: { id: true },
  });
};

const toldOf = async (role: Role, entityId: string) =>
  await scratchDb().query.alert.findMany({
    where: {
      kind: "unwell_urgent",
      entityId,
      userId: thePerson(role).id,
    },
    columns: { params: true },
  });

const pushedAbout = (tag: string) =>
  sent.filter(
    (one) => one.target.endpoint === ENDPOINT && one.message.body.includes(tag)
  );

describe("an urgent sighting, told the moment its work is raised", () => {
  it("tells the Manager at once, by push, naming her and what was seen", async () => {
    const cow = await aCow("ফাঁপা পেন");
    // Half past eight in the morning, farm time.
    await seen("2061-05-02T02:30:00.000Z", cow, "bloat");
    const manager = await as("manager", "2061-05-02T02:35:00.000Z");
    await manager.client.work.ensureDue();
    const work = await urgentWorkFor(cow);
    expect(work).toBeDefined();
    const told = await toldOf("manager", work?.id ?? "");
    expect(told).toHaveLength(1);
    expect(told[0]?.params).toMatchObject({ tag: cow.tag, saw: "bloat" });
    expect(pushedAbout(cow.tag)).toHaveLength(1);
  });

  it("tells it once, however often the day turns", async () => {
    const cow = await aCow("একবার পেন");
    await seen("2061-05-03T02:30:00.000Z", cow, "breathing");
    for (const instant of [
      "2061-05-03T02:35:00.000Z",
      "2061-05-03T02:40:00.000Z",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one turn after the other, as the timer turns it
      await theDayTurns(instant);
    }
    const work = await urgentWorkFor(cow);
    expect(await toldOf("manager", work?.id ?? "")).toHaveLength(1);
    expect(pushedAbout(cow.tag)).toHaveLength(1);
  });

  it("wakes the farm: pushed in the quiet hours, as a notifiable disease is", async () => {
    const cow = await aCow("রাতের পেন");
    // Eleven at night, farm time: inside the farm's quiet hours.
    await seen("2061-05-04T17:00:00.000Z", cow, "bloat");
    await theDayTurns("2061-05-04T17:05:00.000Z");
    expect(pushedAbout(cow.tag)).toHaveLength(1);
  });

  it("tells nothing for a sighting that can wait a day", async () => {
    const cow = await aCow("খোঁড়া পেন");
    await seen("2061-05-05T02:30:00.000Z", cow, "lame");
    await theDayTurns("2061-05-05T02:35:00.000Z");
    const told = await scratchDb().query.alert.findMany({
      where: { farmId: theFarm().id, kind: "unwell_urgent" },
      columns: { params: true },
    });
    expect(
      told.filter((one) => (one.params as { tag?: string }).tag === cow.tag)
    ).toEqual([]);
    expect(pushedAbout(cow.tag)).toEqual([]);
  });
});

describe("the Manager's home while the work waits", () => {
  it("says it is theirs to do, and the day is never all clear over it", async () => {
    const cow = await aCow("ঘরের পেন");
    await seen("2061-05-06T02:30:00.000Z", cow, "bloat");
    const manager = await as("manager", "2061-05-06T02:40:00.000Z");
    await manager.client.work.ensureDue();
    const work = await urgentWorkFor(cow);
    const home = await manager.client.home.get();
    expect(home.queue.yours.map((row) => row.id)).toContain(work?.id);
    // Not late yet: it is not on the Overdue list, and that list is not what keeps the day from being all clear.
    expect(home.queue.overdue.map((row) => row.id)).not.toContain(work?.id);
  });

  it("is not the Owner's to do: the work is the Manager's", async () => {
    const cow = await aCow("মালিকের পেন");
    await seen("2061-05-07T02:30:00.000Z", cow, "bloat");
    const owner = await as("owner", "2061-05-07T02:40:00.000Z");
    await owner.client.work.ensureDue();
    const work = await urgentWorkFor(cow);
    const home = await owner.client.home.get();
    expect(home.queue.yours.map((row) => row.id)).not.toContain(work?.id);
  });

  it("leaves it once it goes late, for the Overdue list to hold", async () => {
    const cow = await aCow("দেরির পেন");
    await seen("2061-05-08T02:30:00.000Z", cow, "bloat");
    await theDayTurns("2061-05-08T02:35:00.000Z");
    const work = await urgentWorkFor(cow);
    // Two hours on: past the hour's grace.
    const later = await as("manager", "2061-05-08T04:35:00.000Z");
    const home = await later.client.home.get();
    expect(home.queue.yours.map((row) => row.id)).not.toContain(work?.id);
    expect(home.queue.overdue.map((row) => row.id)).toContain(work?.id);
  });
});
