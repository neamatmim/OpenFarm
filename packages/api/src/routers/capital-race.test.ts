import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Two payments against one Agreement, arriving together.
 *
 * `takeCapital` counts what an Agreement has already taken and refuses anything that would carry it
 * past what its Units are worth — "a Unit paid for twice would take twice its share of the profit
 * while holding one share of the Venture", as the handler says. The question is whether that count is
 * worth anything when two payments are in flight at once, which is what `sign` locks the Farm for:
 * "a rule that may not be overridden may not be lost to two phones at once either."
 *
 * Several Agreements rather than one, because the answer is a race and one throw of it proves nothing.
 */
const suffix = `capital-race-${Date.now()}`;

/** How many Agreements are paid twice at once. Each is an independent throw. */
const ROUNDS = 6;

const as = (instant: string) =>
  createTestClient(appRouter, { as: "owner", clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 5_000_000,
  floorBdt: 700_000,
  decideBy: "2046-09-20",
  targetWindowStart: "2047-05-17",
  targetWindowEnd: "2047-05-19",
  unitPriceBdt: 50_000,
  units: 100,
  cattleBudgetBdt: 3_750_000,
};

/** An Agreement worth two Units — one lakh — with its stamped paper on file. */
const signedFor = async (
  owner: Awaited<ReturnType<typeof as>>,
  ventureId: string,
  which: number
) => {
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${which} ${suffix}`,
    phone: `0172${String(which).padStart(7, "0")}`,
  });
  const agreement = await owner.client.ventures.sign({
    ventureId,
    investorId: person.id,
    units: 2,
    investorsPercent: 60,
    arbitrator: `মাওলানা আব্দুল হক ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2046-09-02",
    stampSerial: `AA ${which} ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  return agreement.id;
};

describe("two payments against one Agreement at once", () => {
  it("never takes more than the Units are worth", async () => {
    const owner = await as("2046-09-03T04:00:00.000Z");
    const venture = await owner.client.ventures.open({
      name: `ঈদ ২০৪৭ ${suffix}`,
      ...plan,
    });

    const overpaid: { agreementId: string; takenBdt: number }[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      const agreementId = await signedFor(owner, venture.id, round);
      // Sixty thousand each against a hundred-thousand Agreement: either alone is fine, both are not.
      // Started together on purpose — each counts what the Agreement has taken before the other has
      // written, which is the whole question.
      const pay = (reference: string) =>
        owner.client.ventures.takeCapital({
          agreementId,
          amountBdt: 60_000,
          movedOn: "2046-09-03",
          paymentMethod: "bank",
          reference,
        });
      await Promise.allSettled([
        pay(`TRF-${suffix}-${round}-A`),
        pay(`TRF-${suffix}-${round}-B`),
      ]);
      const movements = await owner.client.ventures.movements({
        ventureId: venture.id,
      });
      const takenBdt = movements
        .filter(
          (one) => one.kind === "capital_in" && one.agreementId === agreementId
        )
        .reduce((sum, one) => sum + one.amountBdt, 0);
      if (takenBdt > 100_000) {
        overpaid.push({ agreementId, takenBdt });
      }
    }

    // An Agreement for two Units at ৫০,০০০ is worth ১,০০,০০০ and not one taka more, however many
    // people are paying into it at once.
    expect(overpaid).toEqual([]);
  });
});
