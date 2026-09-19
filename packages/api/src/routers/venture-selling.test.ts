import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Venture keeps up with its own animals: the first of them sold is what makes it Selling, and the day
 * its Wind-up Period ends is said while there is still time to do something about a slow bull.
 */
const suffix = `sell-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2047-01-20",
  targetWindowStart: "2047-04-17",
  targetWindowEnd: "2047-04-19",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

type Owner = Awaited<ReturnType<typeof as>>;

let ventureId = "";
let penId = "";
const tags: string[] = [];
const saleIds: string[] = [];
const intakeIds: string[] = [];

const theVenture = async (owner: Owner, which = ventureId) => {
  const ventures = await owner.client.ventures.list();
  return ventures.find((one) => one.id === which);
};

/** A Venture signed for and paid into, ready to be moved along. */
const funded = async (owner: Owner, which: number) => {
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${which} ${suffix}`,
    ...plan,
  });
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${which} ${suffix}`,
    phone: `0194${String(which).padStart(7, "0")}`,
  });
  const agreement = await owner.client.ventures.sign({
    ventureId: venture.id,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2047-01-02",
    stampSerial: `AA ${which} ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: 1_000_000,
    movedOn: "2047-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}-${which}`,
  });
  return venture.id;
};

beforeAll(async () => {
  const owner = await as("owner", "2047-01-01T04:00:00.000Z");
  ventureId = await funded(owner, 1);
  await owner.client.ventures.startBuying({ id: ventureId });

  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const manager = await as("manager", "2047-01-04T05:00:00.000Z");
  // One at a time, and not in parallel: two Intakes racing for the next tag number is a race this
  // test would rather not be about.
  const broughtIn = async () => {
    const her = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 60_000,
      weightKg: 200,
      estimatedAgeMonths: 20,
      ventureId,
      arrivedAt: new Date("2047-01-04T05:00:00.000Z"),
      targetWindowStart: plan.targetWindowStart,
      targetWindowEnd: plan.targetWindowEnd,
    });
    tags.push(her.tagNumber);
    intakeIds.push(her.intakeId);
  };
  await broughtIn();
  await broughtIn();
  await owner.client.ventures.startFattening({ id: ventureId });
});

describe("the two budgets once buying is over", () => {
  it("gives what buying did not spend to the animals' keep", async () => {
    // The Cattle Budget is a plan for the part of the capital meant to buy with. Once buying closes
    // there is nothing left to buy — so what it did not spend is feeding money, and saying otherwise
    // would warn her that a Venture is short of keep while most of its capital sits idle beside it.
    const owner = await as("owner", "2047-01-06T04:00:00.000Z");
    const venture = await theVenture(owner);
    expect(venture?.state).toBe("fattening");
    expect(venture?.cattleBudgetHeldBdt).toBe(0);
    // Stated as the rule rather than as a figure: once the cattle side is closed the whole of what the
    // account holds is there to keep them with.
    expect(venture?.runningBudgetHeldBdt).toBe(venture?.balanceBdt);
    // And the plan itself does not move — what it was set up as is a fact about it for ever.
    expect(venture).toMatchObject({
      cattleBudgetBdt: 800_000,
      runningBudgetBdt: 200_000,
    });
  });
});

