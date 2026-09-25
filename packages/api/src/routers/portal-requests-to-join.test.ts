import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import {
  invitingInvestors,
  signedInAs as investorSignedIn,
} from "../test/portal-client";
import { appRouter } from "./index";

// A Request to Join (ADR 0008): an invited Investor saying they want whole Units of a Venture the Owner has shown,
// with a note if they like. It binds nobody. They change it and withdraw it until somebody answers, every change is
// kept, and nobody but the Owner reads it.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2052-01-01T04:00:00.000Z";
const AFTER_DECIDE_BY = "2052-01-21T04:00:00.000Z";

const asOwner = async (at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  return client;
};

/** The API as an Investor reaches it, signed in on the day given. */
const signedInAs = (loginEmail: string, at = JANUARY) =>
  investorSignedIn(loginEmail, at);

/** An Investor written down by the Owner, invited, and signed in to the portal. */
const invited = invitingInvestors({ prefix: "017", run: suffix }, JANUARY);

const TERMS = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 600_000,
  decideBy: "2052-01-20",
  targetWindowStart: "2052-06-01",
  targetWindowEnd: "2052-06-10",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

/** An Open Venture of the farm's, shown in the portal unless asked otherwise. */
const aVenture = async (name: string, { shown = true } = {}) => {
  const owner = await asOwner();
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    ...TERMS,
  });
  if (shown) {
    await owner.ventures.showInPortal({ id: venture.id, words: "" });
  }
  return venture.id;
};

/** What an act was refused with, as the screen reads it. */
const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    return (error as { data?: { refusal?: string } }).data?.refusal;
  }
  return "not refused";
};

/** Whether an act was refused at all, whatever it was refused with. */
const refused = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch {
    return true;
  }
  return false;
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.investors.setPortalOpen({ open: true });
});

describe("an Investor asking to join", () => {
  it("asks for whole Units with a note, and reads it back on their own page with the taka it comes to", async () => {
    const ventureId = await aVenture("প্রথম ভেঞ্চার");
    const karim = await invited("করিম");

    const made = await karim.client.portal.requestToJoin({
      ventureId,
      units: 4,
      note: "ঈদের পরে টাকা দিতে পারব",
    });

    expect(await karim.client.portal.myRequests()).toEqual([
      {
        id: made.id,
        ventureId,
        ventureName: `প্রথম ভেঞ্চার ${suffix}`,
        units: 4,
        bdt: 200_000,
        note: "ঈদের পরে টাকা দিতে পারব",
        state: "waiting",
        madeAt: new Date(JANUARY),
        changedAt: new Date(JANUARY),
        answeredUnits: null,
        answerLine: null,
      },
    ]);
  });

  it("changes the live Request when they ask again, and never piles up a second", async () => {
    const ventureId = await aVenture("বদলের ভেঞ্চার");
    const salma = await invited("সালমা");
    const first = await salma.client.portal.requestToJoin({
      ventureId,
      units: 4,
      note: "",
    });

    const again = await salma.client.portal.requestToJoin({
      ventureId,
      units: 6,
      note: "ছয়টা নেব",
    });

    expect(again.id).toBe(first.id);
    const hers = await salma.client.portal.myRequests();
    expect(hers.map((one) => [one.units, one.note, one.state])).toEqual([
      [6, "ছয়টা নেব", "waiting"],
    ]);
  });

  it("can withdraw, and ask again afterwards as a new Request while the Venture is still shown", async () => {
    const ventureId = await aVenture("ফেরার ভেঞ্চার");
    const jamal = await invited("জামাল");
    const first = await jamal.client.portal.requestToJoin({
      ventureId,
      units: 3,
      note: "",
    });

    await jamal.client.portal.withdrawRequest({ requestId: first.id });
    const second = await jamal.client.portal.requestToJoin({
      ventureId,
      units: 2,
      note: "",
    });

    expect(second.id).not.toBe(first.id);
    const his = await jamal.client.portal.myRequests();
    expect(his.map((one) => [one.id, one.units, one.state]).toSorted()).toEqual(
      [
        [first.id, 3, "withdrawn"],
        [second.id, 2, "waiting"],
      ].toSorted()
    );
  });

  it("keeps one Request when two first taps race: the other changes it or is told it was asked twice", async () => {
    const ventureId = await aVenture("দুই চাপের ভেঞ্চার");
    const dipu = await invited("দীপু");

    const both = await Promise.allSettled([
      dipu.client.portal.requestToJoin({ ventureId, units: 2, note: "" }),
      dipu.client.portal.requestToJoin({ ventureId, units: 3, note: "" }),
    ]);

    const failed = both.flatMap((one) =>
      one.status === "rejected"
        ? [(one.reason as { data?: { refusal?: string } }).data?.refusal]
        : []
    );
    expect(failed.every((word) => word === "asked_twice_at_once")).toBe(true);
    const his = await dipu.client.portal.myRequests();
    expect(his.map((one) => one.state)).toEqual(["waiting"]);
  });

  it("cannot withdraw what is already withdrawn", async () => {
    const ventureId = await aVenture("দুবার ফেরার ভেঞ্চার");
    const rina = await invited("রিনা");
    const made = await rina.client.portal.requestToJoin({
      ventureId,
      units: 1,
      note: "",
    });
    await rina.client.portal.withdrawRequest({ requestId: made.id });

    expect(
      await refusalOf(
        rina.client.portal.withdrawRequest({ requestId: made.id })
      )
    ).toBe("request_not_live");
  });
});

