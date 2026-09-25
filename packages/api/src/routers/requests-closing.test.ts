import { FakeClock, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitingInvestors } from "../test/portal-client";
import { appRouter } from "./index";

// Requests to Join never sit open on a Venture that has stopped gathering capital. Buying starting or the Venture being
// called off closes every live one; taking it out of the portal closes those nobody answered and leaves the yeses;
// retiring an Investor closes theirs. Each says why, each is in the trail, and nothing is deleted.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2055-01-01T04:00:00.000Z";

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(JANUARY),
  });
  return client;
};

const invited = invitingInvestors({ prefix: "016", run: suffix }, JANUARY);

/** A Venture of ten Units, shown in the portal, whose Floor one signed Unit meets. */
const aShownVenture = async (name: string) => {
  const owner = await asOwner();
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalBdt: 500_000,
    floorBdt: 50_000,
    decideBy: "2055-01-20",
    targetWindowStart: "2055-06-01",
    targetWindowEnd: "2055-06-10",
    unitPriceBdt: 50_000,
    units: 10,
    cattleBudgetBdt: 400_000,
  });
  await owner.ventures.showInPortal({ id: venture.id, words: "" });
  return venture.id;
};

/** One Investor asking for Units: them, and their Request's id. */
const asking = async (name: string, ventureId: string, units: number) => {
  const them = await invited(name);
  const { id } = await them.client.portal.requestToJoin({
    ventureId,
    units,
    note: "",
  });
  return { ...them, requestId: id };
};

/** One Investor asking and told to come and sign. */
const toldYes = async (name: string, ventureId: string, units: number) => {
  const them = await asking(name, ventureId, units);
  const owner = await asOwner();
  await owner.ventures.answerRequest({
    requestId: them.requestId,
    answer: { kind: "come_and_sign", units },
  });
  return them;
};

/** A Venture's Floor met: somebody signed for a Unit, their paper kept and their capital in. */
const meetTheFloor = async (ventureId: string) => {
  const owner = await asOwner();
  const signer = await owner.investors.record({
    name: `স্বাক্ষরী ${ventureId.slice(-6)} ${suffix}`,
    phone: `0133${ventureId.slice(-7).replaceAll(/\D/gu, "7").padStart(7, "7")}`,
  });
  const agreement = await owner.ventures.sign({
    ventureId,
    investorId: signer.id,
    units: 1,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampKind: "paper",
    stampValueBdt: 300,
    stampedOn: "2055-01-02",
    stampSerial: `S-${ventureId.slice(-8)}`,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: 50_000,
    movedOn: "2055-01-03",
    paymentMethod: "bank",
    reference: `TRF-${ventureId.slice(-8)}`,
  });
};

/** Where each Request on a Venture stands, and why the farm closed it, as the Owner reads them. */
const standings = async (ventureId: string) => {
  const owner = await asOwner();
  const { requests } = await owner.ventures.requests({ ventureId });
  return new Map(
    requests.map((one) => [one.id, [one.state, one.closedBecause]] as const)
  );
};

/**
 * What the farm did about one closed Request: the reason its last Audit Event recorded, and whose act that was; and
 * whether the Owner still has a Notice of it.
 */
const closedTrace = async (ventureId: string, requestId: string) => {
  const owner = await asOwner();
  const [latest] = await owner.audit.list({
    entity: "request_to_join",
    entityId: requestId,
  });
  const told = await owner.alerts.mine({ about: ventureId });
  return {
    because: (latest?.after as { closedBecause?: string } | null)
      ?.closedBecause,
    by: latest?.actorId,
    stillTold: told.some(
      (one) =>
        one.kind === "join_requested" &&
        (one.params as { requestId?: string }).requestId === requestId
    ),
  };
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.investors.setPortalOpen({ open: true });
});

describe("a Venture that starts buying", () => {
  it("closes every live Request on it, answered or not, saying why — and takes the Owner's Notices down", async () => {
    const ventureId = await aShownVenture("কেনার ভেঞ্চার");
    const waiting = await asking("অপেক্ষমাণ", ventureId, 2);
    const promised = await toldYes("প্রতিশ্রুত", ventureId, 3);
    await meetTheFloor(ventureId);
    const owner = await asOwner();

    await owner.ventures.startBuying({ id: ventureId });

    const now = await standings(ventureId);
    expect(now.get(waiting.requestId)).toEqual(["closed", "venture_buying"]);
    expect(now.get(promised.requestId)).toEqual(["closed", "venture_buying"]);
    const told = await owner.alerts.mine({ about: ventureId });
    expect(told.filter((one) => one.kind === "join_requested")).toEqual([]);
  });

  it("tells the Investor their Request closed, and why, on their own page", async () => {
    const ventureId = await aShownVenture("কেনার খবর ভেঞ্চার");
    const karim = await toldYes("করিম", ventureId, 2);
    await meetTheFloor(ventureId);
    const owner = await asOwner();

    await owner.ventures.startBuying({ id: ventureId });

    const [his] = await karim.client.portal.myRequests();
    expect([his?.state, his?.closedBecause, his?.answeredUnits]).toEqual([
      "closed",
      "venture_buying",
      2,
    ]);
  });

  it("writes each close in the trail, with the Request as it closed", async () => {
    const ventureId = await aShownVenture("খাতার বন্ধ ভেঞ্চার");
    const lipi = await asking("লিপি", ventureId, 1);
    await meetTheFloor(ventureId);
    const owner = await asOwner();

    await owner.ventures.startBuying({ id: ventureId });

    const trail = await owner.audit.list({
      entity: "request_to_join",
      entityId: lipi.requestId,
    });
    expect(trail[0]?.after).toMatchObject({
      state: "closed",
      closedBecause: "venture_buying",
    });
  });
});

