import { and, eq } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

/**
 * A bull off a livestock market lorry may carry FMD or lumpy skin into a pen of thirty. The farm marks the Pens it keeps newcomers
 * in as quarantine pens, and a bought animal comes into Quarantine only through one of them.
 */
const suffix = `quarantine-pens-${Date.now()}`;
const AT = "2085-02-01T04:00:00.000Z";

const as = (role: "owner" | "manager" | "staff") =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(AT) });

const bought = (penId: string) => ({
  penId,
  sex: "male" as const,
  seller: { name: `ব্যাপারী ${suffix}` },
  purchasePriceMoney: 80_000,
  weightKg: 250,
  estimatedAgeMonths: 22,
  arrivedAt: new Date(AT),
  targetWindowStart: "2085-06-01",
  targetWindowEnd: "2085-06-05",
});

const registered = (penId: string) => ({
  sex: "male" as const,
  side: "fattening" as const,
  state: "quarantine" as const,
  penId,
  source: "bought" as const,
  aliases: [],
});

describe("quarantine pens", () => {
  // In order: the farm starts with no quarantine pen at all, and is then given one.
  let dairyPen = "";
  let quarantinePen = "";

  it("refuses an Intake on a farm with no quarantine pen, saying to mark one", async () => {
    const manager = await as("manager");
    const shed = await manager.client.sheds.create({ name: suffix });
    const dairy = await manager.client.sheds.pens.create({
      shedId: shed.id,
      name: `দুধের পেন ${suffix}`,
    });
    dairyPen = dairy.id;
    await expect(
      manager.client.intakes.record(bought(dairyPen))
    ).rejects.toMatchObject({ data: { refusal: "no_quarantine_pen" } });
    const owner = await as("owner");
    await expect(
      owner.client.animals.register(registered(dairyPen))
    ).rejects.toMatchObject({ data: { refusal: "no_quarantine_pen" } });
  });

  it("refuses one into a pen that is not a quarantine pen, once the farm has one", async () => {
    const manager = await as("manager");
    const shed = await manager.client.sheds.create({
      name: `কোয়ারেন্টিন ${suffix}`,
    });
    const marked = await manager.client.sheds.pens.create({
      shedId: shed.id,
      name: `কোয়ারেন্টিন পেন ${suffix}`,
      quarantine: true,
    });
    quarantinePen = marked.id;
    await expect(
      manager.client.intakes.record(bought(dairyPen))
    ).rejects.toMatchObject({ data: { refusal: "not_a_quarantine_pen" } });
    const owner = await as("owner");
    await expect(
      owner.client.animals.register(registered(dairyPen))
    ).rejects.toMatchObject({ data: { refusal: "not_a_quarantine_pen" } });
  });

  it("takes one into a quarantine pen, by Intake or by hand", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.intakes.record(bought(quarantinePen))
    ).resolves.toMatchObject({ tagNumber: expect.any(String) });
    const owner = await as("owner");
    await expect(
      owner.client.animals.register(registered(quarantinePen))
    ).resolves.toMatchObject({ tagNumber: expect.any(String) });
    const listed = await manager.client.sheds.list();
    const pens = listed.flatMap((one) => one.pens);
    expect(pens.find((one) => one.id === quarantinePen)?.quarantine).toBe(true);
  });

  it("will not be unmarked while it holds a bull in Quarantine; an empty one may", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.sheds.pens.markQuarantine({
        penId: quarantinePen,
        quarantine: false,
      })
    ).rejects.toMatchObject({ data: { refusal: "pen_holds_quarantine" } });
    await manager.client.sheds.pens.markQuarantine({
      penId: dairyPen,
      quarantine: true,
    });
    await expect(
      manager.client.sheds.pens.markQuarantine({
        penId: dairyPen,
        quarantine: false,
      })
    ).resolves.toBeDefined();
  });

  it("is the Owner's or the Manager's to mark, not Barn Staff's", async () => {
    const staff = await as("staff");
    await expect(
      staff.client.sheds.pens.markQuarantine({
        penId: dairyPen,
        quarantine: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

/** A round that walks each bull to the Pen the Step names. */
const walkingSop = (pens: { id: string; name: string }[]): SopContent => ({
  name: { bn: `পেন বদল ${suffix}` },
  purpose: { bn: "ষাঁড় সরানো" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
  appliesTo: { side: "fattening", states: ["quarantine", "fattening"] },
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "walk",
      text: { bn: "ষাঁড়কে পেনে নিন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "choice",
          required: true,
          choices: pens.map((pen) => ({
            value: pen.id,
            label: { bn: pen.name },
          })),
        },
      ],
      skipReasons: [{ bn: "আজ নয়" }],
      effect: { kind: "move" },
    },
  ],
});

describe("a bull in Quarantine", () => {
  const pens = { first: "", second: "", fattening: "" };
  let walking = "";

  const intoQuarantine = async () => {
    const manager = await as("manager");
    const bull = await manager.client.intakes.record(bought(pens.first));
    return bull.tagNumber;
  };

  const moved = async (tagNumber: string, toPenId: string) => {
    const manager = await as("manager");
    return await manager.client.animals.move({ tagNumber, toPenId });
  };

  it("is walked only into a quarantine pen", async () => {
    const manager = await as("manager");
    const owner = await as("owner");
    const shed = await manager.client.sheds.create({
      name: `দ্বিতীয় ${suffix}`,
    });
    const firstPen = await manager.client.sheds.pens.create({
      shedId: shed.id,
      name: `প্রথম কোয়ারেন্টিন ${suffix}`,
      quarantine: true,
    });
    pens.first = firstPen.id;
    const secondPen = await manager.client.sheds.pens.create({
      shedId: shed.id,
      name: `দ্বিতীয় কোয়ারেন্টিন ${suffix}`,
      quarantine: true,
    });
    pens.second = secondPen.id;
    const fatteningPen = await manager.client.sheds.pens.create({
      shedId: shed.id,
      name: `ষাঁড় পেন ${suffix}`,
    });
    pens.fattening = fatteningPen.id;
    const sop = await owner.client.sops.create({
      content: walkingSop([
        { id: pens.second, name: "দ্বিতীয়" },
        { id: pens.fattening, name: "ষাঁড়" },
      ]),
    });
    walking = sop.definitionId;
    const tag = await intoQuarantine();
    await expect(moved(tag, pens.fattening)).rejects.toMatchObject({
      data: { refusal: "stays_in_quarantine" },
    });
    await expect(moved(tag, pens.second)).resolves.toBeDefined();
  });

  it("is not walked out of quarantine by a Step either", async () => {
    const tag = await intoQuarantine();
    const manager = await as("manager");
    await manager.client.work.ensureDue();
    const today = await manager.client.work.today({ penId: pens.first });
    const round = today.find((row) => row.definitionId === walking);
    await manager.client.work.claim({ id: round?.id ?? "" });
    await expect(
      manager.client.work.completeStep({
        instanceId: round?.id ?? "",
        stepId: "walk",
        animalTag: tag,
        evidence: [pens.fattening],
      })
    ).rejects.toMatchObject({ data: { refusal: "stays_in_quarantine" } });
    // Walked to the other quarantine pen, then put right to say the fattening pen: refused all the same.
    await manager.client.work.completeStep({
      instanceId: round?.id ?? "",
      stepId: "walk",
      animalTag: tag,
      evidence: [pens.second],
    });
    const board = await manager.client.work.get({ id: round?.id ?? "" });
    const walked = board.completions.find(
      (row) => row.stepId === "walk" && row.animalId !== null
    );
    await expect(
      correctStepAsShown(manager.client, {
        completionId: walked?.id ?? "",
        evidence: [pens.fattening],
        reason: `ভুল পেন ${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "stays_in_quarantine" } });
  });

  it("standing outside a quarantine pen from before, is walked into one", async () => {
    const tag = await intoQuarantine();
    // As a bull put in Quarantine before pens were marked would stand.
    await scratchDb()
      .update(animal)
      .set({ penId: pens.fattening })
      .where(and(eq(animal.farmId, theFarm().id), eq(animal.tagNumber, tag)));
    await expect(moved(tag, pens.first)).resolves.toBeDefined();
  });

  it("once Fattening, is walked anywhere — and a Fattening bull into a quarantine pen", async () => {
    const tag = await intoQuarantine();
    const owner = await as("owner");
    await owner.client.animals.setState({
      tagNumber: tag,
      state: "fattening",
      reason: `ছাড়া হলো ${suffix}`,
    });
    await expect(moved(tag, pens.fattening)).resolves.toBeDefined();
    await expect(moved(tag, pens.second)).resolves.toBeDefined();
  });

  it("is never joined by the dairy herd: no cow is walked in, and no pen she stands in is marked one", async () => {
    const owner = await as("owner");
    const heifer = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pens.fattening,
      source: "born",
      aliases: [],
    });
    await expect(moved(heifer.tagNumber, pens.second)).rejects.toMatchObject({
      data: { refusal: "quarantine_pen_not_for_herd" },
    });
    const manager = await as("manager");
    await expect(
      manager.client.sheds.pens.markQuarantine({
        penId: pens.fattening,
        quarantine: true,
      })
    ).rejects.toMatchObject({
      data: { refusal: "pen_holds_herd", tagNumber: heifer.tagNumber },
    });
  });

  it("left outside one is named for the Manager to walk", async () => {
    const tag = await intoQuarantine();
    await scratchDb()
      .update(animal)
      .set({ penId: pens.fattening })
      .where(and(eq(animal.farmId, theFarm().id), eq(animal.tagNumber, tag)));
    const manager = await as("manager");
    const astray = await manager.client.sheds.quarantineAstray();
    expect(astray.map((one) => one.tagNumber)).toContain(tag);
    expect(
      astray.every((one) => one.tagNumber !== "" && one.penName !== "")
    ).toBe(true);
  });
});