describe("what the farm keeps of a Request", () => {
  it("keeps each thing the Investor did, with the Units and note as they then were and when, for the Owner to read beneath it", async () => {
    const ventureId = await aVenture("ইতিহাসের ভেঞ্চার");
    const babul = await invited("বাবুল");
    const made = await babul.client.portal.requestToJoin({
      ventureId,
      units: 4,
      note: "চারটা",
    });
    const later = await signedInAs(
      babul.loginEmail,
      "2052-01-03T04:00:00.000Z"
    );
    await later.portal.requestToJoin({ ventureId, units: 6, note: "ছয়টা" });
    const latest = await signedInAs(
      babul.loginEmail,
      "2052-01-05T04:00:00.000Z"
    );
    await latest.portal.withdrawRequest({ requestId: made.id });

    const owner = await asOwner();
    const { requests } = await owner.ventures.requests({ ventureId });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.history.map(({ id: _id, ...step }) => step)).toEqual([
      {
        kind: "made",
        units: 4,
        note: "চারটা",
        at: new Date(JANUARY),
      },
      {
        kind: "changed",
        units: 6,
        note: "ছয়টা",
        at: new Date("2052-01-03T04:00:00.000Z"),
      },
      {
        kind: "withdrawn",
        units: 6,
        note: "ছয়টা",
        at: new Date("2052-01-05T04:00:00.000Z"),
      },
    ]);
  });

  it("writes each of them in the trail as the Investor's own act, under their account and no Role", async () => {
    const ventureId = await aVenture("খাতার ভেঞ্চার");
    const lipi = await invited("লিপি");
    const made = await lipi.client.portal.requestToJoin({
      ventureId,
      units: 2,
      note: "",
    });
    await lipi.client.portal.requestToJoin({ ventureId, units: 3, note: "" });
    await lipi.client.portal.withdrawRequest({ requestId: made.id });

    const owner = await asOwner();
    const trail = await owner.audit.list({
      entity: "request_to_join",
      entityId: made.id,
    });

    const said = trail
      .map((one) => ({
        action: one.action,
        actorId: one.actorId,
        roleUsed: one.roleUsed,
        after: (one.after as { units: number; state: string }) ?? null,
      }))
      .toReversed();
    expect(said).toEqual([
      {
        action: "create",
        actorId: lipi.userId,
        roleUsed: null,
        after: expect.objectContaining({ units: 2, state: "waiting" }),
      },
      {
        action: "update",
        actorId: lipi.userId,
        roleUsed: null,
        after: expect.objectContaining({ units: 3, state: "waiting" }),
      },
      {
        action: "update",
        actorId: lipi.userId,
        roleUsed: null,
        after: expect.objectContaining({ units: 3, state: "withdrawn" }),
      },
    ]);
  });
});

