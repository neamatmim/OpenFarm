import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Inspector View: the one screen the Manager shows a DLS inspector, with the Registration (R1) and the
// herd summary (R2) each printable as a paper, and each print an Export.

const suffix = `${Date.now()}`;
const REGISTRATION = "DLS/SAV/2026/০৪২";

const as = (
  role: "owner" | "manager" | "staff" | "vet",
  instant: string,
  onShedPhone = false
) =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(instant),
    onShedPhone,
  });

const setup = async () => {
  const manager = await as("manager", "2043-05-01T04:00:00.000Z");
  const identity = await manager.client.farm.identity();
  if (identity.registrationMissing) {
    await manager.client.farm.setIdentity({ registrationNumber: REGISTRATION });
  }
  const certificate = await manager.client.farm.setCertificate({
    contentType: "image/jpeg",
    data: "AAAA",
  });
  const owner = await as("owner", "2043-05-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: `insp-${suffix}` });
  const milkingPen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `পরিদর্শন দুধ ${suffix}`,
  });
  const bullPen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `পরিদর্শন ষাঁড় ${suffix}`,
  });
  const cow = async () => {
    const made = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: milkingPen.id,
      source: "born",
      aliases: [],
    });
    for (const state of ["pregnant_heifer", "milking"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      await owner.client.animals.setState({ tagNumber: made.tagNumber, state });
    }
  };
  await cow();
  await cow();
  await owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId: milkingPen.id,
    source: "born",
    aliases: [],
  });
  await manager.client.intake.record({
    penId: bullPen.id,
    sex: "male",
    seller: { name: `হাট ${suffix}` },
    purchasePriceBdt: 10_000,
    weightKg: 200,
    estimatedAgeMonths: 18,
    targetWindowStart: "2043-07-01",
    targetWindowEnd: "2043-07-05",
  });
  // A bull that has gone is no longer in the herd, though his Pen is still written on him.
  const gone = await manager.client.intake.record({
    penId: bullPen.id,
    sex: "male",
    seller: { name: `হাট ${suffix}` },
    purchasePriceBdt: 10_000,
    weightKg: 200,
    estimatedAgeMonths: 18,
    targetWindowStart: "2043-07-01",
    targetWindowEnd: "2043-07-05",
  });
  await manager.client.animals.recordMortality({
    tagNumber: gone.tagNumber,
    kind: "died",
    cause: "সাপের কামড়",
    disposal: "buried",
    happenedAt: new Date("2043-05-01T03:00:00.000Z"),
  });
  return { milkingPen, bullPen, certificate };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

describe("the Inspector View", () => {
  it("shows the Registration with its certificate, and prints it headed by the farm", async () => {
    const manager = await as("manager", "2043-05-02T04:00:00.000Z");
    const view = await manager.client.inspector.view();
    // No file photographs the certificate on a later clock, so this file's is the farm's newest.
    expect(view.registration).toMatchObject({
      number: REGISTRATION,
      certificate: { id: world.certificate.id, takenAt: expect.any(Date) },
    });

    const { text } = await manager.client.inspector.print({
      register: "registration",
    });
    expect(text).toContain("নিবন্ধন / Registration");
    expect(text).toContain(REGISTRATION);

    // On the trail: the Registration it showed, and the certificate photograph it named.
    const exports = await scratchDb().query.auditEvent.findMany({
      where: { entity: "report", action: "export" },
    });
    expect(
      exports
        .map((event) => event.after as Record<string, unknown> | null)
        .filter((after) => after?.certificateId === world.certificate.id)
    ).toEqual([
      expect.objectContaining({
        report: "registration",
        registrationNumber: REGISTRATION,
      }),
    ]);
  });

  it("counts the herd on the farm today by Side and State and by Pen, the animals that have gone left out", async () => {
    const owner = await as("owner", "2043-05-02T04:00:00.000Z");
    const view = await owner.client.inspector.view();
    const pen = (id: string) => view.herd.byPen.find((one) => one.penId === id);
    expect(pen(world.milkingPen.id)).toMatchObject({
      animals: 3,
      byState: { milking: 2, heifer: 1 },
    });
    expect(pen(world.bullPen.id)).toMatchObject({
      animals: 1,
      byState: { quarantine: 1 },
    });
    // The farm's Side-and-State lines include this file's milking cows and its bull.
    expect(view.herd.bySideAndState).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side: "dairy", state: "milking" }),
        expect.objectContaining({ side: "fattening", state: "quarantine" }),
      ])
    );

    const { text } = await owner.client.inspector.print({
      register: "herd_summary",
    });
    expect(text).toContain("পশুর সারসংক্ষেপ / Herd summary");
    expect(text).toContain(`পরিদর্শন দুধ ${suffix}`);

    const exports = await scratchDb().query.auditEvent.findMany({
      where: { entity: "report", action: "export" },
    });
    const ours = exports
      .map((event) => event.after as Record<string, unknown> | null)
      .filter(
        (after) =>
          // No other file prints a herd summary.
          after?.report === "herd_summary"
      );
    expect(ours).toEqual([
      expect.objectContaining({
        registrationNumber: REGISTRATION,
        animals: view.herd.total,
      }),
    ]);
  });

  it("is the Owner's and the Manager's, from their own phones", async () => {
    for (const role of ["staff", "vet"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const other = await as(role, "2043-05-03T04:00:00.000Z");
      // oxlint-disable-next-line no-await-in-loop
      await expect(other.client.inspector.view()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        other.client.inspector.print({ register: "registration" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    const onShedPhone = await as("manager", "2043-05-03T04:00:00.000Z", true);
    await expect(onShedPhone.client.inspector.view()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // A paper for an inspector carries the Registration number, or it is not printed.
    const writer = await as("manager", "2043-05-03T04:00:00.000Z");
    await writer.client.farm.setIdentity({ registrationNumber: null });
    try {
      const unregistered = await as("owner", "2043-05-03T04:00:00.000Z");
      for (const register of ["registration", "herd_summary"] as const) {
        // oxlint-disable-next-line no-await-in-loop
        await expect(
          unregistered.client.inspector.print({ register })
        ).rejects.toMatchObject({
          data: { refusal: "farm_identity_incomplete" },
        });
      }

      // But a register nobody makes a spreadsheet of is refused as that, before the farm's own paperwork is
      // looked at: what an inspector asked for cannot be given at all, and that is the more useful answer.
      await expect(
        unregistered.client.inspector.print({
          register: "disease_history",
          format: "csv",
        })
      ).rejects.toMatchObject({ data: { refusal: "register_has_no_csv" } });
    } finally {
      await writer.client.farm.setIdentity({
        registrationNumber: REGISTRATION,
      });
    }
  });
});
