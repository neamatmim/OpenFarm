import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * An Investor after they are written down: put right when what was written was wrong or has changed, and
 * retired when they are done with the farm — never removed, because their Agreements, their payouts and the
 * statements the farm gave them are kept for twelve years and every one of them names them.
 */
const suffix = `investor-changes-${Date.now()}`;

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

const person = (which: number) => ({
  name: `বিনিয়োগকারী ${which} ${suffix}`,
  phone: `0182${String(which).padStart(7, "0")}`,
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
});

describe("an Investor's record", () => {
  it("is put right, and the trail keeps what it said before", async () => {
    const owner = await as("owner", "2046-08-03T04:00:00.000Z");
    const { id } = await owner.client.investors.record(person(1));
    await owner.client.investors.update({
      id,
      ...person(1),
      address: "ত্রিশাল, ময়মনসিংহ",
      bankAccount: "করিম মিয়া\nডাচ্-বাংলা ব্যাংক · 1051 0023 44781\nত্রিশাল শাখা",
      nominee: { name: "রোকেয়া বেগম", relation: "মা" },
    });

    const { people } = await owner.client.investors.list();
    expect(people.find((one) => one.id === id)).toMatchObject({
      address: "ত্রিশাল, ময়মনসিংহ",
      bankAccount: "করিম মিয়া\nডাচ্-বাংলা ব্যাংক · 1051 0023 44781\nত্রিশাল শাখা",
      // A nominee's phone left out of the correction is a phone taken off, not one kept.
      nominee: { name: "রোকেয়া বেগম", phone: null, relation: "মা" },
    });
    const trail = await owner.client.audit.list({
      entity: "investor",
      entityId: id,
    });
    const correction = trail.find((one) => one.action === "update");
    expect(correction?.before).toMatchObject({
      bankAccount: person(1).bankAccount,
    });
    expect(correction?.after).toMatchObject({
      bankAccount: "করিম মিয়া\nডাচ্-বাংলা ব্যাংক · 1051 0023 44781\nত্রিশাল শাখা",
    });
  });

  it("refuses a correction that makes them somebody already written down", async () => {
    const owner = await as("owner", "2046-08-04T04:00:00.000Z");
    const first = await owner.client.investors.record(person(2));
    const second = await owner.client.investors.record(person(3));
    await expect(
      owner.client.investors.update({ id: second.id, ...person(2) })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "investor_exists" },
    });
    // Their own name and phone, given back unchanged, is not somebody else.
    await expect(
      owner.client.investors.update({ id: first.id, ...person(2) })
    ).resolves.toMatchObject({ id: first.id });
  });

  it("will not retire somebody whose money is in a Venture still running", async () => {
    const owner = await as("owner", "2046-08-05T04:00:00.000Z");
    const { id } = await owner.client.investors.record(person(4));
    await owner.client.ventures.sign({
      ventureId,
      investorId: id,
      units: 1,
      ...paper,
    });
    await expect(owner.client.investors.retire({ id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "investor_still_in" },
    });
  });

  it("is retired and kept, is not signed while retired, and is brought back", async () => {
    const owner = await as("owner", "2046-08-06T04:00:00.000Z");
    const { id } = await owner.client.investors.record(person(5));
    await owner.client.investors.retire({ id });

    const retired = await owner.client.investors.list();
    expect(retired.people.find((one) => one.id === id)?.retiredAt).toEqual(
      new Date("2046-08-06T04:00:00.000Z")
    );
    await expect(
      owner.client.ventures.sign({
        ventureId,
        investorId: id,
        units: 1,
        ...paper,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "investor_retired" },
    });
    // Written down again by somebody who forgot, they are pointed at the one already there.
    await expect(
      owner.client.investors.record(person(5))
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "investor_retired" },
    });

    await owner.client.investors.bringBack({ id });
    const back = await owner.client.investors.list();
    expect(back.people.find((one) => one.id === id)?.retiredAt).toBeNull();
    await expect(
      owner.client.ventures.sign({
        ventureId,
        investorId: id,
        units: 1,
        ...paper,
      })
    ).resolves.toBeDefined();
  });

  it("signs one Agreement per person per Venture, and says so of a second", async () => {
    const owner = await as("owner", "2046-08-06T06:00:00.000Z");
    const { id } = await owner.client.investors.record(person(7));
    await owner.client.ventures.sign({
      ventureId,
      investorId: id,
      units: 1,
      ...paper,
    });
    // Asked again — a sheet left filled in after its photo failed, a second tap — the farm says what is
    // wrong in words, not with the database's unique index.
    await expect(
      owner.client.ventures.sign({
        ventureId,
        investorId: id,
        units: 1,
        ...paper,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "investor_already_signed" },
    });
  });

  it("is the Owner's alone to put right, retire or bring back", async () => {
    const owner = await as("owner", "2046-08-07T04:00:00.000Z");
    const { id } = await owner.client.investors.record(person(6));
    const manager = await as("manager", "2046-08-07T05:00:00.000Z");
    await expect(
      manager.client.investors.update({ id, ...person(6) })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(manager.client.investors.retire({ id })).rejects.toMatchObject(
      { code: "FORBIDDEN" }
    );
    await expect(
      manager.client.investors.bringBack({ id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