describe("the Owner reading a Venture's Requests", () => {
  it("lists each with the Investor, Units, taka, note, when and where it stands, and totals signed and waiting beside them", async () => {
    const ventureId = await aVenture("মালিকের ভেঞ্চার");
    const owner = await asOwner();
    const signedOne = await invited("স্বাক্ষরী");
    await owner.ventures.sign({
      ventureId,
      investorId: signedOne.id,
      units: 5,
      investorsPercent: 60,
      arbitrator: `সালিস ${suffix}`,
      stampKind: "paper",
      stampValueBdt: 300,
      stampedOn: "2052-01-02",
      stampSerial: `S-R${suffix}`,
    });
    const asker = await invited("প্রার্থী");
    const other = await invited("আরেকজন");
    const leaver = await invited("চলে যাওয়া");
    const made = await asker.client.portal.requestToJoin({
      ventureId,
      units: 4,
      note: "ফোন করবেন",
    });
    await other.client.portal.requestToJoin({ ventureId, units: 3, note: "" });
    const gone = await leaver.client.portal.requestToJoin({
      ventureId,
      units: 7,
      note: "",
    });
    await leaver.client.portal.withdrawRequest({ requestId: gone.id });

    const { requests, totals } = await owner.ventures.requests({ ventureId });

    expect(requests.find((one) => one.id === made.id)).toMatchObject({
      investorId: asker.id,
      units: 4,
      bdt: 200_000,
      note: "ফোন করবেন",
      state: "waiting",
      madeAt: new Date(JANUARY),
    });
    // The withdrawn Request is still listed, and counts for nothing.
    expect(requests.find((one) => one.id === gone.id)?.state).toBe("withdrawn");
    expect(totals).toEqual({
      signedUnits: 5,
      signedBdt: 250_000,
      promisedUnits: 0,
      promisedBdt: 0,
      promisableUnits: 15,
      waitingUnits: 7,
      waitingBdt: 350_000,
    });
  });

  it("is the Owner's alone: the Manager reads no Venture's Requests, and not in the trail either", async () => {
    const ventureId = await aVenture("ম্যানেজারের ভেঞ্চার");
    const nila = await invited("নীলা");
    const made = await nila.client.portal.requestToJoin({
      ventureId,
      units: 2,
      note: "",
    });
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(JANUARY),
    });

    expect(await refused(manager.ventures.requests({ ventureId }))).toBe(true);
    expect(
      await manager.audit.list({
        entity: "request_to_join",
        entityId: made.id,
      })
    ).toEqual([]);
  });
});

describe("another Investor's Request", () => {
  it("is not read through the Owner's list either: an Investor asking for a Venture's Requests is refused", async () => {
    const ventureId = await aVenture("মালিকের তালিকার ভেঞ্চার");
    const asker = await invited("জিজ্ঞাসু");
    await asker.client.portal.requestToJoin({ ventureId, units: 1, note: "" });
    const nosy = await invited("কৌতূহলী");

    expect(await refused(nosy.client.ventures.requests({ ventureId }))).toBe(
      true
    );
  });

  it("is no such thing to anybody else: they cannot withdraw it, and it is not on their page", async () => {
    const ventureId = await aVenture("অন্যের ভেঞ্চার");
    const hers = await invited("হাসিনা");
    const his = await invited("হাবিব");
    const made = await hers.client.portal.requestToJoin({
      ventureId,
      units: 2,
      note: "আমার কথা",
    });

    expect(
      await refusalOf(his.client.portal.withdrawRequest({ requestId: made.id }))
    ).toBe("no_such_request");
    expect(await his.client.portal.myRequests()).toEqual([]);
    const still = await hers.client.portal.myRequests();
    expect(still.map((one) => one.state)).toEqual(["waiting"]);
  });
});

