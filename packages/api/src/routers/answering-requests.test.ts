import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitingInvestors, signedInAs } from "../test/portal-client";
import { appRouter } from "./index";

// The Owner answering a Request to Join: "come and sign" for the Units asked or fewer, never promising more than are
// left once the signed Agreements and the other yeses are counted; or "not this time", with a line if she likes. A yes
// to somebody new shows what signing them would make the Investor count, and never refuses. The Investor sees the
// answer, and never the count.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2054-01-01T04:00:00.000Z";
const AFTER_DECIDE_BY = "2054-01-21T04:00:00.000Z";

const asOwner = async (at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  return client;
};

const invited = invitingInvestors({ prefix: "019", run: suffix }, JANUARY);

/** A Venture of ten Units at fifty thousand each, shown in the portal. */
const aShownVenture = async (name: string) => {
  const owner = await asOwner();
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalBdt: 500_000,
    floorBdt: 300_000,
    decideBy: "2054-01-20",
    targetWindowStart: "2054-06-01",
    targetWindowEnd: "2054-06-10",
    unitPriceBdt: 50_000,
    units: 10,
    cattleBudgetBdt: 400_000,
  });
  await owner.ventures.showInPortal({ id: venture.id, words: "" });
  return venture.id;
};

/** An Investor invited and asking for Units on a Venture: them, and the Request's id. */
const asking = async (name: string, ventureId: string, units: number) => {
  const them = await invited(name);
  const { id } = await them.client.portal.requestToJoin({
    ventureId,
    units,
    note: "",
  });
  return { ...them, requestId: id };
};

/** An Agreement signed for an Investor, as the Owner records one. */
const signFor = async (
  ventureId: string,
  investorId: string,
  units: number
) => {
  const owner = await asOwner();
  await owner.ventures.sign({
    ventureId,
    investorId,
    units,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampKind: "paper",
    stampValueBdt: 300,
    stampedOn: "2054-01-02",
    stampSerial: `S-${investorId.slice(-8)}`,
  });
};

/** What saying yes to one Request would make the Investor count, as the Owner's list says it. */
const ifYesOf = (
  requests: readonly { id: string; ifYes: unknown }[],
  requestId: string
) =>
  requests.find((one) => one.id === requestId)?.ifYes as
    | { countAfter: number }
    | null
    | undefined;

/** What an act was refused with, as the screen reads it. */
const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    return (error as { data?: { refusal?: string } }).data?.refusal;
  }
  return "not refused";
};

const comeAndSign = (requestId: string, units: number, at = JANUARY) =>
  asOwner(at).then((owner) =>
    owner.ventures.answerRequest({
      requestId,
      answer: { kind: "come_and_sign", units },
    })
  );

const notThisTime = (requestId: string, line = "", at = JANUARY) =>
  asOwner(at).then((owner) =>
    owner.ventures.answerRequest({
      requestId,
      answer: { kind: "not_this_time", line },
    })
  );

beforeAll(async () => {
  const owner = await asOwner();
  await owner.investors.setPortalOpen({ open: true });
  await createTestClient(appRouter, { as: "manager" });
});

