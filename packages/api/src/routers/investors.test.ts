import { farm } from "@OpenFarm/db/schema/farm";
import { investor } from "@OpenFarm/db/schema/venture";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The Investors and what they signed: one record per person, one Investment Agreement per Venture they
 * join, and a cap the farm may not go past — twenty in one business for gain is a company.
 */
const suffix = `investors-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 2_000_000,
  floorBdt: 0,
  decideBy: "2046-08-15",
  targetWindowStart: "2047-05-17",
  targetWindowEnd: "2047-05-19",
  unitPriceBdt: 50_000,
  units: 40,
  cattleBudgetBdt: 1_500_000,
};

const paper = {
  investorsPercent: 60,
  arbitrator: `মাওলানা আব্দুল হক ${suffix}`,
  stampValueBdt: 300,
  stampedOn: "2046-08-02",
  stampSerial: `AA ${suffix}`,
};

let ventureId = "";
let otherVentureId = "";

const someone = async (owner: Awaited<ReturnType<typeof as>>, which: number) =>
  await owner.client.investors.record({
    name: `বিনিয়োগকারী ${which} ${suffix}`,
    phone: `0181${String(which).padStart(7, "0")}`,
    address: "ময়মনসিংহ",
    nid: `1984${String(which).padStart(9, "0")}`,
    bankAccount: `IBBL ****${String(which).padStart(4, "0")}`,
    nominee: { name: `নমিনি ${which}`, phone: "01900000000", relation: "স্ত্রী" },
  });

beforeAll(async () => {
  const owner = await as("owner", "2046-08-01T04:00:00.000Z");
  const one = await owner.client.ventures.open({
    name: `ঈদ ২০৪৭ ${suffix}`,
    ...plan,
  });
  ventureId = one.id;
  const two = await owner.client.ventures.open({
    name: `দ্বিতীয় ${suffix}`,
    ...plan,
  });
  otherVentureId = two.id;
});

describe("the Investors", () => {
  it("is one record per person, however many Ventures they join", async () => {
    const owner = await as("owner", "2046-08-03T04:00:00.000Z");
    const karim = await someone(owner, 1);
    await owner.client.ventures.sign({
      ventureId,
      investorId: karim.id,
      units: 3,
      ...paper,
    });
    await owner.client.ventures.sign({
      ventureId: otherVentureId,
      investorId: karim.id,
      units: 2,
      ...paper,
    });
    const people = await owner.client.investors.list();
    expect(people.people.filter((one) => one.id === karim.id)).toHaveLength(1);
    const signed = await owner.client.ventures.agreements({ ventureId });
    expect(signed).toEqual([
      expect.objectContaining({
        investorId: karim.id,
        units: 3,
        investorsPercent: 60,
        farmPercent: 40,
        hasPaper: false,
      }),
    ]);
  });

  it("keeps the stamped paper against the Agreement", async () => {
    const owner = await as("owner", "2046-08-04T04:00:00.000Z");
    const [signed] = await owner.client.ventures.agreements({ ventureId });
    await owner.client.ventures.keepAgreementPaper({
      agreementId: signed?.id ?? "",
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    const afterwards = await owner.client.ventures.agreements({ ventureId });
    expect(afterwards[0]).toMatchObject({ hasPaper: true });
  });

  it("refuses more Units than the Venture has left", async () => {
    const owner = await as("owner", "2046-08-05T04:00:00.000Z");
    const greedy = await someone(owner, 2);
    await expect(
      owner.client.ventures.sign({
        ventureId,
        investorId: greedy.id,
        units: 39,
        ...paper,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a signature once the Venture has left Open", async () => {
    const owner = await as("owner", "2046-08-06T04:00:00.000Z");
    const late = await someone(owner, 3);
    const started = await owner.client.ventures.open({
      name: `শুরু হয়ে গেছে ${suffix}`,
      ...plan,
    });
    await owner.client.ventures.startBuying({ id: started.id });
    await expect(
      owner.client.ventures.sign({
        ventureId: started.id,
        investorId: late.id,
        units: 1,
        ...paper,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps the Target Window as the paper said it, and the split it earns", async () => {
    const owner = await as("owner", "2046-08-09T04:00:00.000Z");
    const [signed] = await owner.client.ventures.agreements({ ventureId });
    expect(signed).toMatchObject({
      targetWindow: {
        start: plan.targetWindowStart,
        end: plan.targetWindowEnd,
      },
      investorsPercent: 60,
      farmPercent: 40,
    });
  });

  it("refuses an Investor who is not this farm's", async () => {
    const owner = await as("owner", "2046-08-10T04:00:00.000Z");
    const elsewhere = `investor-elsewhere-${suffix}`;
    // A whole other farm, with an Investor of its own. Signed onto our Venture, they would count
    // against our cap and never appear on our own list.
    await scratchDb()
      .insert(farm)
      .values({
        id: `farm-elsewhere-${suffix}`,
        name: `অন্য খামার ${suffix}`,
        createdAt: new Date("2046-01-01T00:00:00.000Z"),
      });
    await scratchDb()
      .insert(investor)
      .values({
        id: elsewhere,
        farmId: `farm-elsewhere-${suffix}`,
        name: `অন্য খামারের বিনিয়োগকারী ${suffix}`,
        phone: "01999999999",
        createdAt: new Date("2046-01-01T00:00:00.000Z"),
      });
    await expect(
      owner.client.ventures.sign({
        ventureId,
        investorId: elsewhere,
        units: 1,
        ...paper,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses the same person written down twice", async () => {
    const owner = await as("owner", "2046-08-11T04:00:00.000Z");
    const twice = {
      name: `দুইবার ${suffix}`,
      phone: "01711111111",
    };
    await owner.client.investors.record(twice);
    await expect(owner.client.investors.record(twice)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("refuses a paper with no stamp on it", async () => {
    const owner = await as("owner", "2046-08-12T04:00:00.000Z");
    const unstamped = await someone(owner, 4);
    await expect(
      owner.client.ventures.sign({
        ventureId,
        investorId: unstamped.id,
        units: 1,
        ...paper,
        stampValueBdt: 0,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("stops counting a Venture once it is called off", async () => {
    const owner = await as("owner", "2046-08-13T04:00:00.000Z");
    const doomed = await owner.client.ventures.open({
      name: `বাতিল হবে ${suffix}`,
      ...plan,
    });
    const only = await someone(owner, 5);
    await owner.client.ventures.sign({
      ventureId: doomed.id,
      investorId: only.id,
      units: 1,
      ...paper,
    });
    const whileOpen = await owner.client.investors.list();
    await owner.client.ventures.cancel({
      id: doomed.id,
      reason: "Floor not met by the day it had to be",
    });
    const afterwards = await owner.client.investors.list();
    // This person was in nothing else, so calling the Venture off takes them out of the count.
    expect(afterwards.standing).toBe(whileOpen.standing - 1);
    expect(afterwards.people.find((one) => one.id === only.id)?.unitsHeld).toBe(
      0
    );
  });

  it("warns as the cap nears, and refuses one too many", async () => {
    const owner = await as("owner", "2046-08-07T04:00:00.000Z");
    const roomy = await owner.client.ventures.open({
      name: `ভিড় ${suffix}`,
      ...plan,
      units: 400,
      unitPriceBdt: 5000,
    });
    // Fill up towards the cap. What counts is people who have signed for a Venture still running, not
    // people the farm has written down, so each step asks the farm how many are in rather than counting
    // records.
    const fillTo = async (target: number) => {
      const sofar = await owner.client.investors.list();
      for (let which = sofar.standing; which < target; which += 1) {
        // oxlint-disable-next-line no-await-in-loop -- each signature is counted against the one before it
        const person = await someone(owner, 100 + which);
        // oxlint-disable-next-line no-await-in-loop -- as above
        await owner.client.ventures.sign({
          ventureId: roomy.id,
          investorId: person.id,
          units: 1,
          ...paper,
        });
      }
      return await owner.client.investors.list();
    };
    const settings = await owner.client.farm.current();
    const warnAt =
      settings && "investorWarnAt" in settings
        ? (settings.investorWarnAt ?? 15)
        : 15;
    const { cap } = await owner.client.investors.list();

    // One short of the warning level, the farm says nothing; on it, it warns.
    const quiet = await fillTo(warnAt - 1);
    expect(quiet.nearingTheCap).toBe(false);
    const warned = await fillTo(warnAt);
    expect(warned.standing).toBe(warnAt);
    expect(warned.nearingTheCap).toBe(true);

    const crowded = await fillTo(cap);
    expect(crowded.standing).toBe(cap);
    expect(crowded.nearingTheCap).toBe(true);

    // And the twenty-first is refused whatever Venture they would join — the cap counts people across
    // every Venture still running, so a second Venture is not a second twenty.
    const oneTooMany = await someone(owner, 999);
    await expect(
      owner.client.ventures.sign({
        ventureId,
        investorId: oneTooMany.id,
        units: 1,
        ...paper,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is the Owner's alone, Agreements and signatures too", async () => {
    const manager = await as("manager", "2046-08-14T04:00:00.000Z");
    await expect(
      manager.client.ventures.agreements({ ventureId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.client.ventures.sign({
        ventureId,
        investorId: "whoever",
        units: 1,
        ...paper,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.client.investors.record({ name: "কেউ", phone: "01800000000" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager", "2046-08-08T04:00:00.000Z");
    await expect(manager.client.investors.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
