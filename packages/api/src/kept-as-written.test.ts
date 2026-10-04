import { eq, sql } from "@OpenFarm/db/operators";
import { auditEvent } from "@OpenFarm/db/schema/audit";
import { rationVersion } from "@OpenFarm/db/schema/feed";
import {
  paperTemplate,
  paperTemplateVersion,
} from "@OpenFarm/db/schema/paper-template";
import { sopVersion } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";

// What the farm keeps as it was written — its trail, and every Version of a procedure, a ration and an Investor's paper
// — is refused a change or a removal by the database itself, whoever asks: the app never asks, and a stray script, a
// console session or a store written tomorrow is turned away the same.

const suffix = `kept-${Date.now()}`;
const NOW = "2093-03-01T04:00:00.000Z";

/** 23001 is the database refusing on a rule of its own. */
const RESTRICTED = "23001";

const refusedCode = async (act: PromiseLike<unknown>) => {
  try {
    await act;
  } catch (error) {
    const code =
      (error as { cause?: { code?: string } }).cause?.code ??
      (error as { code?: string }).code;
    return code ?? "refused";
  }
  return "written";
};

const watchSop = (): SopContent => ({
  name: { bn: `পর্যবেক্ষণ ${suffix}` },
  purpose: { bn: "দেখা" },
  triggers: [],
  appliesTo: { side: "dairy" },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "look",
      text: { bn: "দেখুন" },
      repeatPerAnimal: false,
      evidence: [
        {
          type: "choice",
          required: true,
          choices: [{ value: "seen", label: { bn: "দেখা হয়েছে" } }],
        },
      ],
      skipReasons: [{ bn: "পাওয়া যায়নি" }],
    },
  ],
});

let sopVersionId = "";
let rationVersionId = "";
let paperVersionId = "";
let auditEventId = "";

beforeAll(async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(NOW),
  });
  const sop = await client.sops.create({ content: watchSop() });
  const item = await client.feed.items.create({
    name: { bn: `দানাদার ${suffix}` },
  });
  const ration = await client.feed.rations.save({
    name: { bn: `রেশন ${suffix}` },
    items: [{ feedItemId: item.id, kgPerAnimalPerDay: 5 }],
  });
  await client.templates.list();
  const db = scratchDb();
  const farmId = theFarm().id;
  const [rationRow] = await db
    .select({ id: rationVersion.id })
    .from(rationVersion)
    .where(eq(rationVersion.rationId, ration.rationId));
  const [paper] = await db
    .select({ id: paperTemplate.currentVersionId })
    .from(paperTemplate)
    .where(eq(paperTemplate.farmId, farmId));
  const [trail] = await db
    .select({ id: auditEvent.id })
    .from(auditEvent)
    .where(eq(auditEvent.farmId, farmId))
    .limit(1);
  ({ versionId: sopVersionId } = sop);
  rationVersionId = rationRow?.id ?? "";
  paperVersionId = paper?.id ?? "";
  auditEventId = trail?.id ?? "";
});

describe("what the farm keeps as it was written", () => {
  it("found one of each to try", () => {
    expect([
      sopVersionId,
      rationVersionId,
      paperVersionId,
      auditEventId,
    ]).not.toContain("");
  });

  it("refuses a change to the trail, or its removal", async () => {
    const db = scratchDb();
    expect(
      await refusedCode(
        db
          .update(auditEvent)
          .set({ reason: "rewritten" })
          .where(eq(auditEvent.id, auditEventId))
      )
    ).toBe(RESTRICTED);
    expect(
      await refusedCode(
        db.delete(auditEvent).where(eq(auditEvent.id, auditEventId))
      )
    ).toBe(RESTRICTED);
  });

  it("refuses a change to a procedure's Version, or its removal", async () => {
    const db = scratchDb();
    expect(
      await refusedCode(
        db
          .update(sopVersion)
          .set({ number: 99 })
          .where(eq(sopVersion.id, sopVersionId))
      )
    ).toBe(RESTRICTED);
    expect(
      await refusedCode(
        db.delete(sopVersion).where(eq(sopVersion.id, sopVersionId))
      )
    ).toBe(RESTRICTED);
  });

  it("refuses a change to a ration's Version, or its removal", async () => {
    const db = scratchDb();
    expect(
      await refusedCode(
        db
          .update(rationVersion)
          .set({ number: 99 })
          .where(eq(rationVersion.id, rationVersionId))
      )
    ).toBe(RESTRICTED);
    expect(
      await refusedCode(
        db.delete(rationVersion).where(eq(rationVersion.id, rationVersionId))
      )
    ).toBe(RESTRICTED);
  });

  it("refuses emptying any of them at a stroke", async () => {
    for (const table of [
      "audit_event",
      "sop_version",
      "ration_version",
      "paper_template_version",
    ]) {
      expect(
        // oxlint-disable-next-line no-await-in-loop -- one table at a time, each refused on its own
        await refusedCode(
          scratchDb().execute(sql.raw(`truncate table "${table}" cascade`))
        )
      ).toBe(RESTRICTED);
    }
  });

  it("refuses a change to a paper's wording, and takes its review once", async () => {
    const db = scratchDb();
    expect(
      await refusedCode(
        db
          .update(paperTemplateVersion)
          .set({ number: 99 })
          .where(eq(paperTemplateVersion.id, paperVersionId))
      )
    ).toBe(RESTRICTED);
    expect(
      await refusedCode(
        db
          .update(paperTemplateVersion)
          .set({ reviewedBy: "অ্যাডভোকেট", reviewedOn: "2093-02-20" })
          .where(eq(paperTemplateVersion.id, paperVersionId))
      )
    ).toBe("written");
    expect(
      await refusedCode(
        db
          .update(paperTemplateVersion)
          .set({ reviewedOn: "2093-02-21" })
          .where(eq(paperTemplateVersion.id, paperVersionId))
      )
    ).toBe(RESTRICTED);
    expect(
      await refusedCode(
        db
          .delete(paperTemplateVersion)
          .where(eq(paperTemplateVersion.id, paperVersionId))
      )
    ).toBe(RESTRICTED);
  });
});
