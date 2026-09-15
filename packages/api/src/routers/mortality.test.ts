import type { SopContent } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** A daily round, so there is work in the Pen for a dead cow to disappear from. */
const roundSop = (): SopContent => ({
  name: { bn: "সকালের পরিদর্শন", en: "Morning round" },
  purpose: { bn: "প্রতিটি পশু দেখে নিন" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 120,
  steps: [
    {
      id: "look",
      text: { bn: "পশুটিকে দেখুন" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "পশু পাওয়া যায়নি" }],
    },
  ],
});

/** Work the farm hangs on a Move, so a dead cow has something of her own left open. */
const checkSop = (): SopContent => ({
  name: { bn: "স্থানান্তরের পর দেখা", en: "Post-move check" },
  purpose: { bn: "নতুন পেনে পশুটি কেমন আছে দেখুন" },
  triggers: [{ kind: "event", event: "move" }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 240,
  steps: [
    {
      id: "settled",
      text: { bn: "পশুটি থিতু হয়েছে?" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

/** The Playbook's mortality handling: raised by a death, and the Owner checks it. */
const handlingSop = (): SopContent => ({
  name: { bn: "মৃত পশু ব্যবস্থাপনা", en: "Mortality handling" },
  purpose: { bn: "মৃতদেহ ছয় ফুট গভীরে মাটিচাপা দিন" },
  triggers: [{ kind: "event", event: "death" }],
  assignedRole: "manager",
  checkerRole: "owner",
  graceMinutes: 720,
  steps: [
    {
      id: "buried",
      text: { bn: "ছয় ফুট গভীরে মাটিচাপা দেওয়া হয়েছে?" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const shed = await owner.client.herd.createShed({
    name: `mortality-${Date.now()}`,
  });
  const sop = await owner.client.sops.create({ content: roundSop() });
  const check = await owner.client.sops.create({ content: checkSop() });
  const handling = await owner.client.sops.create({ content: handlingSop() });
  return { shedId: shed.id, sop, check, handling };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** Hands the farm back: a round left standing raises work in every Pen on the farm. */
afterAll(async () => {
  const { sopDefinition } = await import("@OpenFarm/db/schema/sop");
  const { scratchDb } = await import("@OpenFarm/test-harness");
  const { inArray } = await import("@OpenFarm/db/operators");
  await scratchDb()
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(
      inArray(sopDefinition.id, [
        world.sop.definitionId,
        world.check.definitionId,
        world.handling.definitionId,
      ])
    );
});

/** A Pen of her own, and a cow in it. */
const aCowOfHerOwn = async (clock: FakeClock) => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const pen = await owner.client.herd.createPen({
    shedId: world.shedId,
    name: `মৃত্যু ${Date.now()}`,
  });
  const cow = await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: pen.id,
    source: "born",
    aliases: [],
  });
  return { pen, cow, owner };
};

describe("a death and a cull", () => {
  it("takes her out of the herd and keeps everything the farm knew about her", async () => {
    const clock = new FakeClock("2026-12-01T02:00:00.000Z");
    const { pen, cow } = await aCowOfHerOwn(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    // She was on the pen board this morning.
    await manager.client.instances.ensureDue();
    const before = await manager.client.animals.list({ penId: pen.id });
    expect(before.map((one) => one.id)).toContain(cow.id);

    await manager.client.animals.recordMortality({
      tagNumber: cow.tagNumber,
      kind: "died",
      cause: "পেট ফুলে গিয়েছিল, সকালে মরে পড়ে ছিল",
      disposal: "buried",
      disposalNote: "খামারের পিছনে, ছয় ফুট গভীরে",
    });

    // Off the herd, and out of the day's work in one act.
    const after = await manager.client.animals.list({ penId: pen.id });
    expect(after.map((one) => one.id)).not.toContain(cow.id);
    // Asked as the Manager: Barn Staff see the Pens they are assigned to, and nobody is
    // assigned to a Pen made a minute ago.
    const today = await manager.client.instances.today({ penId: pen.id });
    const round = today.find(
      (row) => row.definitionId === world.sop.definitionId
    );
    if (!round) {
      throw new Error("expected the morning round in her pen");
    }
    const board = await manager.client.instances.get({ id: round.id });
    expect(board.animals.map((one) => one.id)).not.toContain(cow.id);

    // And her page still says everything it said, with how she went on it.
    const her = await manager.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(her.state).toBe("died");
    expect(her.mortality).toMatchObject({
      kind: "died",
      cause: "পেট ফুলে গিয়েছিল, সকালে মরে পড়ে ছিল",
      disposal: "buried",
      recordedByName: "ম্যানেজার",
    });
  });
  it("is the Manager's to record, and nobody in the shed's", async () => {
    const clock = new FakeClock("2026-12-02T02:00:00.000Z");
    const { cow } = await aCowOfHerOwn(clock);
    const exit = {
      tagNumber: cow.tagNumber,
      kind: "culled" as const,
      cause: "বারবার ওলান প্রদাহ, আর সারছিল না",
      disposal: "burned" as const,
    };

    // The milker who found her does not decide she is gone from the herd, and neither does the
    // Vet who treated her: an exit is the farm's own act.
    for (const role of ["staff", "vet"] as const) {
      const them = await createTestClient(appRouter, { as: role, clock });
      // oxlint-disable-next-line no-await-in-loop
      await expect(them.client.animals.recordMortality(exit)).rejects.toThrow();
    }
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    const stillHere = await staff.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(stillHere.state).toBe("heifer");
    expect(stillHere.mortality).toBeNull();

    // The Manager culls her, and the reason she was culled is on the record.
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    await manager.client.animals.recordMortality(exit);
    const her = await manager.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(her.state).toBe("culled");
    expect(her.mortality).toMatchObject({
      kind: "culled",
      disposal: "burned",
      cause: "বারবার ওলান প্রদাহ, আর সারছিল না",
    });

    // She goes once: a second exit would lose which one the farm stands behind.
    await expect(
      manager.client.animals.recordMortality({ ...exit, kind: "died" })
    ).rejects.toThrow(/has left the farm/u);
  });

  it("writes it down the way the farm writes everything down", async () => {
    const clock = new FakeClock("2026-12-03T02:00:00.000Z");
    const { cow } = await aCowOfHerOwn(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    // Found dead this morning; written up at noon, and the record says which was which.
    const foundAt = new Date(clock.now().getTime() - 4 * 60 * 60 * 1000);
    await manager.client.animals.recordMortality({
      tagNumber: cow.tagNumber,
      kind: "died",
      cause: "সাপে কাটা",
      disposal: "buried",
      happenedAt: foundAt,
    });

    const her = await manager.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(her.mortality?.happenedAt).toEqual(foundAt);

    // An Audit Event like any other: keyed on the mortality itself, so putting it right later
    // is a Correction pointing at this, and what it says about her is in the snapshot rather
    // than only in a reason field.
    const trail = await manager.client.audit.list({ entity: "mortality" });
    const written = trail.find(
      (event) => (event.after as { cause?: string } | null)?.cause === "সাপে কাটা"
    );
    expect(written).toMatchObject({
      action: "create",
      roleUsed: "manager",
      after: { kind: "died", disposal: "buried" },
    });

    // And she cannot have gone tomorrow.
    const another = await aCowOfHerOwn(clock);
    await expect(
      manager.client.animals.recordMortality({
        tagNumber: another.cow.tagNumber,
        kind: "died",
        cause: "ভুল তারিখ",
        disposal: "buried",
        happenedAt: new Date(clock.now().getTime() + 60 * 60 * 1000),
      })
    ).rejects.toThrow(/future/u);
  });
  it("is corrected like anything else the farm wrote down", async () => {
    const clock = new FakeClock("2026-12-04T02:00:00.000Z");
    const { cow } = await aCowOfHerOwn(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    await manager.client.animals.recordMortality({
      tagNumber: cow.tagNumber,
      kind: "died",
      cause: "কারণ জানা যায়নি",
      disposal: "buried",
    });

    // The Vet's post-mortem comes back a week later and the farm knows more than it did.
    clock.advance(7 * 24 * 60 * 60 * 1000);
    const later = await createTestClient(appRouter, { as: "manager", clock });
    await later.client.animals.correctMortality({
      tagNumber: cow.tagNumber,
      changes: {
        cause: {
          from: "কারণ জানা যায়নি",
          to: "বিষক্রিয়া — গাছের পাতা খেয়েছিল",
        },
      },
      reason: "ময়নাতদন্তের ফল এসেছে",
    });

    const her = await later.client.animals.byTag({ tagNumber: cow.tagNumber });
    expect(her.mortality?.cause).toBe("বিষক্রিয়া — গাছের পাতা খেয়েছিল");

    // Nothing is lost: the trail holds what it said before, and why it changed.
    const trail = await later.client.audit.list({ entity: "mortality" });
    const change = trail.find((event) => event.reason === "ময়নাতদন্তের ফল এসেছে");
    expect(change).toMatchObject({
      action: "correct",
      before: { cause: "কারণ জানা যায়নি" },
      after: { cause: "বিষক্রিয়া — গাছের পাতা খেয়েছিল" },
    });

    // And how she left is not a correction's to change: an animal who died did not get culled
    // instead, because that is her exit State as much as this row.
    const corrected = await later.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(corrected.mortality?.kind).toBe("died");
    expect(corrected.state).toBe("died");
  });
  it("counts towards what the Owner is looking at", async () => {
    const clock = new FakeClock("2026-12-05T02:00:00.000Z");
    const { cow } = await aCowOfHerOwn(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const owner = await createTestClient(appRouter, { as: "owner", clock });

    const before = await owner.client.home.owner();
    await manager.client.animals.recordMortality({
      tagNumber: cow.tagNumber,
      kind: "died",
      cause: "হঠাৎ মরে গেছে",
      disposal: "buried",
    });

    // One more than before — counted rather than compared against a total, because every test
    // file shares this farm and its losses are not this test's business.
    const after = await owner.client.home.owner();
    expect(after.tiles.died).toBe(before.tiles.died + 1);
    expect(after.tiles.culled).toBe(before.tiles.culled);
  });
  it("closes the work that was about her, and lets the Playbook take over", async () => {
    const clock = new FakeClock("2026-12-06T02:00:00.000Z");
    const { pen, cow, owner } = await aCowOfHerOwn(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    // A check raised about her by her last Move: work about one animal, hers alone.
    const other = await owner.client.herd.createPen({
      shedId: world.shedId,
      name: `আরেক ${Date.now()}`,
    });
    await manager.client.animals.move({
      tagNumber: cow.tagNumber,
      toPenId: other.id,
      reason: "দেখে রাখার জন্য",
    });
    await manager.client.instances.ensureDue();
    const hers = await manager.client.instances.today({ penId: other.id });
    const check = hers.find(
      (row) =>
        row.animalId === cow.id && row.definitionId === world.check.definitionId
    );
    if (!check) {
      throw new Error("expected the post-move check about her");
    }

    await manager.client.animals.recordMortality({
      tagNumber: cow.tagNumber,
      kind: "died",
      cause: "রাতে মরে গেছে",
      disposal: "buried",
    });

    // Work nobody can do is called off rather than left going late about a cow who is buried — and its trail says why.
    const after = await manager.client.instances.get({ id: check.id });
    expect(after.state).toBe("called_off");
    const [calledOff] = await manager.client.audit.list({
      entity: "sop_instance",
      entityId: check.id,
    });
    expect(calledOff).toMatchObject({
      actorId: "test-manager",
      roleUsed: "manager",
      after: { state: "called_off", calledOffBy: "animal_left" },
    });

    // And the Playbook's own mortality handling is raised by her death: bury her to the depth
    // the rule names, and the Owner checks it.
    await manager.client.instances.ensureDue();
    const handling = await manager.client.instances.today({ penId: other.id });
    expect(
      handling.some(
        (row) =>
          row.definitionId === world.handling.definitionId &&
          row.animalId === cow.id
      )
    ).toBe(true);
    expect(pen.id).not.toBe(other.id);
  });
  it("cannot be done by setting her State instead", async () => {
    const clock = new FakeClock("2026-12-07T02:00:00.000Z");
    const { cow } = await aCowOfHerOwn(clock);
    const manager = await createTestClient(appRouter, { as: "manager", clock });

    // Marking her dead without saying how would leave the farm with a dead cow and no cause,
    // no disposal, and nothing for an inspector to read — and the same is true of every other
    // way out of the herd.
    for (const state of ["died", "culled", "sold"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        manager.client.animals.setState({ tagNumber: cow.tagNumber, state })
      ).rejects.toMatchObject({ data: { refusal: "exit_needs_a_record" } });
    }

    const her = await manager.client.animals.byTag({
      tagNumber: cow.tagNumber,
    });
    expect(her.state).toBe("heifer");
  });
});
