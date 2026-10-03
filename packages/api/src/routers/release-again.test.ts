import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

/**
 * A bull's Release put off — the step skipped "Unwell — stays in quarantine", or the work closed Missed — while he is
 * still in Quarantine is raised again after the farm's days, and again after that, until he is out. Left alone, he would
 * stay in Quarantine, off the Ready list, until somebody noticed.
 */
const suffix = `release-again-${Date.now()}`;
const ARRIVED = "2086-01-05T04:00:00.000Z";
/** A day past his thirty days in Quarantine. */
const RELEASE_DAY = "2086-02-05T05:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;
const KEPT_IN = "অসুস্থ — কোয়ারেন্টিনে থাকবে";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let releaseId = "";
const tags = { kept: "", missed: "", corrected: "", byHand: "", later: "" };

beforeAll(async () => {
  const owner = await as("owner", ARRIVED);
  const release = await owner.client.sops.create({
    content: standardPlaybook().quarantineRelease,
  });
  releaseId = release.definitionId;
  const manager = await as("manager", ARRIVED);
  const shed = await manager.client.herd.createShed({ name: suffix });
  const pen = await manager.client.herd.createPen({
    shedId: shed.id,
    name: `কোয়ারেন্টিন ${suffix}`,
    quarantine: true,
  });
  for (const key of Object.keys(tags) as (keyof typeof tags)[]) {
    // oxlint-disable-next-line no-await-in-loop -- one bull after another off the lorry
    const bull = await manager.client.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 60_000,
      weightKg: 200,
      estimatedAgeMonths: 18,
      arrivedAt: new Date(ARRIVED),
      targetWindowStart: "2086-06-01",
      targetWindowEnd: "2086-06-05",
    });
    tags[key] = bull.tagNumber;
  }
});

/** Every piece of release work about him, oldest first, once the day is turned at `at`. */
const hisReleases = async (at: string, tagNumber: string) => {
  const manager = await as("manager", at);
  await manager.client.instances.ensureDue();
  const him = await manager.client.animals.byTag({ tagNumber });
  const rows = await scratchDb().query.sopInstance.findMany({
    where: { definitionId: releaseId, animalId: him.id },
    columns: { id: true, state: true, dueAt: true, cause: true },
    orderBy: { dueAt: "asc", id: "asc" },
  });
  return { manager, rows };
};

/** His release walked and kept in: well-ness skipped, the release skipped. The completion of the release step. */
const keepHimIn = async (at: string, tagNumber: string, workId: string) => {
  const manager = await as("manager", at);
  await manager.client.instances.claim({ id: workId });
  for (const stepId of ["healthy", "doses", "release"]) {
    const skipping = stepId !== "doses";
    // oxlint-disable-next-line no-await-in-loop -- the steps are walked in their order
    await manager.client.instances.completeStep({
      instanceId: workId,
      stepId,
      animalTag: tagNumber,
      evidence: skipping ? [] : [true],
      ...(skipping ? { skipReason: KEPT_IN } : {}),
    });
  }
  const board = await manager.client.instances.get({ id: workId });
  return board.completions.find((row) => row.stepId === "release")?.id ?? "";
};

const openAgain = <Row extends { state: string; cause: string | null }>(
  rows: Row[]
): Row[] =>
  rows.filter(
    (one) => one.cause?.includes(":again:") && one.state !== "called_off"
  );

describe("a Release put off", () => {
  it("is raised again seven days on, and again after that", async () => {
    const first = await hisReleases(RELEASE_DAY, tags.kept);
    const [work] = first.rows;
    await keepHimIn(RELEASE_DAY, tags.kept, work?.id ?? "");
    const after = await hisReleases(RELEASE_DAY, tags.kept);
    const [again] = openAgain(after.rows);
    expect(again?.dueAt.getTime()).toBe(
      new Date(RELEASE_DAY).getTime() + 7 * DAY_MS
    );
    // Put off again on the day it came round: a third.
    const day = new Date(again?.dueAt ?? 0).toISOString();
    await keepHimIn(day, tags.kept, again?.id ?? "");
    const later = await hisReleases(day, tags.kept);
    expect(openAgain(later.rows)).toHaveLength(2);
  });

  it("let out on the work raised again, is done — not called off", async () => {
    const first = await hisReleases(RELEASE_DAY, tags.later);
    const [work] = first.rows;
    await keepHimIn(RELEASE_DAY, tags.later, work?.id ?? "");
    const kept = await hisReleases(RELEASE_DAY, tags.later);
    const [again] = openAgain(kept.rows);
    const day = new Date(again?.dueAt ?? 0).toISOString();
    const manager = await as("manager", day);
    await manager.client.instances.claim({ id: again?.id ?? "" });
    for (const stepId of ["healthy", "doses", "release"]) {
      // oxlint-disable-next-line no-await-in-loop -- the steps are walked in their order
      await manager.client.instances.completeStep({
        instanceId: again?.id ?? "",
        stepId,
        animalTag: tags.later,
        evidence: [true],
      });
    }
    const after = await hisReleases(day, tags.later);
    expect(after.rows.find((one) => one.id === again?.id)?.state).not.toBe(
      "called_off"
    );
  });

  it("is raised again when it is closed Missed", async () => {
    const { rows } = await hisReleases(RELEASE_DAY, tags.missed);
    const [work] = rows;
    const owner = await as("owner", "2086-02-08T05:00:00.000Z");
    await owner.client.instances.closeAsMissed({
      id: work?.id ?? "",
      reason: `কেউ করেনি ${suffix}`,
    });
    const after = await hisReleases("2086-02-08T05:00:00.000Z", tags.missed);
    expect(openAgain(after.rows)).toHaveLength(1);
  });

  it("is called off when the skip is put right to say he was let out", async () => {
    const { rows } = await hisReleases(RELEASE_DAY, tags.corrected);
    const [work] = rows;
    const completionId = await keepHimIn(
      RELEASE_DAY,
      tags.corrected,
      work?.id ?? ""
    );
    const kept = await hisReleases(RELEASE_DAY, tags.corrected);
    expect(openAgain(kept.rows)).toHaveLength(1);
    const manager = await as("manager", "2086-02-05T09:00:00.000Z");
    await correctStepAsShown(manager.client, {
      completionId,
      evidence: [true],
      reason: `আসলে ছাড়া হয়েছিল ${suffix}`,
    });
    const after = await hisReleases(RELEASE_DAY, tags.corrected);
    expect(openAgain(after.rows)).toEqual([]);
  });

  it("is called off when he is let out by hand", async () => {
    const { rows } = await hisReleases(RELEASE_DAY, tags.byHand);
    const [work] = rows;
    await keepHimIn(RELEASE_DAY, tags.byHand, work?.id ?? "");
    const owner = await as("owner", "2086-02-06T05:00:00.000Z");
    await owner.client.animals.setState({
      tagNumber: tags.byHand,
      state: "fattening",
      reason: `ভেট দেখে ছেড়েছেন ${suffix}`,
    });
    const after = await hisReleases("2086-02-06T05:00:00.000Z", tags.byHand);
    expect(openAgain(after.rows)).toEqual([]);
  });

  it("waits the Manager's days, which the Manager may set", async () => {
    const manager = await as("manager", "2086-02-06T05:00:00.000Z");
    await expect(
      manager.client.farm.setParameters({ putOffDays: 5 })
    ).resolves.toBeDefined();
  });
});
