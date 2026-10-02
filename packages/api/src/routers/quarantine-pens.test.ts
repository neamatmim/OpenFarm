import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A bull off a haat lorry may carry FMD or lumpy skin into a pen of thirty. The farm marks the Pens it keeps newcomers
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
  purchasePriceBdt: 80_000,
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
    const shed = await manager.client.herd.createShed({ name: suffix });
    const dairy = await manager.client.herd.createPen({
      shedId: shed.id,
      name: `দুধের পেন ${suffix}`,
    });
    dairyPen = dairy.id;
    await expect(
      manager.client.intake.record(bought(dairyPen))
    ).rejects.toMatchObject({ data: { refusal: "no_quarantine_pen" } });
    const owner = await as("owner");
    await expect(
      owner.client.animals.register(registered(dairyPen))
    ).rejects.toMatchObject({ data: { refusal: "no_quarantine_pen" } });
  });

  it("refuses one into a pen that is not a quarantine pen, once the farm has one", async () => {
    const manager = await as("manager");
    const shed = await manager.client.herd.createShed({
      name: `কোয়ারেন্টিন ${suffix}`,
    });
    const marked = await manager.client.herd.createPen({
      shedId: shed.id,
      name: `কোয়ারেন্টিন পেন ${suffix}`,
      quarantine: true,
    });
    quarantinePen = marked.id;
    await expect(
      manager.client.intake.record(bought(dairyPen))
    ).rejects.toMatchObject({ data: { refusal: "not_a_quarantine_pen" } });
    const owner = await as("owner");
    await expect(
      owner.client.animals.register(registered(dairyPen))
    ).rejects.toMatchObject({ data: { refusal: "not_a_quarantine_pen" } });
  });

  it("takes one into a quarantine pen, by Intake or by hand", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.intake.record(bought(quarantinePen))
    ).resolves.toMatchObject({ tagNumber: expect.any(String) });
    const owner = await as("owner");
    await expect(
      owner.client.animals.register(registered(quarantinePen))
    ).resolves.toMatchObject({ tagNumber: expect.any(String) });
    const listed = await manager.client.herd.list();
    const pens = listed.flatMap((one) => one.pens);
    expect(pens.find((one) => one.id === quarantinePen)?.quarantine).toBe(true);
  });

  it("will not be unmarked while it holds a bull in Quarantine; an empty one may", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.herd.markQuarantine({
        penId: quarantinePen,
        quarantine: false,
      })
    ).rejects.toMatchObject({ data: { refusal: "pen_holds_quarantine" } });
    await manager.client.herd.markQuarantine({
      penId: dairyPen,
      quarantine: true,
    });
    await expect(
      manager.client.herd.markQuarantine({ penId: dairyPen, quarantine: false })
    ).resolves.toBeDefined();
  });

  it("is the Owner's or the Manager's to mark, not Barn Staff's", async () => {
    const staff = await as("staff");
    await expect(
      staff.client.herd.markQuarantine({ penId: dairyPen, quarantine: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
