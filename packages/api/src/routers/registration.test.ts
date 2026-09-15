import { eq, inArray } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, TEST_FARM, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

// The farm's DLS Registration: its certificate photographed, and the renewal SOP raised for the Owner a
// renewal lead before it runs out, whose closing Step records the new expiry and the renewed certificate.

const REGISTRATION = "DLS/SAV/2026/০৪২";

const as = (role: "owner" | "manager" | "staff" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const renewalSop = (): SopContent => ({
  name: { bn: `নিবন্ধন নবায়ন ${Date.now()}`, en: "Registration renewal" },
  purpose: { bn: "ডিএলএস নিবন্ধন সময়মতো নবায়ন" },
  triggers: [{ kind: "registration_renewal" }],
  assignedRole: "owner",
  checkerRole: null,
  graceMinutes: 24 * 60,
  steps: [
    {
      id: "apply",
      text: { bn: "উপজেলা প্রাণিসম্পদ দপ্তরে আবেদন জমা দিন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
    {
      id: "renewed",
      text: { bn: "নতুন সনদের মেয়াদ ও ছবি দিন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "registration_renewal" },
    },
  ],
});

const setup = async () => {
  const manager = await as("manager", "2040-12-01T04:00:00.000Z");
  const before = await manager.client.farm.identity();
  // Good until the end of 31 March 2041: with the farm's 90-day lead, renewal is due from 1 January.
  await manager.client.farm.setIdentity({
    registrationNumber: REGISTRATION,
    registrationExpiresOn: "2041-03-31",
  });
  const owner = await as("owner", "2040-12-01T04:00:00.000Z");
  const sop = await owner.client.sops.create({ content: renewalSop() });
  // Barn Staff with a Pen of their own, so what they are shown of late work is scoped rather than empty.
  const shed = await owner.client.herd.createShed({
    name: `reg-${Date.now()}`,
  });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: "নিবন্ধন পেন",
  });
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-registration-${pen.id}`,
      farmId: TEST_FARM.id,
      userId: "test-staff",
      penId: pen.id,
    })
    .onConflictDoNothing();
  return { sop, before, pen };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  await scratchDb()
    .delete(penAssignment)
    .where(eq(penAssignment.id, `pa-registration-${world.pen.id}`));
  await scratchDb()
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(inArray(sopDefinition.id, [world.sop.definitionId]));
  // The Farm is the whole run's: put its registration back as another file may read it.
  const manager = await as("manager", "2042-06-01T04:00:00.000Z");
  await manager.client.farm.setIdentity({
    registrationNumber: world.before.registrationNumber ?? REGISTRATION,
    registrationExpiresOn: null,
  });
});

/** The renewal work this file's SOP has raised, once the farm has been opened at this instant. */
const renewalWork = async (instant: string) => {
  const owner = await as("owner", instant);
  await owner.client.instances.ensureDue();
  return scratchDb().query.sopInstance.findMany({
    where: { definitionId: world.sop.definitionId },
    columns: {
      id: true,
      penId: true,
      assignedRole: true,
      dueAt: true,
      state: true,
    },
    orderBy: { dueAt: "asc", id: "asc" },
  });
};

/** The renewal's closing Step as its work's board shows it. */
const renewedStepOn = async (
  client: Awaited<ReturnType<typeof as>>["client"],
  workId: string | undefined
): Promise<string> => {
  const board = await client.instances.get({ id: workId ?? "" });
  return board.completions.find((one) => one.stepId === "renewed")?.id ?? "";
};

describe("the Registration and its renewal", () => {
  it("keeps a photograph of the certificate, replaced by a newer one", async () => {
    // Other files photograph the certificate on the shared farm too, so this file reads its own by id.
    const manager = await as("manager", "2040-12-02T04:00:00.000Z");
    const first = await manager.client.farm.setCertificate({
      contentType: "image/jpeg",
      data: "AAAA",
    });
    const later = await as("manager", "2040-12-03T04:00:00.000Z");
    const second = await later.client.farm.setCertificate({
      contentType: "image/png",
      data: "BBBB",
    });
    expect(await later.client.farm.certificate({ id: second.id })).toEqual({
      contentType: "image/png",
      data: "BBBB",
    });
    // The photograph it replaced is still the farm's, and still readable, and both are listed.
    expect(await later.client.farm.certificate({ id: first.id })).toEqual({
      contentType: "image/jpeg",
      data: "AAAA",
    });
    const kept = await later.client.farm.certificates();
    expect(kept.map((one) => one.id)).toEqual(
      expect.arrayContaining([first.id, second.id])
    );
    const trail = await later.client.audit.list({
      entity: "registration_certificate",
    });
    expect(
      trail.filter((event) => event.receivedAt.getUTCFullYear() === 2040)
    ).toHaveLength(2);

    const staff = await as("staff", "2040-12-03T04:00:00.000Z");
    await expect(
      staff.client.farm.setCertificate({ contentType: "image/png", data: "C" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is a procedure only the Owner may be given", async () => {
    const owner = await as("owner", "2040-12-04T04:00:00.000Z");
    await expect(
      owner.client.sops.create({
        content: { ...renewalSop(), assignedRole: "manager" },
      })
    ).rejects.toMatchObject({
      data: {
        blockers: expect.arrayContaining([
          "assignedRole: a procedure that renews the Registration is the Owner's",
        ]),
      },
    });
    // Work about the whole farm is about no animal and in no Pen.
    const content = renewalSop();
    await expect(
      owner.client.sops.create({
        content: {
          ...content,
          steps: [
            ...content.steps,
            {
              id: "weigh",
              text: { bn: "ওজন নিন" },
              repeatPerAnimal: true,
              evidence: [
                { type: "number", required: true, unit: { bn: "কেজি" } },
              ],
              skipReasons: [],
              effect: { kind: "weigh_in" },
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      data: {
        blockers: expect.arrayContaining([
          "steps[2]: work about the whole farm is about no animal, so the step is walked once",
        ]),
      },
    });
  });

  it("raises the renewal for the Owner once the expiry is within the lead, and only once", async () => {
    // The lead opens at midnight on 1 January, the farm's clock: a minute before, nothing.
    expect(await renewalWork("2040-12-31T17:59:00.000Z")).toEqual([]);
    const owner = await as("owner", "2040-12-31T17:59:00.000Z");
    const early = await owner.client.home.owner();
    expect(early.needsYou.registrationRenewal).toBeNull();

    const raised = await renewalWork("2040-12-31T18:00:00.000Z");
    // In no Pen, the Owner's, and due when the Registration runs out: late only once it has.
    expect(raised).toEqual([
      expect.objectContaining({
        penId: null,
        assignedRole: "owner",
        dueAt: new Date("2041-03-30T18:00:00.000Z"),
      }),
    ]);
    const board = await as("owner", "2041-01-02T04:00:00.000Z");
    const renewal = await board.client.instances.get({
      id: raised[0]?.id ?? "",
    });
    expect(renewal.renewal).toEqual({
      expiresOn: new Date("2041-03-30T18:00:00.000Z"),
    });
    expect(await renewalWork("2041-01-03T04:00:00.000Z")).toHaveLength(1);
    // The Manager putting a typed expiry right within the year raises nothing more.
    const manager = await as("manager", "2041-01-03T04:00:00.000Z");
    await manager.client.farm.setIdentity({
      registrationExpiresOn: "2041-03-30",
    });
    expect(await renewalWork("2041-01-03T05:00:00.000Z")).toHaveLength(1);
    await manager.client.farm.setIdentity({
      registrationExpiresOn: "2041-03-31",
    });

    // The Owner hears of it in the digest, once.
    const told = await owner.client.alerts.mine({ entityId: raised[0]?.id });
    expect(told).toEqual([
      expect.objectContaining({ kind: "registration_renewal_due" }),
    ]);

    // Late only once the Registration has run out — and the Owner's to be late with, not Barn Staff's.
    const staff = await as("staff", "2041-04-02T04:00:00.000Z");
    const staffLate = await staff.client.instances.overdue();
    expect(staffLate.map((row) => row.id)).not.toContain(raised[0]?.id);
    const lateOwner = await as("owner", "2041-04-02T04:00:00.000Z");
    const ownerLate = await lateOwner.client.instances.overdue();
    expect(ownerLate.map((row) => row.id)).toContain(raised[0]?.id);

    const due = await as("owner", "2041-01-03T04:00:00.000Z");
    const home = await due.client.home.owner();
    expect(home.needsYou.registrationRenewal).toMatchObject({
      expiresOn: new Date("2041-03-30T18:00:00.000Z"),
      expired: false,
      instanceId: raised[0]?.id,
    });
  });

  it("renews the Registration from the renewal's closing Step, and raises nothing more until the next lead", async () => {
    const [work] = await renewalWork("2041-02-10T04:00:00.000Z");
    const owner = await as("owner", "2041-02-10T04:00:00.000Z");
    await owner.client.instances.claim({ id: work?.id ?? "" });
    await owner.client.instances.completeStep({
      instanceId: work?.id ?? "",
      stepId: "apply",
      evidence: [true],
    });

    // A renewal with no photograph of the renewed certificate keeps nothing to show an inspector.
    await expect(
      owner.client.instances.completeStep({
        instanceId: work?.id ?? "",
        stepId: "renewed",
        evidence: [true],
        renewal: { expiresOn: "2042-03-31" },
      })
    ).rejects.toMatchObject({ data: { refusal: "renewal_needs_certificate" } });

    // A renewal to a date that is not after the one it replaces is not a renewal.
    await expect(
      owner.client.instances.completeStep({
        instanceId: work?.id ?? "",
        stepId: "renewed",
        evidence: [true],
        renewal: {
          expiresOn: "2041-03-01",
          certificate: { contentType: "image/jpeg", data: "CCCC" },
        },
      })
    ).rejects.toMatchObject({ data: { refusal: "renewal_not_later" } });

    await owner.client.instances.completeStep({
      instanceId: work?.id ?? "",
      stepId: "renewed",
      evidence: [true],
      renewal: {
        expiresOn: "2042-03-31",
        issuedOn: "2041-02-10",
        certificate: { contentType: "image/jpeg", data: "DDDD" },
      },
    });
    // Still on the Owner's list until the renewal is done.
    const midway = await as("owner", "2041-02-10T04:30:00.000Z");
    const beforeDone = await midway.client.home.owner();
    expect(beforeDone.needsYou.registrationRenewal).toMatchObject({
      instanceId: work?.id,
    });
    await owner.client.instances.complete({ id: work?.id ?? "" });

    // A fresh client, because a Context carries the Farm as it stood when the request began.
    const after = await as("owner", "2041-02-10T05:00:00.000Z");
    const identity = await after.client.farm.identity();
    expect(identity.registrationExpiresOn).toEqual(
      new Date("2042-03-30T18:00:00.000Z")
    );
    expect(identity.registrationIssuedOn).toEqual(
      new Date("2041-02-09T18:00:00.000Z")
    );
    // The renewed certificate is kept among the farm's photographs, taken when the Step was.
    const certificates = await after.client.farm.certificates();
    const renewedPhoto = certificates.find(
      (one) => one.takenAt.getTime() === Date.parse("2041-02-10T04:00:00.000Z")
    );
    expect(
      await after.client.farm.certificate({ id: renewedPhoto?.id })
    ).toEqual({ contentType: "image/jpeg", data: "DDDD" });
    // On the trail: the Step that renewed it, with the expiry it replaced and the new one.
    const trail = await after.client.audit.list({ entity: "step_completion" });
    expect(trail).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          after: expect.objectContaining({
            effect: {
              kind: "registration_renewal",
              previousExpiresOn: "2041-03-30T18:00:00.000Z",
              expiresOn: "2042-03-30T18:00:00.000Z",
              standsAside: null,
            },
          }),
        }),
      ])
    );

    const home = await after.client.home.owner();
    expect(home.needsYou.registrationRenewal).toBeNull();
    // Nothing more until the next lead: a year on, 1 January 2042.
    const midYear = await renewalWork("2041-06-01T04:00:00.000Z");
    expect(midYear.filter((row) => row.state === "due")).toEqual([]);
    const next = await renewalWork("2042-01-02T04:00:00.000Z");
    expect(next.filter((row) => row.state === "due")).toHaveLength(1);

    // A Correction that sends only a new photograph of the certificate changes no day, and is still a Correction: the
    // photograph is what an inspector asks to see.
    const rephotographed = await as("owner", "2041-06-01T05:00:00.000Z");
    await correctStepAsShown(rephotographed.client, {
      completionId: await renewedStepOn(rephotographed.client, work?.id),
      evidence: [true],
      renewal: {
        expiresOn: "2042-03-31",
        certificate: { contentType: "image/jpeg", data: "EEEE" },
      },
      reason: "সনদের ছবি ঝাপসা ছিল",
    });
    const [retaken] = await rephotographed.client.farm.certificates();
    expect(
      await rephotographed.client.farm.certificate({ id: retaken?.id })
    ).toEqual({ contentType: "image/jpeg", data: "EEEE" });

    // Once the Registration has moved on — by hand, here — the old renewal is not put right under it: the Correction is
    // kept, the Registration stays where it moved to, and a person is asked.
    const manager = await as("manager", "2042-01-03T04:00:00.000Z");
    await manager.client.farm.setIdentity({
      registrationExpiresOn: "2043-03-31",
    });
    const board = await as("owner", "2042-01-03T05:00:00.000Z");
    const corrected = await correctStepAsShown(board.client, {
      completionId: await renewedStepOn(board.client, work?.id),
      evidence: [true],
      renewal: { expiresOn: "2042-04-30" },
      reason: "তারিখ ভুল লেখা হয়েছিল",
    });
    expect(corrected).toMatchObject({
      needsReview: true,
      effect: { standsAside: { because: "renewal_superseded" } },
    });
    // The Manager is told why, not only that something could not be undone.
    const told = await as("manager", "2042-01-03T05:30:00.000Z");
    const alerts = await told.client.alerts.mine({});
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "needs_review",
          params: expect.objectContaining({
            reason: "irreversible_effect",
            because: "renewal_superseded",
          }),
        }),
      ])
    );
    // A fresh client: a Context carries the Farm as it stood when it was made.
    const reading = await as("owner", "2042-01-03T06:00:00.000Z");
    const stillMoved = await reading.client.farm.identity();
    expect(stillMoved.registrationExpiresOn?.toISOString()).toBe(
      "2043-03-30T18:00:00.000Z"
    );
  });
});