// First in the file, before any yes: the count a yes leads to takes in every other yes to somebody new on the farm, and
// this is where the count is said exactly.
describe("the Investor Cap at a yes", () => {
  it("shows what signing somebody new would make the count, the other yeses to new people counted in, and warns at the Cap without refusing — while signing still refuses", async () => {
    const ventureId = await aShownVenture("সীমানার ভেঞ্চার");
    const first = await asking("নতুন এক", ventureId, 1);
    const second = await asking("নতুন দুই", ventureId, 1);
    const owner = await asOwner();
    // Counted as the Investors page counts them, not as the preview does.
    const { standing } = await owner.investors.list();

    try {
      // The farm may have one more than stand today.
      await owner.farm.setParameters({
        investorCap: standing + 1,
        investorWarnAt: 1,
      });
      const reading = await asOwner();
      const before = await reading.ventures.requests({ ventureId });
      expect(ifYesOf(before.requests, first.requestId)).toEqual({
        countAfter: standing + 1,
        cap: standing + 1,
        atOrBeyondCap: true,
      });

      // A warning, never a refusal.
      const firstYes = await comeAndSign(first.requestId, 1);
      expect(firstYes.ifYes?.atOrBeyondCap).toBe(true);
      const rereading = await asOwner();
      const after = await rereading.ventures.requests({ ventureId });
      expect(ifYesOf(after.requests, second.requestId)).toEqual({
        countAfter: standing + 2,
        cap: standing + 1,
        atOrBeyondCap: true,
      });
      const secondYes = await comeAndSign(second.requestId, 1);
      expect(secondYes.ifYes?.countAfter).toBe(standing + 2);

      // Signing is what refuses, as it always has: the first fits under the Cap, the second does not.
      await signFor(ventureId, first.id, 1);
      expect(await refusalOf(signFor(ventureId, second.id, 1))).toBe(
        "investor_cap_reached"
      );
    } finally {
      // Back to as many as the farm may ever have, so the signings in the tests after this one are not refused.
      await owner.farm.setParameters({ investorCap: 50 });
    }
  });

  it("says nothing of the count for somebody already in a running Venture", async () => {
    const ventureId = await aShownVenture("পুরোনো মানুষের ভেঞ্চার");
    const other = await aShownVenture("আগের ভেঞ্চার");
    const rahim = await asking("রহিম", ventureId, 1);
    await signFor(other, rahim.id, 1);

    const answered = await comeAndSign(rahim.requestId, 1);

    expect(answered.ifYes).toBeNull();
  });
});

