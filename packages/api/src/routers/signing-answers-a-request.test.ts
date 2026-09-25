import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitingInvestors } from "../test/portal-client";
import { appRouter } from "./index";

// Signing answers its Request: the Owner records the stamped Agreement and names the Request it answers, which then
// reads signed. The paper's Units are the Agreement's, whatever the yes said, and an Agreement still needs no Request
// at all for somebody who joined by phone.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2056-01-01T04:00:00.000Z";

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(JANUARY),
  });
  return client;
};

const invited = invitingInvestors({ prefix: "016", run: suffix }, JANUARY);

/** A Venture of ten Units at fifty thousand each, shown in the portal. */
const aShownVenture = async (name: string) => {
  const owner = await asOwner();
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalBdt: 500_000,
    floorBdt: 300_000,
    decideBy: "2056-01-20",
    targetWindowStart: "2056-06-01",
    targetWindowEnd: "2056-06-10",
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

const comeAndSign = async (requestId: string, units: number) => {
  const owner = await asOwner();
  await owner.ventures.answerRequest({
    requestId,
    answer: { kind: "come_and_sign", units },
  });
};

/** The Owner records the stamped Agreement, naming the Request it answers or none. */
const sign = async (
  ventureId: string,
  investorId: string,
  units: number,
  requestId?: string
) => {
  const owner = await asOwner();
  return owner.ventures.sign({
    ventureId,
    investorId,
    units,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampKind: "paper",
    stampValueBdt: 300,
    stampedOn: "2056-01-02",
    stampSerial: `S-${investorId.slice(-8)}`,
    ...(requestId === undefined ? {} : { requestId }),
  });
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

/** One Request as the Owner's list reads it. */
const theRequest = async (ventureId: string, requestId: string) => {
  const owner = await asOwner();
  const { requests } = await owner.ventures.requests({ ventureId });
  return requests.find((one) => one.id === requestId);
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.investors.setPortalOpen({ open: true });
});

describe("signing from a yes", () => {
  it("reads signed, and the Agreement holds the paper's Units — fewer than the yes", async () => {
    const ventureId = await aShownVenture("কম ইউনিটের ভেঞ্চার");
    const karim = await asking("করিম", ventureId, 4);
    await comeAndSign(karim.requestId, 4);

    const { id } = await sign(ventureId, karim.id, 3, karim.requestId);

    expect(await theRequest(ventureId, karim.requestId)).toMatchObject({
      state: "signed",
      answeredUnits: 4,
    });
    const owner = await asOwner();
    const [agreement] = await owner.ventures.agreements({ ventureId });
    expect(agreement).toMatchObject({
      id,
      units: 3,
      requestId: karim.requestId,
    });
  });

  it("holds the paper's Units when they are more than the yes", async () => {
    const ventureId = await aShownVenture("বেশি ইউনিটের ভেঞ্চার");
    const rahim = await asking("রহিম", ventureId, 2);
    await comeAndSign(rahim.requestId, 2);

    await sign(ventureId, rahim.id, 5, rahim.requestId);

    const owner = await asOwner();
    const [agreement] = await owner.ventures.agreements({ ventureId });
    expect(agreement?.units).toBe(5);
    expect(await theRequest(ventureId, rahim.requestId)).toMatchObject({
      state: "signed",
    });
  });

  it("counts its Units as signed and no longer as promised in the Owner's totals", async () => {
    const ventureId = await aShownVenture("মোট হিসাবের ভেঞ্চার");
    const karim = await asking("করিম মোট", ventureId, 4);
    const salma = await asking("সালমা মোট", ventureId, 2);
    await comeAndSign(karim.requestId, 4);
    await comeAndSign(salma.requestId, 2);

    await sign(ventureId, karim.id, 3, karim.requestId);

    const owner = await asOwner();
    const { totals } = await owner.ventures.requests({ ventureId });
    expect(totals).toMatchObject({
      signedUnits: 3,
      promisedUnits: 2,
      promisableUnits: 5,
    });
  });

  it("is kept in the trail as the Owner's act, from come and sign to signed", async () => {
    const ventureId = await aShownVenture("খাতার ভেঞ্চার");
    const karim = await asking("করিম খাতা", ventureId, 4);
    await comeAndSign(karim.requestId, 4);

    await sign(ventureId, karim.id, 4, karim.requestId);

    const events = await scratchDb().query.auditEvent.findMany({
      where: { entity: "request_to_join", entityId: karim.requestId },
      orderBy: { receivedAt: "asc", id: "asc" },
    });
    expect(events.at(-1)).toMatchObject({
      action: "update",
      roleUsed: "owner",
      before: expect.objectContaining({ state: "come_and_sign" }),
      after: expect.objectContaining({ state: "signed" }),
    });
  });
});

describe("signing from a Request nobody answered", () => {
  it("reads signed, and the Owner's Notice of it goes from her list", async () => {
    const ventureId = await aShownVenture("উত্তর ছাড়া ভেঞ্চার");
    const karim = await asking("করিম অপেক্ষা", ventureId, 3);
    const told = async () => {
      const owner = await asOwner();
      const alerts = await owner.alerts.mine({ about: ventureId });
      return alerts.filter((one) => one.kind === "join_requested");
    };
    expect(await told()).toHaveLength(1);

    await sign(ventureId, karim.id, 3, karim.requestId);

    expect(await theRequest(ventureId, karim.requestId)).toMatchObject({
      state: "signed",
    });
    expect(await told()).toEqual([]);
  });
});

describe("a Request that is not this signing's to answer", () => {
  it("is refused when it is somebody else's", async () => {
    const ventureId = await aShownVenture("অন্যের ভেঞ্চার");
    const karim = await asking("করিম অন্য", ventureId, 2);
    const rahim = await asking("রহিম অন্য", ventureId, 2);

    expect(await refusalOf(sign(ventureId, rahim.id, 2, karim.requestId))).toBe(
      "request_not_theirs"
    );
    const owner = await asOwner();
    expect(await owner.ventures.agreements({ ventureId })).toEqual([]);
  });

  it("is refused when it is on another Venture", async () => {
    const ventureId = await aShownVenture("এই ভেঞ্চার");
    const other = await aShownVenture("ওই ভেঞ্চার");
    const karim = await asking("করিম ওই", other, 2);

    expect(await refusalOf(sign(ventureId, karim.id, 2, karim.requestId))).toBe(
      "request_not_theirs"
    );
  });

  it("is refused when it is no longer live: withdrawn, or told not this time", async () => {
    const ventureId = await aShownVenture("বন্ধ অনুরোধের ভেঞ্চার");
    const karim = await asking("করিম ফেরত", ventureId, 2);
    await karim.client.portal.withdrawRequest({ requestId: karim.requestId });
    const rahim = await asking("রহিম না", ventureId, 2);
    const owner = await asOwner();
    await owner.ventures.answerRequest({
      requestId: rahim.requestId,
      answer: { kind: "not_this_time", line: "" },
    });

    expect(await refusalOf(sign(ventureId, karim.id, 2, karim.requestId))).toBe(
      "request_not_live"
    );
    expect(await refusalOf(sign(ventureId, rahim.id, 2, rahim.requestId))).toBe(
      "request_not_live"
    );
    expect(await theRequest(ventureId, karim.requestId)).toMatchObject({
      state: "withdrawn",
    });
  });

  it("is no such Request when it does not exist", async () => {
    const ventureId = await aShownVenture("নেই অনুরোধের ভেঞ্চার");
    const karim = await invited("করিম নেই");

    expect(
      await refusalOf(sign(ventureId, karim.id, 2, "no-such-request"))
    ).toBe("no_such_request");
  });
});

describe("signing with no Request", () => {
  it("records the Agreement as it always has, and leaves a yes standing untouched", async () => {
    const ventureId = await aShownVenture("ফোনের ভেঞ্চার");
    const karim = await asking("করিম ফোন", ventureId, 4);
    await comeAndSign(karim.requestId, 4);

    await sign(ventureId, karim.id, 4);

    const owner = await asOwner();
    const [agreement] = await owner.ventures.agreements({ ventureId });
    expect(agreement).toMatchObject({ units: 4, requestId: null });
    expect(await theRequest(ventureId, karim.requestId)).toMatchObject({
      state: "come_and_sign",
    });
  });
});

describe("the Investor's own page", () => {
  it("shows the Request as signed and leads to their Agreement", async () => {
    const ventureId = await aShownVenture("পাতার ভেঞ্চার");
    const karim = await asking("করিম পাতা", ventureId, 4);
    await comeAndSign(karim.requestId, 4);

    const { id } = await sign(ventureId, karim.id, 4, karim.requestId);

    const mine = await karim.client.portal.myRequests();
    expect(mine).toEqual([
      expect.objectContaining({
        id: karim.requestId,
        state: "signed",
        agreementId: id,
      }),
    ]);
    const theirs = await karim.client.portal.venture({ agreementId: id });
    expect(theirs).toBeTruthy();
  });

  it("leads nowhere from a Request that was not signed", async () => {
    const ventureId = await aShownVenture("সই ছাড়া পাতার ভেঞ্চার");
    const karim = await asking("করিম সই ছাড়া", ventureId, 4);

    const mine = await karim.client.portal.myRequests();
    expect(mine).toEqual([
      expect.objectContaining({ state: "waiting", agreementId: null }),
    ]);
  });
});
