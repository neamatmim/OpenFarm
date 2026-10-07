import type { SopContent } from "@OpenFarm/domain";
import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// One procedure in force for each name, as every other list on the farm keeps its names; and the card says who still
// needs teaching the Version in force.

const suffix = `${Date.now()}`.slice(-7);

const named = (bn: string, en?: string): SopContent => ({
  name: en ? { bn, en } : { bn },
  purpose: { bn: "পরীক্ষা" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 60,
  steps: [
    {
      id: "count",
      text: { bn: "গুনুন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

const ownerAt = async (instant: string) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(instant),
  });
  return client;
};

describe("a procedure's name", () => {
  it("is refused when another procedure in force has it, in either language, and free once that one is retired", async () => {
    const owner = await ownerAt("2072-01-01T04:00:00.000Z");
    const first = await owner.sops.create({
      content: named(`মাথা গণনা ${suffix}`, `Head count ${suffix}`),
    });
    await expect(
      owner.sops.create({ content: named(`মাথা  গণনা ${suffix}`) })
    ).rejects.toMatchObject({ data: { refusal: "sop_name_taken" } });
    await expect(
      owner.sops.create({
        content: named(`অন্য নাম ${suffix}`, `head count ${suffix}`),
      })
    ).rejects.toMatchObject({ data: { refusal: "sop_name_taken" } });

    await owner.sops.retire({ definitionId: first.definitionId, note: "পুরনো" });
    await owner.sops.create({ content: named(`মাথা গণনা ${suffix}`) });
  });

  it("is refused when a procedure is renamed to another's, and kept by its own Version", async () => {
    const owner = await ownerAt("2072-01-02T04:00:00.000Z");
    await owner.sops.create({ content: named(`দোহন ${suffix}`) });
    const other = await owner.sops.create({
      content: named(`খাওয়ানো ${suffix}`),
    });
    await expect(
      owner.sops.publish({
        definitionId: other.definitionId,
        content: named(`দোহন ${suffix}`),
      })
    ).rejects.toMatchObject({ data: { refusal: "sop_name_taken" } });
    await owner.sops.publish({
      definitionId: other.definitionId,
      content: { ...named(`খাওয়ানো ${suffix}`), graceMinutes: 90 },
    });
  });
});

describe("a standard procedure adopted", () => {
  it("is known by what it is, renamed or not: not adopted twice, nor brought back beside another", async () => {
    const owner = await ownerAt("2072-03-01T04:00:00.000Z");
    const { headCount } = standardPlaybook();
    const first = await owner.sops.create({
      content: headCount,
      standardKey: "headCount",
    });
    // Renamed as the farm calls it.
    await owner.sops.publish({
      definitionId: first.definitionId,
      content: { ...headCount, name: { bn: `আমাদের গণনা ${suffix}` } },
    });
    await expect(
      owner.sops.create({ content: headCount, standardKey: "headCount" })
    ).rejects.toMatchObject({ data: { refusal: "sop_standard_adopted" } });

    await owner.sops.retire({ definitionId: first.definitionId, note: "নতুন" });
    await owner.sops.create({ content: headCount, standardKey: "headCount" });
    await expect(
      owner.sops.restore({ definitionId: first.definitionId, note: "ফেরত" })
    ).rejects.toMatchObject({ data: { refusal: "sop_standard_adopted" } });
  });
});

describe("who has been taught a procedure", () => {
  it("says of each person's latest teaching whether it is the Version in force", async () => {
    const owner = await ownerAt("2072-02-01T04:00:00.000Z");
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2072-02-01T04:00:00.000Z"),
    });
    const me = await manager.people.me();
    const sop = await owner.sops.create({ content: named(`শেখানো ${suffix}`) });
    await owner.sops.recordTraining({
      userId: me.id,
      versionId: sop.versionId,
    });
    const later = await ownerAt("2072-02-05T04:00:00.000Z");
    const second = await later.sops.publish({
      definitionId: sop.definitionId,
      content: { ...named(`শেখানো ${suffix}`), graceMinutes: 120 },
    });

    const behind = await later.sops.training({
      definitionId: sop.definitionId,
    });
    expect(behind.find((row) => row.userId === me.id)).toMatchObject({
      latest: true,
      versionNumber: 1,
      versionInForce: 2,
      onVersionInForce: false,
    });
    // As it stood before the change, the same teaching was the Version in force.
    const before = await later.sops.training({
      definitionId: sop.definitionId,
      asOf: new Date("2072-02-03T00:00:00.000Z"),
    });
    expect(before.find((row) => row.userId === me.id)?.onVersionInForce).toBe(
      true
    );

    await later.sops.recordTraining({
      userId: me.id,
      versionId: second.versionId,
    });
    const taught = await later.sops.training({
      definitionId: sop.definitionId,
    });
    const mine = taught.filter((row) => row.userId === me.id);
    expect(
      mine.map((row) => [row.versionNumber, row.latest, row.onVersionInForce])
    ).toEqual([
      [2, true, true],
      [1, false, false],
    ]);
  });
});
