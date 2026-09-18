import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A movement of a Venture's money put right. Never deleted and never replaced by a second movement: an
 * Investor's money moving and then appearing never to have moved is the one thing these records must not
 * be able to say.
 */
const suffix = `fix-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 500_000,
  decideBy: "2047-11-20",
  targetWindowStart: "2048-02-17",
  targetWindowEnd: "2048-02-19",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

type Owner = Awaited<ReturnType<typeof as>>;

let ventureId = "";
let agreementId = "";
let capitalId = "";

const theVenture = async (owner: Owner, which = ventureId) => {
  const ventures = await owner.client.ventures.list();
  return ventures.find((one) => one.id === which);
};

const signedUp = async (owner: Owner, which: number, forVenture: string) => {
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${which} ${suffix}`,
    phone: `0198${String(which).padStart(7, "0")}`,
  });
  const agreement = await owner.client.ventures.sign({
    ventureId: forVenture,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2047-11-02",
    stampSerial: `AA ${which} ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  return agreement.id;
};

beforeAll(async () => {
  const owner = await as("owner", "2047-11-01T04:00:00.000Z");
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    ...plan,
  });
  ventureId = venture.id;
  agreementId = await signedUp(owner, 1, ventureId);
  // Four lakh typed where five was sent: under the Floor, so the Venture cannot start buying.
  const taken = await owner.client.ventures.takeCapital({
    agreementId,
    amountBdt: 400_000,
    movedOn: "2047-11-05",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  capitalId = taken.id;
});

describe("putting a movement right", () => {
  it("flows through everything read from the movements", async () => {
    const owner = await as("owner", "2047-11-06T04:00:00.000Z");
    const before = await theVenture(owner);
    expect(before).toMatchObject({
      capitalInBdt: 400_000,
      balanceBdt: 400_000,
      cattleBudgetHeldBdt: 320_000,
    });
    // Under the Floor, so it may not start buying.
    await expect(
      owner.client.ventures.startBuying({ id: ventureId })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await owner.client.ventures.correctMovement({
      id: capitalId,
      reason: `স্লিপে পাঁচ লাখ, লেখা হয়েছিল চার ${suffix}`,
      changes: { amountBdt: { from: 400_000, to: 500_000 } },
    });

    const after = await theVenture(owner);
    // Capital, the balance and both budgets follow, and so does the Floor.
    expect(after).toMatchObject({
      capitalInBdt: 500_000,
      balanceBdt: 500_000,
      cattleBudgetHeldBdt: 400_000,
      runningBudgetHeldBdt: 100_000,
    });
    await expect(
      owner.client.ventures.startBuying({ id: ventureId })
    ).resolves.toMatchObject({ state: "buying" });
  });

  it("keeps what it said before, and does not write a second movement", async () => {
    const owner = await as("owner", "2047-11-07T04:00:00.000Z");
    const movements = await owner.client.ventures.movements({ ventureId });
    // One movement, put right — not one wrong and one right.
    expect(movements.filter((one) => one.kind === "capital_in")).toHaveLength(
      1
    );

    const trail = await owner.client.audit.list({
      entity: "venture_movement",
      entityId: capitalId,
    });
    const correction = trail.find((one) => one.action === "correct");
    expect(correction).toMatchObject({
      reason: `স্লিপে পাঁচ লাখ, লেখা হয়েছিল চার ${suffix}`,
    });
    expect(
      (correction?.before as { amountBdt?: number } | null)?.amountBdt
    ).toBe(400_000);
    expect(
      (correction?.after as { amountBdt?: number } | null)?.amountBdt
    ).toBe(500_000);
  });

  it("puts an Advance right too", async () => {
    const owner = await as("owner", "2047-11-08T04:00:00.000Z");
    const advance = await owner.client.ventures.advance({
      ventureId,
      amountBdt: 30_000,
      movedOn: "2047-11-08",
      paymentMethod: "bank",
      reference: `ADV-${suffix}`,
    });
    await owner.client.ventures.correctMovement({
      id: advance.id,
      reason: `রেফারেন্স ভুল ছিল ${suffix}`,
      changes: {
        amountBdt: { from: 30_000, to: 25_000 },
        reference: { from: `ADV-${suffix}`, to: `ADV-RIGHT-${suffix}` },
      },
    });
    const venture = await theVenture(owner);
    expect(venture?.advancedBdt).toBe(25_000);
  });

  it("refuses a movement the farm has already counted on", async () => {
    const owner = await as("owner", "2047-11-09T04:00:00.000Z");
    const trip = await owner.client.trips.record({
      wentTo: `হাট ${suffix}`,
      wentOn: "2047-11-09",
      brokerBdt: 0,
      transportBdt: 0,
      keepBdt: 0,
    });
    const float = await owner.client.ventures.drawFloat({
      ventureId,
      buyingTripId: trip.id,
      amountBdt: 100_000,
      movedOn: "2047-11-09",
      paymentMethod: "bank",
      reference: `FLT-${suffix}`,
    });
    // Before it comes home it is still only a figure, and may be put right.
    await owner.client.ventures.correctMovement({
      id: float.id,
      reason: `স্লিপ অনুযায়ী ${suffix}`,
      changes: { amountBdt: { from: 100_000, to: 90_000 } },
    });

    // Counted home, it is part of a sum somebody signed.
    await owner.client.ventures.reconcileFloat({
      buyingTripId: trip.id,
      cashBackBdt: 90_000,
      movedOn: "2047-11-10",
      reference: `DEP-${suffix}`,
    });
    await expect(
      owner.client.ventures.correctMovement({
        id: float.id,
        reason: `আবার বদলাতে চাই ${suffix}`,
        changes: { amountBdt: { from: 90_000, to: 80_000 } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "float_already_reconciled" },
    });
  });

  it("refuses a payment corrected past the Units the Agreement is for", async () => {
    const owner = await as("owner", "2047-11-12T04:00:00.000Z");
    // Twenty Units at fifty thousand: ten lakh, and five have been paid. A Correction is the same door
    // the payment came through, and it is not a way round the Agreement.
    await expect(
      owner.client.ventures.correctMovement({
        id: capitalId,
        reason: `আরও বেশি লিখতে চাই ${suffix}`,
        changes: { amountBdt: { from: 500_000, to: 1_200_000 } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "capital_over_units" },
    });
  });

  it("refuses a Venture whose money has already gone back", async () => {
    const owner = await as("owner", "2047-11-14T04:00:00.000Z");
    const calledOff = await owner.client.ventures.open({
      name: `বাতিল ${suffix}`,
      ...plan,
    });
    const agreement = await signedUp(owner, 2, calledOff.id);
    const taken = await owner.client.ventures.takeCapital({
      agreementId: agreement,
      amountBdt: 200_000,
      movedOn: "2047-11-14",
      paymentMethod: "bank",
      reference: `TRF2-${suffix}`,
    });
    await owner.client.ventures.cancel({
      id: calledOff.id,
      reason: `সীমা ওঠেনি ${suffix}`,
      refunds: [
        {
          movementId: taken.id,
          movedOn: "2047-11-14",
          reference: `RFD-${suffix}`,
        },
      ],
    });
    // Cancelling sent every taka back, one refund against each payment. Change what came in now and the
    // refund beside it stops matching, and the Venture reads as still holding somebody's money.
    await expect(
      owner.client.ventures.correctMovement({
        id: taken.id,
        reason: `দুই লাখ নয়, তিন ${suffix}`,
        changes: { amountBdt: { from: 200_000, to: 300_000 } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "venture_is_cancelled" },
    });
  });

  it("is the Owner's alone", async () => {
    const owner = await as("owner", "2047-11-15T04:00:00.000Z");
    const movements = await owner.client.ventures.movements({ ventureId });
    const held = movements.find((one) => one.id === capitalId)?.amountBdt ?? 0;
    const manager = await as("manager", "2047-11-15T05:00:00.000Z");
    await expect(
      manager.client.ventures.correctMovement({
        id: capitalId,
        reason: `আমি ঠিক করছি ${suffix}`,
        changes: { amountBdt: { from: held, to: 400_000 } },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
