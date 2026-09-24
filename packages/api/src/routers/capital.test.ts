import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Capital in, and what is left: the Investors' money arriving against the papers they signed, by bank
 * and never by hand, and the refunds that send every taka back when a Venture is called off.
 */
const suffix = `capital-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 700_000,
  decideBy: "2046-09-20",
  targetWindowStart: "2047-05-17",
  targetWindowEnd: "2047-05-19",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 750_000,
};

const paper = {
  investorsPercent: 60,
  arbitrator: `মাওলানা আব্দুল হক ${suffix}`,
  stampValueBdt: 300,
  stampedOn: "2046-09-02",
  stampSerial: `AA ${suffix}`,
};

const photo = { contentType: "image/jpeg" as const, data: "aGVsbG8=" };

type Owner = Awaited<ReturnType<typeof as>>;

/** One Investor of this file's farm, signed for a Venture, with the stamped paper on file. */
const signedUp = async (
  owner: Owner,
  which: number,
  ventureId: string,
  units: number,
  { withPaper = true } = {}
) => {
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${which} ${suffix}`,
    phone: `0171${String(which).padStart(7, "0")}`,
  });
  const agreement = await owner.client.ventures.sign({
    ventureId,
    investorId: person.id,
    units,
    ...paper,
  });
  if (withPaper) {
    await owner.client.ventures.keepAgreementPaper({
      agreementId: agreement.id,
      ...photo,
    });
  }
  return { person, agreementId: agreement.id };
};

let ventureId = "";

beforeAll(async () => {
  const owner = await as("owner", "2046-09-01T04:00:00.000Z");
  const one = await owner.client.ventures.open({
    name: `ঈদ ২০৪৭ ${suffix}`,
    ...plan,
  });
  ventureId = one.id;
});

