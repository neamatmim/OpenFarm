import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitingInvestors, signedInAs } from "../test/portal-client";
import { appRouter } from "./index";

// One Investor's Requests to Join, on the Owner's page of them: every Venture they asked on, where each stands and why
// it closed if it did — and, beside the papers they read, what they did to their Requests in the portal. The Owner's
// alone.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2060-01-01T04:00:00.000Z";
/** An hour of the same January day, after the Investors were invited at four. */
const at = (hour: number) =>
  `2060-01-01T${String(10 + hour).padStart(2, "0")}:00:00.000Z`;

const as = async (role: "owner" | "manager", instant = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(instant),
  });
  return client;
};

const invited = invitingInvestors({ prefix: "017", run: suffix }, JANUARY);

/** A Venture of ten Units at fifty thousand each, shown in the portal. */
const aShownVenture = async (name: string) => {
  const owner = await as("owner");
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalBdt: 500_000,
    floorBdt: 300_000,
    decideBy: "2060-01-20",
    targetWindowStart: "2060-06-01",
    targetWindowEnd: "2060-06-10",
    unitPriceBdt: 50_000,
    units: 10,
    cattleBudgetBdt: 400_000,
  });
  await owner.ventures.showInPortal({ id: venture.id, words: "" });
  return venture.id;
};

/** What an act was refused with, as the screen reads it. */
const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    const said = error as { code?: string; data?: { refusal?: string } };
    return said.data?.refusal ?? said.code;
  }
  return "not refused";
};

let karim = { id: "", loginEmail: "" };
let rahim = { id: "", loginEmail: "" };
let first = "";
let second = "";
let firstRequest = "";
let secondRequest = "";

beforeAll(async () => {
  const owner = await as("owner");
  await owner.investors.setPortalOpen({ open: true });
  await as("manager");
  first = await aShownVenture("প্রথম অনুরোধের ভেঞ্চার");
  second = await aShownVenture("দ্বিতীয় অনুরোধের ভেঞ্চার");
  karim = await invited("করিম");
  rahim = await invited("রহিম");
  // Karim asks on the first and changes it, then asks on the second and withdraws that; the farm later calls the
  // first off.
  const early = await signedInAs(karim.loginEmail, at(1));
  const madeFirst = await early.portal.requestToJoin({
    ventureId: first,
    units: 2,
    note: "",
  });
  firstRequest = madeFirst.id;
  const later = await signedInAs(karim.loginEmail, at(2));
  await later.portal.requestToJoin({ ventureId: first, units: 3, note: "" });
  const latest = await signedInAs(karim.loginEmail, at(3));
  const madeSecond = await latest.portal.requestToJoin({
    ventureId: second,
    units: 1,
    note: "",
  });
  secondRequest = madeSecond.id;
  const withdrawing = await signedInAs(karim.loginEmail, at(4));
  await withdrawing.portal.withdrawRequest({ requestId: secondRequest });
  // Somebody else's Request, which is none of Karim's page's business.
  const other = await signedInAs(rahim.loginEmail, at(5));
  await other.portal.requestToJoin({ ventureId: first, units: 4, note: "" });
  const callingOff = await as("owner", at(6));
  await callingOff.ventures.cancel({ id: first, reason: "যথেষ্ট টাকা আসেনি" });
});

describe("an Investor's Requests, on the Owner's page of them", () => {
  it("are every Venture they asked on, the newest first, each with where it stands and why it closed", async () => {
    const owner = await as("owner");

    const theirs = await owner.investors.requests({ id: karim.id });

    expect(
      theirs.map((one) => ({
        id: one.id,
        ventureName: one.ventureName,
        state: one.state,
        units: one.units,
        closedBecause: one.closedBecause,
      }))
    ).toEqual([
      {
        id: secondRequest,
        ventureName: `দ্বিতীয় অনুরোধের ভেঞ্চার ${suffix}`,
        state: "withdrawn",
        units: 1,
        closedBecause: null,
      },
      {
        id: firstRequest,
        ventureName: `প্রথম অনুরোধের ভেঞ্চার ${suffix}`,
        state: "closed",
        units: 3,
        closedBecause: "venture_cancelled",
      },
    ]);
  });

  it("put two made in the same moment in one order every time", async () => {
    const one = await aShownVenture("একই মুহূর্ত এক");
    const two = await aShownVenture("একই মুহূর্ত দুই");
    const nasir = await invited("নাসির");
    const same = await signedInAs(nasir.loginEmail, at(7));
    const asked = [
      await same.portal.requestToJoin({ ventureId: one, units: 1, note: "" }),
      await same.portal.requestToJoin({ ventureId: two, units: 1, note: "" }),
    ].map((made) => made.id);
    const owner = await as("owner");

    const theirs = await owner.investors.requests({ id: nasir.id });

    // Newest first, and the later id first where the moment is the same.
    expect(theirs.map((mine) => mine.id)).toEqual(
      asked.toSorted().toReversed()
    );
  });

  it("are the Owner's alone: not the Manager's, and not the Investor's own through this door", async () => {
    const manager = await as("manager");
    const himself = await signedInAs(karim.loginEmail, at(8));

    expect(await refusalOf(manager.investors.requests({ id: karim.id }))).toBe(
      "owner_only"
    );
    expect(
      await refusalOf(himself.investors.requests({ id: karim.id }))
    ).not.toBe("not refused");
  });
});

describe("what an Investor did to their Requests, in their portal activity", () => {
  it("is each made, changed and withdrawn, with when and on which Venture, the latest first — and nobody else's", async () => {
    const owner = await as("owner");

    const activity = await owner.investors.portalActivity({ id: karim.id });

    expect(
      activity?.requestChanges.map((one) => ({
        kind: one.kind,
        units: one.units,
        ventureName: one.ventureName,
        at: one.at,
      }))
    ).toEqual([
      {
        kind: "withdrawn",
        units: 1,
        ventureName: `দ্বিতীয় অনুরোধের ভেঞ্চার ${suffix}`,
        at: new Date(at(4)),
      },
      {
        kind: "made",
        units: 1,
        ventureName: `দ্বিতীয় অনুরোধের ভেঞ্চার ${suffix}`,
        at: new Date(at(3)),
      },
      {
        kind: "changed",
        units: 3,
        ventureName: `প্রথম অনুরোধের ভেঞ্চার ${suffix}`,
        at: new Date(at(2)),
      },
      {
        kind: "made",
        units: 2,
        ventureName: `প্রথম অনুরোধের ভেঞ্চার ${suffix}`,
        at: new Date(at(1)),
      },
    ]);
  });

  it("is the Owner's alone, as the rest of it is", async () => {
    const manager = await as("manager");

    expect(
      await refusalOf(manager.investors.portalActivity({ id: karim.id }))
    ).toBe("owner_only");
  });
});
