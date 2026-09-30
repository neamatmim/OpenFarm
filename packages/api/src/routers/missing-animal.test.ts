import { goesNow, standardPlaybook } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { PushMessage, PushTarget, PushTransport } from "../push";
import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

// The round's "Animal not found" is heard: a Missing opens against her, the Owner and the Manager are told once and at
// once, both homes and her page list her, and the Manager's Found closes it.

const suffix = `missing-${Date.now()}`;
const NOT_FOUND = "পশু পাওয়া যায়নি";
const WELL = "সুস্থ — চোখে পড়ার মতো কিছু নেই";

let roundId = "";
let wordsOnlyId = "";

const as = (
  role: "owner" | "manager" | "staff",
  instant: string,
  push?: PushTransport
) =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(instant),
    push,
  });

beforeAll(async () => {
  const owner = await as("owner", "2054-01-01T00:00:00.000Z");
  const round = await owner.client.sops.create({
    content: standardPlaybook().healthRound,
  });
  roundId = round.definitionId;
  // The same words with nothing meant by them: a farm's own round, written before the words meant anything.
  const standard = standardPlaybook().healthRound;
  const wordsOnly = await owner.client.sops.create({
    content: {
      ...standard,
      name: { bn: `শুধু কথা ${suffix}` },
      steps: standard.steps.map((step) => ({
        ...step,
        skipReasons: step.skipReasons.map(({ bn, en }) => ({ bn, en })),
      })),
    },
  });
  wordsOnlyId = wordsOnly.definitionId;
});

/** A Pen of its own, with one animal in it, for each question. */
const aPenWithHer = async (name: string) => {
  const owner = await as("owner", "2054-01-01T00:00:00.000Z");
  const shed = await owner.client.herd.createShed({
    name: `${suffix}-${name}`,
  });
  const pen = await owner.client.herd.createPen({ shedId: shed.id, name });
  const her = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  return { penId: pen.id, tag: her.tagNumber };
};

/** The round in her Pen on a morning, recorded for her as the Manager records it. */
const theRound = async (
  day: string,
  penId: string,
  tag: string,
  answer: { skipReason: string } | { evidence: string[] },
  definitionId = roundId
) => {
  const manager = await as("manager", `${day}T02:30:00.000Z`);
  await manager.client.instances.ensureDue();
  const today = await manager.client.instances.today({ penId });
  const work = today.find((row) => row.definitionId === definitionId);
  if (!work) {
    throw new Error("expected the round");
  }
  await manager.client.instances.claim({ id: work.id });
  await manager.client.instances.completeStep({
    instanceId: work.id,
    stepId: "look",
    animalTag: tag,
    evidence: [],
    ...answer,
  });
  const done = await scratchDb().query.stepCompletion.findFirst({
    where: { instanceId: work.id, stepId: "look" },
    columns: { id: true },
  });
  return { manager, completionId: done?.id ?? "" };
};

const openFor = async (tag: string) => {
  const her = await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber: tag },
    columns: { id: true },
  });
  return scratchDb().query.missing.findMany({
    where: { animalId: her?.id ?? "", foundAt: { isNull: true } },
    columns: { id: true },
  });
};

const toldAbout = async (tag: string, role: "owner" | "manager" | "staff") => {
  const rows = await scratchDb().query.alert.findMany({
    where: { kind: "animal_missing", userId: thePerson(role).id },
    columns: { params: true },
  });
  return rows.filter((one) => (one.params as { tag?: string }).tag === tag)
    .length;
};

