import { inArray } from "@OpenFarm/db/operators";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
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
  return { sop, before };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
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

describe("the Registration and its renewal", () => {
  it("keeps a photograph of the certificate, replaced by a newer one", async () => {
    const manager = await as("manager", "2040-12-02T04:00:00.000Z");
    await manager.client.farm.setCertificate({
      contentType: "image/jpeg",
      data: "AAAA",
    });
    const later = await as("manager", "2040-12-03T04:00:00.000Z");
    await later.client.farm.setCertificate({
      contentType: "image/png",
      data: "BBBB",
    });
    expect(await later.client.farm.certificate()).toEqual({
      contentType: "image/png",
      data: "BBBB",
    });
    const identity = await later.client.farm.identity();
    expect(identity.certificateUpdatedAt).toEqual(
      new Date("2040-12-03T04:00:00.000Z")
    );
    const trail = await later.client.audit.list({ entity: "farm_certificate" });
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
  });

  it("raises the renewal for the Owner once the expiry is within the lead, and only once", async () => {
    expect(await renewalWork("2040-12-30T04:00:00.000Z")).toEqual([]);
    const owner = await as("owner", "2040-12-30T04:00:00.000Z");
    const early = await owner.client.home.owner();
    expect(early.needsYou.registrationRenewal).toBeNull();

    const raised = await renewalWork("2041-01-02T04:00:00.000Z");
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
        certificate: { contentType: "image/jpeg", data: "DDDD" },
      },
    });
    await owner.client.instances.complete({ id: work?.id ?? "" });

    // A fresh client, because a Context carries the Farm as it stood when the request began.
    const after = await as("owner", "2041-02-10T05:00:00.000Z");
    const identity = await after.client.farm.identity();
    expect(identity.registrationExpiresOn).toEqual(
      new Date("2042-03-30T18:00:00.000Z")
    );
    expect(await after.client.farm.certificate()).toEqual({
      contentType: "image/jpeg",
      data: "DDDD",
    });
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
  });
});
