import type { Evidence, SopContent, Step } from "@OpenFarm/domain";
import { scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** The milking SOP as the Owner would author it: two sessions a day, a per-cow block with
 *  litres, and a bulk total at the end. */
const milkingSop = (): SopContent => ({
  name: { bn: "দোহন", en: "Milking" },
  purpose: {
    bn: "প্রতিটি গাভীর দুধ পরিষ্কারভাবে সংগ্রহ ও নথিভুক্ত করা",
    en: "Milk each cow",
  },
  triggers: [{ kind: "schedule", times: ["05:00", "16:00"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 90,
  steps: [
    {
      id: "prep",
      text: { bn: "পার্লার প্রস্তুত করুন", en: "Prepare the parlour" },
      repeatPerAnimal: false,
      evidence: [
        { type: "tick", required: true },
        { type: "photo", required: false },
      ],
      skipReasons: [],
    },
    {
      id: "milk",
      text: { bn: "গাভীর দুধ দোহন করুন", en: "Milk the cow" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "লিটার", en: "litres" },
          min: 0,
          max: 40,
        },
      ],
      skipReasons: [
        { bn: "অসুস্থ", en: "Sick" },
        { bn: "শুকনো", en: "Dry" },
      ],
    },
    {
      id: "bulk",
      text: { bn: "বাল্ক ট্যাংকে মোট", en: "Bulk tank total" },
      repeatPerAnimal: false,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "লিটার", en: "litres" },
          min: 0,
          max: 5000,
        },
      ],
      skipReasons: [],
    },
  ],
});

/** Replaces one step, so the tests never reach into the array with a non-null assertion. */
const withStep = (
  content: SopContent,
  index: number,
  patch: Partial<Step>
): SopContent => ({
  ...content,
  steps: content.steps.map((step, i) =>
    i === index ? { ...step, ...patch } : step
  ),
});

const litres = (min: number, max: number): Evidence => ({
  type: "number",
  required: true,
  unit: { bn: "লিটার" },
  min,
  max,
});