describe("a Request made while the Venture starts buying", () => {
  it("is refused or closed, never left waiting on a Venture no longer gathering capital", async () => {
    // Several rounds, each on a Venture of its own: one throw of a race proves nothing.
    const ROUNDS = 4;
    const leftWaiting: string[][] = [];
    /* oxlint-disable no-await-in-loop -- each round is its own race, run one after another */
    for (let round = 0; round < ROUNDS; round += 1) {
      const ventureId = await aShownVenture(`দৌড়ের কেনা ${round}`);
      await meetTheFloor(ventureId);
      const late = await invited(`দেরিতে ${round}`);
      const owner = await asOwner();
      await Promise.allSettled([
        late.client.portal.requestToJoin({ ventureId, units: 1, note: "" }),
        owner.ventures.startBuying({ id: ventureId }),
      ]);
      const now = await standings(ventureId);
      leftWaiting.push(
        [...now.values()]
          .map(([state]) => state)
          .filter((state) => state === "waiting" || state === "come_and_sign")
      );
    }
    /* oxlint-enable no-await-in-loop */
    expect(leftWaiting).toEqual([[], [], [], []]);
  });
});

describe("a Venture called off", () => {
  it("closes every live Request on it, answered or not", async () => {
    const ventureId = await aShownVenture("বাতিলের ভেঞ্চার");
    const waiting = await asking("বাতিল অপেক্ষা", ventureId, 1);
    const promised = await toldYes("বাতিল হ্যাঁ", ventureId, 1);
    const owner = await asOwner();

    await owner.ventures.cancel({ id: ventureId, reason: "টাকা ওঠেনি" });

    const now = await standings(ventureId);
    expect(now.get(waiting.requestId)).toEqual(["closed", "venture_cancelled"]);
    expect(now.get(promised.requestId)).toEqual([
      "closed",
      "venture_cancelled",
    ]);
    expect(await closedTrace(ventureId, waiting.requestId)).toEqual({
      because: "venture_cancelled",
      by: thePerson("owner").id,
      stillTold: false,
    });
  });
});

describe("a Venture taken out of the portal", () => {
  it("closes the Requests nobody answered and leaves the yeses standing, still on the Investor's page", async () => {
    const ventureId = await aShownVenture("সরানোর ভেঞ্চার");
    const waiting = await asking("সরানো অপেক্ষা", ventureId, 1);
    const promised = await toldYes("সরানো হ্যাঁ", ventureId, 2);
    const owner = await asOwner();

    await owner.ventures.takeOutOfPortal({ id: ventureId });

    const now = await standings(ventureId);
    expect(now.get(waiting.requestId)).toEqual([
      "closed",
      "taken_out_of_portal",
    ]);
    expect(now.get(promised.requestId)).toEqual(["come_and_sign", null]);
    const [theirs] = await promised.client.portal.myRequests();
    expect([theirs?.state, theirs?.answeredUnits]).toEqual([
      "come_and_sign",
      2,
    ]);
    const offered = await promised.client.portal.openVentures();
    expect(offered.map((one) => one.id)).not.toContain(ventureId);
    expect(await closedTrace(ventureId, waiting.requestId)).toEqual({
      because: "taken_out_of_portal",
      by: thePerson("owner").id,
      stillTold: false,
    });
  });
});

describe("an Investor", () => {
  it("retired, has their live Requests closed on every Venture", async () => {
    const first = await aShownVenture("অবসর এক");
    const second = await aShownVenture("অবসর দুই");
    const rahat = await invited("রাহাত");
    const one = await rahat.client.portal.requestToJoin({
      ventureId: first,
      units: 1,
      note: "",
    });
    const two = await rahat.client.portal.requestToJoin({
      ventureId: second,
      units: 1,
      note: "",
    });
    const owner = await asOwner();
    await owner.ventures.answerRequest({
      requestId: two.id,
      answer: { kind: "come_and_sign", units: 1 },
    });

    await owner.investors.retire({ id: rahat.id });

    const onFirst = await standings(first);
    const onSecond = await standings(second);
    expect(onFirst.get(one.id)).toEqual(["closed", "investor_retired"]);
    expect(await closedTrace(first, one.id)).toEqual({
      because: "investor_retired",
      by: thePerson("owner").id,
      stillTold: false,
    });
    expect(onSecond.get(two.id)).toEqual(["closed", "investor_retired"]);
  });

  it("whose portal access is taken away keeps their Requests: the Owner may still sign them by phone", async () => {
    const ventureId = await aShownVenture("দরজা বন্ধের ভেঞ্চার");
    const shanto = await asking("শান্ত", ventureId, 1);
    const owner = await asOwner();

    await owner.investors.takePortalAway({ id: shanto.id });

    const still = await standings(ventureId);
    expect(still.get(shanto.requestId)).toEqual(["waiting", null]);
  });
});