describe("a Request the farm refuses", () => {
  it("is anything but whole Units from one to the Venture's Units, or a note longer than a note", async () => {
    const ventureId = await aVenture("এককের ভেঞ্চার");
    const tuhin = await invited("তুহিন");
    const ask = (units: number, note = "") =>
      tuhin.client.portal.requestToJoin({ ventureId, units, note });

    expect(await refused(ask(0))).toBe(true);
    expect(await refused(ask(1.5))).toBe(true);
    expect(await refused(ask(3, "অ".repeat(301)))).toBe(true);
    expect(await refusalOf(ask(3, "অ".repeat(300)))).toBe("not refused");
    expect(await refusalOf(ask(TERMS.units + 1))).toBe("units_beyond_venture");
    expect(await refusalOf(ask(TERMS.units))).toBe("not refused");
  });

  it("is on a Venture the Owner has not shown", async () => {
    const ventureId = await aVenture("অদেখা ভেঞ্চার", { shown: false });
    const rubel = await invited("রুবেল");

    expect(
      await refusalOf(
        rubel.client.portal.requestToJoin({ ventureId, units: 1, note: "" })
      )
    ).toBe("venture_not_shown");
  });

  it("is on a Venture taken out of the portal", async () => {
    const ventureId = await aVenture("সরানো ভেঞ্চার");
    const owner = await asOwner();
    await owner.ventures.takeOutOfPortal({ id: ventureId });
    const mitu = await invited("মিতু");

    expect(
      await refusalOf(
        mitu.client.portal.requestToJoin({ ventureId, units: 1, note: "" })
      )
    ).toBe("venture_not_shown");
  });

  it("is on a Venture no longer gathering capital", async () => {
    const ventureId = await aVenture("বাতিল ভেঞ্চার");
    const owner = await asOwner();
    await owner.ventures.cancel({
      id: ventureId,
      reason: "টাকা ওঠেনি",
    });
    const sumon = await invited("সুমন");

    expect(
      await refusalOf(
        sumon.client.portal.requestToJoin({ ventureId, units: 1, note: "" })
      )
    ).toBe("venture_wrong_state");
  });

  it("is on a Venture past its decide-by day", async () => {
    const ventureId = await aVenture("দেরির ভেঞ্চার");
    const pavel = await invited("পাভেল");
    const late = await signedInAs(pavel.loginEmail, AFTER_DECIDE_BY);

    expect(
      await refusalOf(
        late.portal.requestToJoin({ ventureId, units: 1, note: "" })
      )
    ).toBe("venture_past_decide_by");
  });

  it("is from a retired Investor", async () => {
    const ventureId = await aVenture("অবসরের ভেঞ্চার");
    const rahat = await invited("রাহাত");
    const owner = await asOwner();
    await owner.investors.retire({ id: rahat.id });

    expect(
      await refusalOf(
        rahat.client.portal.requestToJoin({ ventureId, units: 1, note: "" })
      )
    ).toBe("investor_retired");
  });

  it("is from somebody already signed on that Venture", async () => {
    const ventureId = await aVenture("স্বাক্ষরের ভেঞ্চার");
    const nasir = await invited("নাসির");
    const owner = await asOwner();
    await owner.ventures.sign({
      ventureId,
      investorId: nasir.id,
      units: 2,
      investorsPercent: 60,
      arbitrator: `সালিস ${suffix}`,
      stampKind: "paper",
      stampValueBdt: 300,
      stampedOn: "2052-01-02",
      stampSerial: `S-N${suffix}`,
    });

    expect(
      await refusalOf(
        nasir.client.portal.requestToJoin({ ventureId, units: 1, note: "" })
      )
    ).toBe("already_signed_on_venture");
  });

  it("is from somebody whose portal access the Owner has taken away", async () => {
    const ventureId = await aVenture("বন্ধ দরজার ভেঞ্চার");
    const shanto = await invited("শান্ত");
    const owner = await asOwner();
    await owner.investors.takePortalAway({ id: shanto.id });

    expect(
      await refusalOf(
        shanto.client.portal.requestToJoin({ ventureId, units: 1, note: "" })
      )
    ).toBe("not_an_investor");
  });

  it("is from anybody while the portal is shut", async () => {
    const ventureId = await aVenture("বন্ধ পোর্টালের ভেঞ্চার");
    const tania = await invited("তানিয়া");
    const owner = await asOwner();
    await owner.investors.setPortalOpen({ open: false });
    try {
      // Signed in again: a request reads the farm as it stands when it arrives.
      const shut = await signedInAs(tania.loginEmail);
      expect(
        await refusalOf(
          shut.portal.requestToJoin({ ventureId, units: 1, note: "" })
        )
      ).toBe("not_an_investor");
    } finally {
      await owner.investors.setPortalOpen({ open: true });
    }
  });
});