describe("capital in", () => {
  it("is recorded against the paper the Investor signed, by bank", async () => {
    const owner = await as("owner", "2046-09-03T04:00:00.000Z");
    const karim = await signedUp(owner, 1, ventureId, 4);
    await owner.client.ventures.takeCapital({
      agreementId: karim.agreementId,
      amountBdt: 200_000,
      movedOn: "2046-09-03",
      paymentMethod: "bank",
      reference: `TRF-${suffix}-1`,
    });
    const movements = await owner.client.ventures.movements({ ventureId });
    expect(movements).toEqual([
      expect.objectContaining({
        kind: "capital_in",
        amountBdt: 200_000,
        movedOn: "2046-09-03",
        reference: `TRF-${suffix}-1`,
        investorId: karim.person.id,
      }),
    ]);
    const [venture] = await owner.client.ventures.list();
    expect(venture).toMatchObject({ capitalInBdt: 200_000 });
  });

  it("refuses money that came by hand", async () => {
    const owner = await as("owner", "2046-09-04T04:00:00.000Z");
    const cashy = await signedUp(owner, 2, ventureId, 1);
    const byHand = (["cash", "bkash"] as const).map((paymentMethod) =>
      expect(
        owner.client.ventures.takeCapital({
          agreementId: cashy.agreementId,
          amountBdt: 50_000,
          movedOn: "2046-09-04",
          paymentMethod,
          reference: "হাতে হাতে",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    );
    await Promise.all(byHand);
  });

  it("refuses money against a paper the farm has no photo of", async () => {
    const owner = await as("owner", "2046-09-05T04:00:00.000Z");
    const unstamped = await signedUp(owner, 3, ventureId, 1, {
      withPaper: false,
    });
    await expect(
      owner.client.ventures.takeCapital({
        agreementId: unstamped.agreementId,
        amountBdt: 50_000,
        movedOn: "2046-09-05",
        paymentMethod: "bank",
        reference: `TRF-${suffix}-3`,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("adds up across Investors, and says what each budget should hold", async () => {
    const owner = await as("owner", "2046-09-06T04:00:00.000Z");
    const shared = await owner.client.ventures.open({
      name: `দুজনের ${suffix}`,
      ...plan,
    });
    const first = await signedUp(owner, 10, shared.id, 4);
    const second = await signedUp(owner, 11, shared.id, 8);
    await owner.client.ventures.takeCapital({
      agreementId: first.agreementId,
      amountBdt: 200_000,
      movedOn: "2046-09-06",
      paymentMethod: "bank",
      reference: `TRF-${suffix}-10`,
    });
    await owner.client.ventures.takeCapital({
      agreementId: second.agreementId,
      amountBdt: 400_000,
      movedOn: "2046-09-06",
      paymentMethod: "bank",
      reference: `TRF-${suffix}-11`,
    });
    const ventures = await owner.client.ventures.list();
    // Three quarters of the plan buys animals, so three quarters of what has come in is the Cattle
    // Budget's and the rest keeps them.
    expect(ventures.find((one) => one.id === shared.id)).toMatchObject({
      capitalInBdt: 600_000,
      balanceBdt: 600_000,
      cattleBudgetHeldBdt: 450_000,
      runningBudgetHeldBdt: 150_000,
      spentBdt: 0,
      paidOutBdt: 0,
    });
  });

  it("refuses more than the Agreement's Units are worth", async () => {
    const owner = await as("owner", "2046-09-13T04:00:00.000Z");
    const small = await signedUp(owner, 12, ventureId, 1);
    // One Unit at ৳50,000, so ৳50,001 is money this paper does not account for.
    await expect(
      owner.client.ventures.takeCapital({
        agreementId: small.agreementId,
        amountBdt: 50_001,
        movedOn: "2046-09-13",
        paymentMethod: "bank",
        reference: `TRF-${suffix}-12`,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Paid in two halves it is the same money, and the second half is taken.
    await owner.client.ventures.takeCapital({
      agreementId: small.agreementId,
      amountBdt: 30_000,
      movedOn: "2046-09-13",
      paymentMethod: "bank",
      reference: `TRF-${suffix}-12a`,
    });
    await owner.client.ventures.takeCapital({
      agreementId: small.agreementId,
      amountBdt: 20_000,
      movedOn: "2046-09-13",
      paymentMethod: "bank",
      reference: `TRF-${suffix}-12b`,
    });
    // And a taka more than the Units are worth is refused, however it is split.
    await expect(
      owner.client.ventures.takeCapital({
        agreementId: small.agreementId,
        amountBdt: 1,
        movedOn: "2046-09-13",
        paymentMethod: "bank",
        reference: `TRF-${suffix}-12c`,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses capital once the Venture has left Open", async () => {
    const owner = await as("owner", "2046-09-07T04:00:00.000Z");
    const late = await owner.client.ventures.open({
      name: `শুরু হয়ে গেছে ${suffix}`,
      ...plan,
      floorBdt: 0,
    });
    const lateInvestor = await signedUp(owner, 5, late.id, 1);
    await owner.client.ventures.startBuying({ id: late.id });
    await expect(
      owner.client.ventures.takeCapital({
        agreementId: lateInvestor.agreementId,
        amountBdt: 50_000,
        movedOn: "2046-09-07",
        paymentMethod: "bank",
        reference: `TRF-${suffix}-5`,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("lets buying start once the Floor is met", async () => {
    const owner = await as("owner", "2046-09-08T04:00:00.000Z");
    const funded = await owner.client.ventures.open({
      name: `সীমা উঠেছে ${suffix}`,
      ...plan,
      floorBdt: 100_000,
    });
    const backer = await signedUp(owner, 9, funded.id, 3);
    // A taka short of the Floor, and the Venture stays a plan.
    await owner.client.ventures.takeCapital({
      agreementId: backer.agreementId,
      amountBdt: 99_999,
      movedOn: "2046-09-08",
      paymentMethod: "bank",
      reference: `TRF-${suffix}-9a`,
    });
    await expect(
      owner.client.ventures.startBuying({ id: funded.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await owner.client.ventures.takeCapital({
      agreementId: backer.agreementId,
      amountBdt: 1,
      movedOn: "2046-09-08",
      paymentMethod: "bank",
      reference: `TRF-${suffix}-9b`,
    });
    await expect(
      owner.client.ventures.startBuying({ id: funded.id })
    ).resolves.toMatchObject({ state: "buying" });
  });

  it("is the Venture's money, and never the Farm's income", async () => {
    const owner = await as("owner", "2046-09-08T04:00:00.000Z");
    const money = await owner.client.money.list({
      from: "2046-09-01",
      to: "2046-09-30",
    });
    expect(money.events).toEqual([]);
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager", "2046-09-09T04:00:00.000Z");
    await expect(
      manager.client.ventures.movements({ ventureId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.client.ventures.takeCapital({
        agreementId: "whichever",
        amountBdt: 1000,
        movedOn: "2046-09-09",
        paymentMethod: "bank",
        reference: "কোনো",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("a Venture called off", () => {
  it("sends every taka back, each with its own reference", async () => {
    const owner = await as("owner", "2046-09-10T04:00:00.000Z");
    const doomed = await owner.client.ventures.open({
      name: `বাতিল হবে ${suffix}`,
      ...plan,
    });
    const first = await signedUp(owner, 6, doomed.id, 2);
    const second = await signedUp(owner, 7, doomed.id, 3);
    await owner.client.ventures.takeCapital({
      agreementId: first.agreementId,
      amountBdt: 100_000,
      movedOn: "2046-09-10",
      paymentMethod: "bank",
      reference: `TRF-${suffix}-6`,
    });
    await owner.client.ventures.takeCapital({
      agreementId: second.agreementId,
      amountBdt: 150_000,
      movedOn: "2046-09-10",
      paymentMethod: "bank",
      reference: `TRF-${suffix}-7`,
    });
    const taken = await owner.client.ventures.movements({
      ventureId: doomed.id,
    });

    await owner.client.ventures.cancel({
      id: doomed.id,
      reason: "সময়মতো সর্বনিম্ন সীমা ওঠেনি",
      refunds: taken.map((one, which) => ({
        movementId: one.id,
        movedOn: "2046-09-11",
        reference: `RFD-${suffix}-${which}`,
      })),
    });

    const afterwards = await owner.client.ventures.movements({
      ventureId: doomed.id,
    });
    const refunds = afterwards.filter((one) => one.kind === "refund");
    expect(refunds).toHaveLength(2);
    expect(refunds.map((one) => one.amountBdt).toSorted()).toEqual([
      100_000, 150_000,
    ]);
    const ventures = await owner.client.ventures.list();
    const called = ventures.find((one) => one.id === doomed.id);
    // Every taka that came in has gone back, so the account should hold nothing.
    expect(called).toMatchObject({
      state: "cancelled",
      capitalInBdt: 250_000,
      refundedBdt: 250_000,
      balanceBdt: 0,
    });
    // And read from his side, on his own page: his capital in and back, and nothing of the other man's.
    const his = await owner.client.investors.agreements({
      id: first.person.id,
    });
    expect(his.agreements).toEqual([
      expect.objectContaining({ id: first.agreementId, capitalHeldBdt: 0 }),
    ]);
    expect(
      his.movements.map((one) => [one.kind, one.amountBdt, one.reference])
    ).toEqual([
      ["refund", 100_000, expect.stringMatching(/^RFD-/u)],
      ["capital_in", 100_000, `TRF-${suffix}-6`],
    ]);
  });

  it("refuses to be called off while a taka is unaccounted for", async () => {
    const owner = await as("owner", "2046-09-12T04:00:00.000Z");
    const held = await owner.client.ventures.open({
      name: `টাকা ফেরত হয়নি ${suffix}`,
      ...plan,
    });
    const investor = await signedUp(owner, 8, held.id, 1);
    await owner.client.ventures.takeCapital({
      agreementId: investor.agreementId,
      amountBdt: 50_000,
      movedOn: "2046-09-12",
      paymentMethod: "bank",
      reference: `TRF-${suffix}-8`,
    });
    await expect(
      owner.client.ventures.cancel({
        id: held.id,
        reason: "সর্বনিম্ন সীমা ওঠেনি",
        refunds: [],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