describe("the Owner saying come and sign", () => {
  it("promises the Units asked, and the Investor reads it on their page — and nothing about anybody else", async () => {
    const ventureId = await aShownVenture("হ্যাঁ ভেঞ্চার");
    const karim = await asking("করিম", ventureId, 4);

    await comeAndSign(karim.requestId, 4);

    // The whole answer, so a count or a figure of anybody else's that crept in would show up here.
    expect(await karim.client.portal.myRequests()).toEqual([
      {
        id: karim.requestId,
        ventureId,
        ventureName: `হ্যাঁ ভেঞ্চার ${suffix}`,
        units: 4,
        bdt: 200_000,
        note: null,
        state: "come_and_sign",
        answeredUnits: 4,
        answerLine: null,
        madeAt: new Date(JANUARY),
        changedAt: new Date(JANUARY),
      },
    ]);
  });

  it("may promise fewer Units than asked, and never more", async () => {
    const ventureId = await aShownVenture("কম হ্যাঁ ভেঞ্চার");
    const salma = await asking("সালমা", ventureId, 5);

    expect(await refusalOf(comeAndSign(salma.requestId, 6))).toBe(
      "units_beyond_asked"
    );
    await comeAndSign(salma.requestId, 3);

    const [hers] = await salma.client.portal.myRequests();
    expect([hers?.units, hers?.answeredUnits]).toEqual([5, 3]);
  });

  it("never promises more than are left once the signed Agreements and the other yeses are counted, and tells the Owner how many that is", async () => {
    const ventureId = await aShownVenture("সীমার ভেঞ্চার");
    const signed = await invited("স্বাক্ষরী");
    await signFor(ventureId, signed.id, 4);
    const first = await asking("প্রথম", ventureId, 4);
    const second = await asking("দ্বিতীয়", ventureId, 3);
    await comeAndSign(first.requestId, 4);

    const owner = await asOwner();
    const before = await owner.ventures.requests({ ventureId });
    expect(before.totals).toMatchObject({
      signedUnits: 4,
      promisedUnits: 4,
      promisedBdt: 200_000,
      promisableUnits: 2,
      waitingUnits: 3,
    });
    expect(await refusalOf(comeAndSign(second.requestId, 3))).toBe(
      "units_beyond_promisable"
    );
    expect(await refusalOf(comeAndSign(second.requestId, 2))).toBe(
      "not refused"
    );
  });

  it("frees the Units when the Investor withdraws after a yes, for another yes to take", async () => {
    const ventureId = await aShownVenture("ফেরত ইউনিটের ভেঞ্চার");
    const first = await asking("আগের", ventureId, 8);
    const second = await asking("পরের", ventureId, 5);
    await comeAndSign(first.requestId, 8);
    expect(await refusalOf(comeAndSign(second.requestId, 5))).toBe(
      "units_beyond_promisable"
    );

    await first.client.portal.withdrawRequest({ requestId: first.requestId });

    expect(await refusalOf(comeAndSign(second.requestId, 5))).toBe(
      "not refused"
    );
  });

  it("lets only one of two yeses racing for the last Units through", async () => {
    // Several rounds, each on a Venture of its own: one throw of a race proves nothing.
    const ROUNDS = 4;
    const promisedPerRound: number[] = [];
    /* oxlint-disable no-await-in-loop -- each round is its own race, run one after another */
    for (let round = 0; round < ROUNDS; round += 1) {
      const ventureId = await aShownVenture(`দৌড়ের ভেঞ্চার ${round}`);
      const one = await asking(`এক ${round}`, ventureId, 6);
      const two = await asking(`দুই ${round}`, ventureId, 6);
      await Promise.allSettled([
        comeAndSign(one.requestId, 6),
        comeAndSign(two.requestId, 6),
      ]);
      const owner = await asOwner();
      const { totals } = await owner.ventures.requests({ ventureId });
      promisedPerRound.push(totals.promisedUnits);
    }
    /* oxlint-enable no-await-in-loop */
    expect(promisedPerRound).toEqual([6, 6, 6, 6]);
  });

  it("is refused after the decide-by day, when the Floor question is already answered", async () => {
    const ventureId = await aShownVenture("দেরির হ্যাঁ ভেঞ্চার");
    const late = await asking("দেরি", ventureId, 2);

    expect(
      await refusalOf(comeAndSign(late.requestId, 2, AFTER_DECIDE_BY))
    ).toBe("venture_past_decide_by");
    expect(
      await refusalOf(notThisTime(late.requestId, "", AFTER_DECIDE_BY))
    ).toBe("not refused");
  });

  it("is refused on a Venture taken out of the portal, to somebody retired, and to somebody already signed on it", async () => {
    const hidden = await aShownVenture("সরানো হ্যাঁ ভেঞ্চার");
    const unseen = await asking("অদেখা", hidden, 1);
    const owner = await asOwner();
    await owner.ventures.takeOutOfPortal({ id: hidden });
    expect(await refusalOf(comeAndSign(unseen.requestId, 1))).toBe(
      "venture_not_shown"
    );

    const ventureId = await aShownVenture("অবসর ও স্বাক্ষর ভেঞ্চার");
    const retired = await asking("অবসরপ্রাপ্ত", ventureId, 1);
    await owner.investors.retire({ id: retired.id });
    expect(await refusalOf(comeAndSign(retired.requestId, 1))).toBe(
      "investor_retired"
    );

    const byPhone = await asking("ফোনে সই", ventureId, 2);
    await signFor(ventureId, byPhone.id, 2);
    expect(await refusalOf(comeAndSign(byPhone.requestId, 2))).toBe(
      "already_signed_on_venture"
    );
  });

  it("stops counting a promise once its Investor has signed, so the Units are not counted twice", async () => {
    const ventureId = await aShownVenture("একবার গোনার ভেঞ্চার");
    const promised = await asking("প্রতিশ্রুত", ventureId, 4);
    await comeAndSign(promised.requestId, 4);

    await signFor(ventureId, promised.id, 4);

    const owner = await asOwner();
    const { totals } = await owner.ventures.requests({ ventureId });
    expect(totals).toMatchObject({
      signedUnits: 4,
      promisedUnits: 0,
      promisableUnits: 6,
    });
  });

  it("leaves the Investor able to withdraw, but not to change the Units promised", async () => {
    const ventureId = await aShownVenture("স্থির হ্যাঁ ভেঞ্চার");
    const nasir = await asking("নাসির", ventureId, 3);
    await comeAndSign(nasir.requestId, 3);

    expect(
      await refusalOf(
        nasir.client.portal.requestToJoin({ ventureId, units: 5, note: "" })
      )
    ).toBe("request_already_answered");
    await nasir.client.portal.withdrawRequest({ requestId: nasir.requestId });
    const [his] = await nasir.client.portal.myRequests();
    expect(his?.state).toBe("withdrawn");
  });
});