describe("selling a Venture's animals", () => {
  it("says when the Wind-up Period ends", async () => {
    const owner = await as("owner", "2047-01-05T04:00:00.000Z");
    const venture = await theVenture(owner);
    // Thirty days after the Target Window closes, which is the Farm Parameter's default.
    expect(venture).toMatchObject({
      targetWindow: { start: "2047-04-17", end: "2047-04-19" },
      windUpEndsOn: "2047-05-19",
      animalsStanding: 2,
    });
  });

  it("reaches Selling on the first Sale, with nothing extra to remember", async () => {
    const manager = await as("manager", "2047-04-18T05:00:00.000Z");
    // The Manager's ordinary Sale: she is not asked whose animal this is.
    const sold = await manager.client.sale.record({
      tagNumber: tags[0] ?? "",
      buyer: { name: `ক্রেতা ${suffix}` },
      priceBdt: 120_000,
      weightKg: 340,
      destination: `ঢাকা ${suffix}`,
      vehicle: `ঢাকা মেট্রো ${suffix}`,
      driver: `চালক ${suffix}`,
      paymentMethod: "bank",
    });
    expect(sold.state).toBe("sold");
    saleIds.push(sold.id);

    const owner = await as("owner", "2047-04-18T06:00:00.000Z");
    const venture = await theVenture(owner);
    expect(venture).toMatchObject({ state: "selling", animalsStanding: 1 });

    // Audited like any other change of what a Venture is, and saying why it moved.
    const trail = await owner.client.audit.list({
      entity: "venture",
      entityId: ventureId,
    });
    const moved = trail.find(
      (one) => (one.after as { state?: string } | null)?.state === "selling"
    );
    expect(moved).toMatchObject({ action: "update" });
    expect((moved?.before as { state?: string } | null)?.state).toBe(
      "fattening"
    );
  });

  it("does not move again on the second Sale", async () => {
    const manager = await as("manager", "2047-04-19T05:00:00.000Z");
    const sold = await manager.client.sale.record({
      tagNumber: tags[1] ?? "",
      buyer: { name: `ক্রেতা দুই ${suffix}` },
      priceBdt: 130_000,
      weightKg: 350,
      destination: `ঢাকা ${suffix}`,
      vehicle: `ঢাকা মেট্রো ${suffix}`,
      driver: `চালক ${suffix}`,
      paymentMethod: "bank",
    });
    saleIds.push(sold.id);
    const owner = await as("owner", "2047-04-19T06:00:00.000Z");
    const venture = await theVenture(owner);
    expect(venture).toMatchObject({ state: "selling", animalsStanding: 0 });

    // One move, not one per Sale: it is already Selling, and there is nothing to record.
    const trail = await owner.client.audit.list({
      entity: "venture",
      entityId: ventureId,
    });
    const moves = trail.filter(
      (one) => (one.after as { state?: string } | null)?.state === "selling"
    );
    expect(moves).toHaveLength(1);
  });

  it("puts what she fetched into the Venture's own account", async () => {
    const owner = await as("owner", "2047-04-19T07:00:00.000Z");
    const venture = await theVenture(owner);
    // A buyer took both away for a lakh twenty and a lakh thirty. The money is the Venture's, as the
    // animals were, so its account holds the capital and what they fetched.
    expect(venture).toMatchObject({
      proceedsBdt: 250_000,
      balanceBdt: 1_250_000,
      // Not money to go and buy more cattle with, and by now not money the Cattle Budget is holding
      // either: buying closed long ago, so the whole of the account is there to keep them with. What
      // they fetched lands on that side with the rest.
      cattleBudgetHeldBdt: 0,
      runningBudgetHeldBdt: 1_250_000,
    });
    // And it reads as a movement of the Venture's money like any other.
    const movements = await owner.client.ventures.movements({ ventureId });
    const sales = movements.filter((one) => one.kind === "sale_in");
    expect(sales).toHaveLength(2);
    expect(sales.map((one) => one.amountBdt).toSorted((a, b) => a - b)).toEqual(
      [120_000, 130_000]
    );
  });

  it("moves with the Sale when the Sale's price is put right", async () => {
    const owner = await as("owner", "2047-04-21T04:00:00.000Z");
    const movements = await owner.client.ventures.movements({ ventureId });
    const first = movements.find(
      (one) => one.kind === "sale_in" && one.amountBdt === 120_000
    );
    // The movement is the Sale's, so it is not hers to change here.
    await expect(
      owner.client.ventures.correctMovement({
        id: first?.id ?? "",
        reason: `দাম ভুল ছিল ${suffix}`,
        changes: { amountBdt: { from: 120_000, to: 125_000 } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "correct_the_record" },
    });

    // Putting the Sale right is what moves it, and the Venture's account follows.
    await owner.client.sale.correct({
      id: saleIds[0] ?? "",
      reason: `স্লিপে এক লাখ পঁচিশ ${suffix}`,
      changes: { priceBdt: { from: 120_000, to: 125_000 } },
    });
    const venture = await theVenture(owner);
    expect(venture).toMatchObject({
      proceedsBdt: 255_000,
      balanceBdt: 1_255_000,
    });
  });

  it("follows her when a Correction says she was never this Venture's", async () => {
    const owner = await as("owner", "2047-04-22T04:00:00.000Z");
    // She was the Farm's all along, written to the Venture by mistake. What she fetched was never the
    // Venture's either, so its account must not keep holding it.
    await owner.client.intake.correct({
      id: intakeIds[1] ?? "",
      reason: `ও খামারের গরু ছিল ${suffix}`,
      changes: { owner: { from: ventureId, to: null } },
    });
    const venture = await theVenture(owner);
    expect(venture).toMatchObject({ proceedsBdt: 125_000 });
    const movements = await owner.client.ventures.movements({ ventureId });
    expect(movements.filter((one) => one.kind === "sale_in")).toHaveLength(1);
  });

  it("is past its wind-up day with animals still standing", async () => {
    // A second Venture, still holding a bull long after its Wind-up Period ran out: what the card
    // reads that off is the day and the count, and both are said.
    const owner = await as("owner", "2047-06-01T04:00:00.000Z");
    const slow = await funded(owner, 2);
    await owner.client.ventures.startBuying({ id: slow });
    const manager = await as("manager", "2047-06-01T05:00:00.000Z");
    const her = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 60_000,
      weightKg: 200,
      estimatedAgeMonths: 20,
      ventureId: slow,
      arrivedAt: new Date("2047-06-01T05:00:00.000Z"),
      targetWindowStart: plan.targetWindowStart,
      targetWindowEnd: plan.targetWindowEnd,
    });
    // Sold from buying, not from fattening: the other state a first Sale may move it out of.
    await manager.client.sale.record({
      tagNumber: her.tagNumber,
      buyer: { name: `ক্রেতা তিন ${suffix}` },
      priceBdt: 90_000,
      weightKg: 300,
      destination: `ঢাকা ${suffix}`,
      vehicle: `ঢাকা মেট্রো ${suffix}`,
      driver: `চালক ${suffix}`,
      paymentMethod: "bank",
    });
    const venture = await theVenture(owner, slow);
    expect(venture).toMatchObject({
      state: "selling",
      windUpEndsOn: "2047-05-19",
      animalsStanding: 0,
    });
  });

  it("keeps refusing what Selling refuses", async () => {
    const owner = await as("owner", "2047-04-20T04:00:00.000Z");
    const agreements = await owner.client.ventures.agreements({ ventureId });
    // No more capital against an Agreement already signed.
    await expect(
      owner.client.ventures.takeCapital({
        agreementId: agreements[0]?.id ?? "",
        amountBdt: 1000,
        movedOn: "2047-04-20",
        paymentMethod: "bank",
        reference: `LATE-${suffix}`,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // No animal lifted out of the pool either: a finished bull is not moved between purses once the
    // run is selling up, whichever side the Venture stands on.
    await expect(
      owner.client.ventures.sellInternally({
        tagNumber: tags[0] ?? "",
        rateBdtPerKg: 350,
        note: `আজকের দর ${suffix}`,
        soldOn: "2047-04-20",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceBdt: 70_000,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // And no new Investor signing onto a run that is already selling up.
    const latecomer = await owner.client.investors.record({
      name: `দেরিতে আসা ${suffix}`,
      phone: "01944444444",
    });
    await expect(
      owner.client.ventures.sign({
        ventureId,
        investorId: latecomer.id,
        units: 1,
        investorsPercent: 60,
        arbitrator: `মাওলানা ${suffix}`,
        stampValueBdt: 300,
        stampedOn: "2047-04-20",
        stampSerial: `ZZ ${suffix}`,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("the lorry that took them to the haat", () => {
  it("is charged to the animals it carried, by who owned them then", async () => {
    // The Farm pays the lorry and the men who went, as it pays the feed merchant — and the Venture
    // pays it back at the end of the month, because getting its animals to the haat is its cost and
    // not the Farm's. Nothing else moves that money: the Buying Float was closed months ago.
    const manager = await as("manager", "2047-05-02T05:00:00.000Z");
    await manager.client.sellingTrips.record({
      wentTo: `হাট ${suffix}`,
      transportBdt: 8000,
      keepBdt: 1000,
      animals: [...tags],
      wentOn: new Date("2047-05-02T05:00:00.000Z"),
      paymentMethod: "cash",
    });

    const owner = await as("owner", "2047-06-02T04:00:00.000Z");
    const month = await owner.client.ventures.consumption({
      ventureId,
      month: "2047-05",
    });
    // Nine thousand for the lorry, split evenly over the two it carried — and only one of them was
    // the Venture's by then, a Correction above having said the other was the Farm's all along. So the
    // Venture owes her half and not a taka more: whose an animal was is asked at the moment of the
    // cost, never now.
    expect(month.tripsBdt).toBe(4500);
    // Said as its own line, named for where it went, so she can read it aloud rather than find it
    // inside a total.
    expect(month.madeOf.trips).toEqual([
      expect.objectContaining({ bdt: 4500, nameBn: `হাট ${suffix}` }),
    ]);
    expect(month.totalBdt).toBe(
      month.feedBdt + month.medicineBdt + month.vetBdt + month.herdBdt + 4500
    );
  });
});
