import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The monthly bank check: what the Venture Account really held at a month's end, against what the farm
 * thinks it should have held. A mistake caught in weeks is one somebody can still remember.
 */
const suffix = `bank-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2047-07-20",
  targetWindowStart: "2047-10-17",
  targetWindowEnd: "2047-10-19",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

let ventureId = "";

const theVenture = async (owner: Awaited<ReturnType<typeof as>>) => {
  const ventures = await owner.client.ventures.list();
  return ventures.find((one) => one.id === ventureId);
};

beforeAll(async () => {
  const owner = await as("owner", "2047-07-01T04:00:00.000Z");
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    ...plan,
  });
  ventureId = venture.id;
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${suffix}`,
    phone: "01977777777",
  });
  const agreement = await owner.client.ventures.sign({
    ventureId,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2047-07-02",
    stampSerial: `AA ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  // Six lakh in July, and four more in August: the July check must not count August's money.
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: 600_000,
    movedOn: "2047-07-10",
    paymentMethod: "bank",
    reference: `TRF-${suffix}-1`,
  });
  const august = await as("owner", "2047-08-10T04:00:00.000Z");
  await august.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: 400_000,
    movedOn: "2047-08-10",
    paymentMethod: "bank",
    reference: `TRF-${suffix}-2`,
  });
});

describe("the monthly bank check", () => {
  it("says what the account should have held at the month's end", async () => {
    const owner = await as("owner", "2047-09-01T04:00:00.000Z");
    const july = await owner.client.ventures.expectedAtMonthEnd({
      ventureId,
      month: "2047-07",
    });
    // Only July's six lakh: August's four had not arrived when July ended.
    expect(july).toMatchObject({ expectedBdt: 600_000, checked: null });
    const august = await owner.client.ventures.expectedAtMonthEnd({
      ventureId,
      month: "2047-08",
    });
    expect(august.expectedBdt).toBe(1_000_000);
  });

  it("agrees when the statement agrees", async () => {
    const owner = await as("owner", "2047-09-02T04:00:00.000Z");
    const checked = await owner.client.ventures.checkTheBank({
      ventureId,
      month: "2047-07",
      readBdt: 600_000,
    });
    expect(checked).toMatchObject({
      expectedBdt: 600_000,
      readBdt: 600_000,
      differenceBdt: 0,
    });
    const venture = await theVenture(owner);
    expect(venture?.bank).toMatchObject({
      lastCheckedMonth: "2047-07",
      monthsOut: [],
      monthsStale: [],
    });
  });

  it("says by how much when it does not, and keeps it as disagreeing", async () => {
    const owner = await as("owner", "2047-09-03T04:00:00.000Z");
    const checked = await owner.client.ventures.checkTheBank({
      ventureId,
      month: "2047-08",
      readBdt: 995_000,
      note: `ব্যাংকের চার্জ হতে পারে ${suffix}`,
    });
    // Five thousand the farm cannot account for, and the farm says so rather than adjusting itself.
    expect(checked).toMatchObject({
      expectedBdt: 1_000_000,
      differenceBdt: -5000,
    });
    const venture = await theVenture(owner);
    expect(venture?.bank).toMatchObject({
      lastCheckedMonth: "2047-08",
      monthsOut: ["2047-08"],
    });
    // And what she found out about it is kept with it.
    const again = await owner.client.ventures.expectedAtMonthEnd({
      ventureId,
      month: "2047-08",
    });
    expect(again.checked).toMatchObject({
      readBdt: 995_000,
      note: `ব্যাংকের চার্জ হতে পারে ${suffix}`,
    });
  });

  it("does not let a month that disagreed come right without a word", async () => {
    const owner = await as("owner", "2047-09-04T03:00:00.000Z");
    // August is out by five thousand. Typing a figure that agrees, and nothing else, is how a
    // problem quietly stops existing.
    await expect(
      owner.client.ventures.checkTheBank({
        ventureId,
        month: "2047-08",
        readBdt: 1_000_000,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "say_what_you_found_out" },
    });
  });

  it("puts a month right rather than reading it twice", async () => {
    const owner = await as("owner", "2047-09-04T04:00:00.000Z");
    await owner.client.ventures.checkTheBank({
      ventureId,
      month: "2047-08",
      readBdt: 1_000_000,
      note: `ব্যাংক ঠিক করে দিয়েছে ${suffix}`,
    });
    const venture = await theVenture(owner);
    expect(venture?.bank).toMatchObject({
      lastCheckedMonth: "2047-08",
      monthsOut: [],
      monthsStale: [],
    });
    // One record for that month, not two: the trail carries the change, the account does not.
    const trail = await owner.client.audit.list({
      entity: "venture_bank_check",
    });
    const august = trail.filter(
      (one) =>
        (one.after as { forMonth?: string } | null)?.forMonth === "2047-08"
    );
    // Read twice, recorded once: the first is the reading, the second is it put right.
    expect(august.map((one) => one.action)).toEqual(["update", "create"]);
  });

  it("goes stale when the ground under it moves, and every month after it", async () => {
    const owner = await as("owner", "2047-09-06T04:00:00.000Z");
    const movements = await owner.client.ventures.movements({ ventureId });
    const july = movements.find(
      (one) => one.reference === `TRF-${suffix}-1`
    )?.id;
    // Six lakh was typed where five and a half was sent. July is put right — and so, silently, is what
    // the farm believes about every month that followed it.
    await owner.client.ventures.correctMovement({
      id: july ?? "",
      reason: `স্লিপে সাড়ে পাঁচ লাখ ${suffix}`,
      changes: { amountBdt: { from: 600_000, to: 550_000 } },
    });

    const venture = await theVenture(owner);
    // Both months agreed with a figure nobody holds any more, so neither of them settles anything.
    expect(venture?.bank).toMatchObject({
      monthsStale: ["2047-07", "2047-08"],
      monthsOut: ["2047-07", "2047-08"],
    });
    // The month says so where she opens it: what the farm believes now, against what she read it on.
    const reopened = await owner.client.ventures.expectedAtMonthEnd({
      ventureId,
      month: "2047-07",
    });
    expect(reopened).toMatchObject({
      expectedBdt: 550_000,
      checked: { readBdt: 600_000, expectedBdt: 600_000, stale: true },
    });
  });

  it("clears a stale month when the statement is read again", async () => {
    const owner = await as("owner", "2047-09-07T04:00:00.000Z");
    await owner.client.ventures.checkTheBank({
      ventureId,
      month: "2047-07",
      readBdt: 550_000,
      note: `সংশোধনের পর আবার মিলিয়েছি ${suffix}`,
    });
    const afterJuly = await theVenture(owner);
    // July is read again and agrees. August is untouched and still stale: reading one month says
    // nothing about another.
    expect(afterJuly?.bank).toMatchObject({
      monthsStale: ["2047-08"],
      monthsOut: ["2047-08"],
    });

    await owner.client.ventures.checkTheBank({
      ventureId,
      month: "2047-08",
      readBdt: 950_000,
      note: `সংশোধনের পর আবার মিলিয়েছি ${suffix}`,
    });
    const afterAugust = await theVenture(owner);
    expect(afterAugust?.bank).toMatchObject({
      lastCheckedMonth: "2047-08",
      monthsStale: [],
      monthsOut: [],
    });
  });

  it("refuses a month that is not over, and is the Owner's alone", async () => {
    const owner = await as("owner", "2047-09-05T04:00:00.000Z");
    await expect(
      owner.client.ventures.checkTheBank({
        ventureId,
        month: "2047-09",
        readBdt: 1000,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "month_not_over" },
    });

    const manager = await as("manager", "2047-09-05T05:00:00.000Z");
    await expect(
      manager.client.ventures.checkTheBank({
        ventureId,
        month: "2047-08",
        readBdt: 1000,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.client.ventures.expectedAtMonthEnd({
        ventureId,
        month: "2047-08",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