describe("an animal the round could not find", () => {
  it("opens one Missing, however many mornings the round cannot find her", async () => {
    const { penId, tag } = await aPenWithHer("খোঁজা পেন ক");
    await theRound("2054-02-01", penId, tag, { skipReason: NOT_FOUND });
    const first = await openFor(tag);
    expect(first).toHaveLength(1);

    await theRound("2054-02-02", penId, tag, { skipReason: NOT_FOUND });
    expect(await openFor(tag)).toEqual(first);
  });

  it("is on both homes and on her page, with where the round looked", async () => {
    const { penId, tag } = await aPenWithHer("খোঁজা পেন খ");
    const { manager } = await theRound("2054-02-03", penId, tag, {
      skipReason: NOT_FOUND,
    });

    const managerHome = await manager.client.home.manager();
    expect(
      managerHome.queue.missing.find((one) => one.tag === tag)
    ).toMatchObject({ penName: "খোঁজা পেন খ" });
    const owner = await as("owner", "2054-02-03T04:00:00.000Z");
    const ownerHome = await owner.client.home.owner();
    expect(ownerHome.needsYou.missing.map((one) => one.tag)).toContain(tag);
    const page = await owner.client.animals.byTag({ tagNumber: tag });
    expect(page.missing).toMatchObject({ penName: "খোঁজা পেন খ" });
  });

  it("opens nothing when she is passed as well", async () => {
    const { penId, tag } = await aPenWithHer("খোঁজা পেন গ");
    await theRound("2054-02-04", penId, tag, { skipReason: WELL });
    expect(await openFor(tag)).toHaveLength(0);
  });

  it("is heard from what the reason means, not from its words", async () => {
    const { penId, tag } = await aPenWithHer("খোঁজা পেন ঘ");
    await theRound(
      "2054-02-05",
      penId,
      tag,
      { skipReason: NOT_FOUND },
      wordsOnlyId
    );
    expect(await openFor(tag)).toHaveLength(0);
  });

  it("is taken back when the round is put right to say she was there", async () => {
    const { penId, tag } = await aPenWithHer("খোঁজা পেন ঙ");
    const { manager, completionId } = await theRound("2054-02-06", penId, tag, {
      skipReason: NOT_FOUND,
    });
    expect(await openFor(tag)).toHaveLength(1);

    await correctStepAsShown(manager.client, {
      completionId,
      reason: "ভুল পেনে খোঁজা হয়েছিল",
      skipReason: WELL,
    });
    expect(await openFor(tag)).toHaveLength(0);
    const home = await manager.client.home.manager();
    expect(home.queue.missing.map((one) => one.tag)).not.toContain(tag);
  });

  it("is not listed once she has left the farm", async () => {
    const { penId, tag } = await aPenWithHer("খোঁজা পেন চ");
    const { manager } = await theRound("2054-02-07", penId, tag, {
      skipReason: NOT_FOUND,
    });
    await manager.client.animals.recordMortality({
      tagNumber: tag,
      kind: "died",
      happenedAt: new Date("2054-02-06T20:00:00.000Z"),
      cause: "সাপের কামড়",
      disposal: "buried",
    });
    const home = await manager.client.home.manager();
    expect(home.queue.missing.map((one) => one.tag)).not.toContain(tag);
  });
});

/** Everything the farm tried to push, and to whom. */
const listeningPost = () => {
  const sent: { target: PushTarget; message: PushMessage }[] = [];
  const transport: PushTransport = {
    send: (target, message) => {
      sent.push({ target, message });
      return Promise.resolve({ delivered: true, gone: false });
    },
  };
  return { transport, sent };
};

describe("who is told", () => {
  it("goes at once, not with the evening's post", () => {
    expect(goesNow("animal_missing")).toBe(true);
  });

  it("tells the Owner and the Manager once, and pushes it", async () => {
    const { penId, tag } = await aPenWithHer("খোঁজা পেন ছ");
    const post = listeningPost();
    const owner = await as("owner", "2054-02-08T02:00:00.000Z", post.transport);
    const endpoint = `https://fcm.googleapis.com/fcm/send/${suffix}`;
    await owner.client.push.listen({
      endpoint,
      p256dh: "test-p256dh-key",
      auth: "test-auth-key",
    });
    await theRound("2054-02-08", penId, tag, { skipReason: NOT_FOUND });

    const sweeping = await as(
      "owner",
      "2054-02-08T03:00:00.000Z",
      post.transport
    );
    await sweeping.client.alerts.sweep();
    await sweeping.client.alerts.sweep();

    expect(await toldAbout(tag, "owner")).toBe(1);
    expect(await toldAbout(tag, "manager")).toBe(1);
    expect(await toldAbout(tag, "staff")).toBe(0);
    const theirs = post.sent.filter(
      (one) =>
        one.target.endpoint === endpoint && one.message.body.includes(tag)
    );
    expect(theirs).toHaveLength(1);
  });
});

describe("found", () => {
  it("closes the Missing, and a later morning that cannot find her opens a new one", async () => {
    const { penId, tag } = await aPenWithHer("খোঁজা পেন জ");
    const { manager } = await theRound("2054-02-09", penId, tag, {
      skipReason: NOT_FOUND,
    });
    const [before] = await openFor(tag);

    await manager.client.animals.found({ tagNumber: tag });
    expect(await openFor(tag)).toHaveLength(0);
    const page = await manager.client.animals.byTag({ tagNumber: tag });
    expect(page.missing).toBeNull();

    await theRound("2054-02-10", penId, tag, { skipReason: NOT_FOUND });
    const [after] = await openFor(tag);
    expect(after?.id).toBeDefined();
    expect(after?.id).not.toBe(before?.id);
  });

  it("is refused for an animal nobody is looking for", async () => {
    const { tag } = await aPenWithHer("খোঁজা পেন ঝ");
    const manager = await as("manager", "2054-02-11T04:00:00.000Z");
    await expect(
      manager.client.animals.found({ tagNumber: tag })
    ).rejects.toThrow("That animal is not missing");
  });

  it("is the Manager's or the Owner's to say, not Barn Staff's", async () => {
    const { penId, tag } = await aPenWithHer("খোঁজা পেন ঞ");
    await theRound("2054-02-12", penId, tag, { skipReason: NOT_FOUND });
    const staff = await as("staff", "2054-02-12T04:00:00.000Z");
    await expect(
      staff.client.animals.found({ tagNumber: tag })
    ).rejects.toThrow();
    expect(await openFor(tag)).toHaveLength(1);
  });
});