describe("authoring an SOP", () => {
  it("creates the Playbook entry and publishes Version 1", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });

    const created = await owner.client.sops.create({
      content: milkingSop(),
      note: "first",
    });
    const definition = await owner.client.sops.get({
      id: created.definitionId,
    });

    expect(created.number).toBe(1);
    expect(definition.currentVersion?.number).toBe(1);
    const content = definition.currentVersion?.content as SopContent;
    expect(content.name.bn).toBe("দোহন");
    expect(content.steps[1]?.repeatPerAnimal).toBe(true);
  });

  it("publishing again creates the next Version and never rewrites the old one", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const created = await owner.client.sops.create({ content: milkingSop() });
    const first = await owner.client.sops.version({
      definitionId: created.definitionId,
      number: 1,
    });

    const changed = withStep({ ...milkingSop(), graceMinutes: 30 }, 1, {
      text: { bn: "গাভীর দুধ দোহন করুন (নতুন)", en: "Milk the cow (new)" },
    });
    const second = await owner.client.sops.publish({
      definitionId: created.definitionId,
      content: changed,
      note: "shorter grace",
    });

    expect(second.number).toBe(2);
    const stillFirst = await owner.client.sops.version({
      definitionId: created.definitionId,
      number: 1,
    });
    expect(stillFirst.id).toBe(first.id);
    expect((stillFirst.content as SopContent).graceMinutes).toBe(90);
    expect((stillFirst.content as SopContent).steps[1]?.text.bn).toBe(
      "গাভীর দুধ দোহন করুন"
    );
    const definition = await owner.client.sops.get({
      id: created.definitionId,
    });
    expect(definition.currentVersion?.number).toBe(2);
    expect(definition.versions.map((v) => v.number).toSorted()).toEqual([1, 2]);
  });

  it("refuses to publish with the missing Bangla named, and accepts missing English", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const gaps = withStep(
      withStep(milkingSop(), 0, {
        text: { bn: "", en: "Prepare the parlour" },
      }),
      1,
      {
        evidence: [
          {
            type: "number",
            required: true,
            unit: { bn: "", en: "litres" },
            min: 0,
            max: 40,
          },
        ],
        skipReasons: [{ bn: "অসুস্থ" }, { bn: "", en: "Dry" }],
      }
    );

    await expect(
      owner.client.sops.create({ content: gaps })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("steps[0].text.bn"),
    });

    const banglaOnly = withStep({ ...milkingSop(), name: { bn: "দোহন" } }, 0, {
      text: { bn: "পার্লার প্রস্তুত করুন" },
    });
    const fine = await owner.client.sops.create({ content: banglaOnly });
    expect(fine.number).toBe(1);
  });

  it("refuses an SOP that makes no sense: no steps, a bad time, a backwards range", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const empty = { ...milkingSop(), steps: [] };
    const badTime: SopContent = {
      ...milkingSop(),
      triggers: [{ kind: "schedule", times: ["25:00"] }],
    };
    const backwards = withStep(milkingSop(), 1, { evidence: [litres(40, 0)] });

    await expect(
      owner.client.sops.create({ content: empty })
    ).rejects.toMatchObject({
      message: expect.stringContaining("at least one step"),
    });
    await expect(
      owner.client.sops.create({ content: badTime })
    ).rejects.toMatchObject({
      message: expect.stringContaining("not a time of day"),
    });
    await expect(
      owner.client.sops.create({ content: backwards })
    ).rejects.toMatchObject({
      message: expect.stringContaining("range runs backwards"),
    });
  });

  it("only the Owner publishes, and never from a shed phone", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const ownerOnPhone = await createTestClient(appRouter, {
      as: "owner",
      onShedPhone: true,
    });

    await expect(
      manager.client.sops.create({ content: milkingSop() })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      ownerOnPhone.client.sops.create({ content: milkingSop() })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("a Manager's proposal", () => {
  it("changes nothing until the Owner approves it, then publishes a Version", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const manager = await createTestClient(appRouter, { as: "manager" });
    const created = await owner.client.sops.create({ content: milkingSop() });

    const changed = withStep(milkingSop(), 1, { evidence: [litres(0, 60)] });
    const proposal = await manager.client.sops.propose({
      definitionId: created.definitionId,
      content: changed,
      note: "high yielders go over 40",
    });

    const beforeApproval = await owner.client.sops.get({
      id: created.definitionId,
    });
    expect(beforeApproval.currentVersion?.number).toBe(1);
    const pending = await owner.client.sops.proposals();
    expect(pending.some((p) => p.id === proposal.id)).toBe(true);

    const approved = await owner.client.sops.approveProposal({
      id: proposal.id,
      note: "agreed",
    });

    expect(approved.number).toBe(2);
    const afterApproval = await owner.client.sops.get({
      id: created.definitionId,
    });
    const content = afterApproval.currentVersion?.content as SopContent;
    expect(content.steps[1]?.evidence[0]?.max).toBe(60);
    const stillPending = await owner.client.sops.proposals();
    expect(stillPending.some((p) => p.id === proposal.id)).toBe(false);
  });

  it("a rejected proposal publishes nothing, and neither decision can be made twice", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const manager = await createTestClient(appRouter, { as: "manager" });
    const created = await owner.client.sops.create({ content: milkingSop() });
    const proposal = await manager.client.sops.propose({
      definitionId: created.definitionId,
      content: milkingSop(),
    });

    await owner.client.sops.rejectProposal({
      id: proposal.id,
      note: "not now",
    });

    const definition = await owner.client.sops.get({
      id: created.definitionId,
    });
    expect(definition.currentVersion?.number).toBe(1);
    await expect(
      owner.client.sops.approveProposal({ id: proposal.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a Manager cannot approve their own proposal", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const manager = await createTestClient(appRouter, { as: "manager" });
    const created = await owner.client.sops.create({ content: milkingSop() });
    const proposal = await manager.client.sops.propose({
      definitionId: created.definitionId,
      content: milkingSop(),
    });

    await expect(
      manager.client.sops.approveProposal({ id: proposal.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("the audit trail", () => {
  it("records the SOP and each Version under the Definition's id", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    const created = await owner.client.sops.create({ content: milkingSop() });
    await owner.client.sops.publish({
      definitionId: created.definitionId,
      content: milkingSop(),
    });

    const events = await scratchDb().query.auditEvent.findMany({
      where: { entity: "sop", entityId: created.definitionId },
      orderBy: { receivedAt: "asc", id: "asc" },
    });

    expect(events.map((e) => e.action)).toEqual(["create", "update"]);
    expect((events.at(-1)?.after as { version?: number } | null)?.version).toBe(
      2
    );
  });
});