describe("the Owner saying not this time", () => {
  it("takes a line to the Investor, who reads it — and cannot ask again on that Venture", async () => {
    const ventureId = await aShownVenture("না ভেঞ্চার");
    const jamal = await asking("জামাল", ventureId, 2);

    await notThisTime(jamal.requestId, "এবার ইউনিট শেষ, পরের বার");

    const [his] = await jamal.client.portal.myRequests();
    expect([his?.state, his?.answerLine, his?.answeredUnits]).toEqual([
      "not_this_time",
      "এবার ইউনিট শেষ, পরের বার",
      null,
    ]);
    expect(
      await refusalOf(
        jamal.client.portal.requestToJoin({ ventureId, units: 1, note: "" })
      )
    ).toBe("request_already_answered");
  });

  it("takes the Owner's Notice of the Request down, as a yes does", async () => {
    const ventureId = await aShownVenture("না নোটিশ ভেঞ্চার");
    const mitu = await asking("মিতু", ventureId, 1);

    await notThisTime(mitu.requestId);

    const owner = await asOwner();
    const told = await owner.alerts.mine({ about: ventureId });
    expect(told.filter((one) => one.kind === "join_requested")).toEqual([]);
  });
});

describe("an answer", () => {
  it("is in the trail as the Owner's act, and takes the Owner's Notice of the Request down", async () => {
    const ventureId = await aShownVenture("খাতার উত্তরের ভেঞ্চার");
    const rina = await asking("রিনা", ventureId, 2);
    const owner = await asOwner();
    const toldBefore = await owner.alerts.mine({ about: ventureId });
    expect(
      toldBefore.filter((one) => one.kind === "join_requested")
    ).toHaveLength(1);

    await comeAndSign(rina.requestId, 2);

    const trail = await owner.audit.list({
      entity: "request_to_join",
      entityId: rina.requestId,
    });
    const [latest] = trail;
    expect(latest?.action).toBe("update");
    expect(latest?.roleUsed).toBe("owner");
    expect(latest?.after).toMatchObject({
      state: "come_and_sign",
      answeredUnits: 2,
    });
    const toldAfter = await owner.alerts.mine({ about: ventureId });
    expect(toldAfter.filter((one) => one.kind === "join_requested")).toEqual(
      []
    );
  });

  it("is given once: a Request already answered, or withdrawn, is not answered again", async () => {
    const ventureId = await aShownVenture("একবারের ভেঞ্চার");
    const answered = await asking("উত্তর পাওয়া", ventureId, 1);
    const gone = await asking("চলে যাওয়া", ventureId, 1);
    await comeAndSign(answered.requestId, 1);
    await gone.client.portal.withdrawRequest({ requestId: gone.requestId });

    expect(await refusalOf(notThisTime(answered.requestId))).toBe(
      "request_already_answered"
    );
    expect(await refusalOf(comeAndSign(gone.requestId, 1))).toBe(
      "request_not_live"
    );
  });

  it("is refused on a Venture no longer gathering capital", async () => {
    const ventureId = await aShownVenture("বাতিলের উত্তর ভেঞ্চার");
    const lipi = await asking("লিপি", ventureId, 1);
    const owner = await asOwner();
    await owner.ventures.cancel({ id: ventureId, reason: "টাকা ওঠেনি" });

    expect(await refusalOf(comeAndSign(lipi.requestId, 1))).toBe(
      "venture_wrong_state"
    );
  });

  it("is the Owner's alone: the Manager cannot give one, and an Investor cannot answer their own", async () => {
    const ventureId = await aShownVenture("মালিকের উত্তরের ভেঞ্চার");
    const babul = await asking("বাবুল", ventureId, 1);
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(JANUARY),
    });

    await expect(
      manager.ventures.answerRequest({
        requestId: babul.requestId,
        answer: { kind: "come_and_sign", units: 1 },
      })
    ).rejects.toThrow();
    await expect(
      babul.client.ventures.answerRequest({
        requestId: babul.requestId,
        answer: { kind: "come_and_sign", units: 1 },
      })
    ).rejects.toThrow();
    const again = await signedInAs(babul.loginEmail, JANUARY);
    const [still] = await again.portal.myRequests();
    expect(still?.state).toBe("waiting");
  });
});
