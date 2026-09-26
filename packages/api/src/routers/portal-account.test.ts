import { session as sessionTable } from "@OpenFarm/db/schema/auth";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { beforeAll, describe, expect, it } from "vitest";

import { buildContext } from "../context";
import { createTestClient } from "../test/client";
import { nominationOnFile, theWhole } from "../test/nominations";
import { invitedWithConsent } from "../test/portal-client";
import { appRouter } from "./index";

// An Investor's own account in the portal (ADR 0007): their record as the farm holds it, with the numbers somebody
// could read over their shoulder hidden; their whole part in the Ventures and every taka of theirs; where they are
// signed in; a sign-in that lasts a working day; and, on the Owner's side, what they did there.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2054-01-01T04:00:00.000Z";
const HOUR = 60 * 60 * 1000;
const PASSWORD = "gorur-khamar-2026";
const NID = "1985220788993";
const BANK = `Rahim Uddin\n0123-4567-${suffix.slice(-4)}\nSonali Bank, Savar`;
const at = (hours: number) => new Date(Date.parse(JANUARY) + hours * HOUR);
const clockAt = (when: Date | string) =>
  new FakeClock(new Date(when).toISOString());

const asOwner = async (when: Date | string = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: clockAt(when),
  });
  return client;
};

let loginEmail = "";
let rahimId = "";
let hisAgreement = "";
let hersAgreement = "";

/** The Investor signed in on a session begun at `since`, reading at `when`. */
const rahimAt = async (since: Date, when: Date = since) => {
  const db = scratchDb();
  const person = await db.query.user.findFirst({
    where: { email: loginEmail },
  });
  if (!person) {
    throw new Error("expected the Investor's account");
  }
  const id = `account-session-${person.id}-${since.getTime()}`;
  await db
    .insert(sessionTable)
    .values({
      id,
      token: `account-token-${person.id}-${since.getTime()}`,
      userId: person.id,
      expiresAt: new Date(since.getTime() + 7 * 24 * HOUR),
      createdAt: since,
      updatedAt: since,
      userAgent:
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36",
    })
    .onConflictDoNothing();
  const session = await db.query.session.findFirst({ where: { id } });
  if (!session) {
    throw new Error("expected the session");
  }
  const context = await buildContext({
    session: { user: person, session },
    device: null,
    deviceStatus: "none",
    callerAddress: null,
    clock: clockAt(when),
    db,
    farmId: theFarm().id,
  });
  return { client: createRouterClient(appRouter, { context }), sessionId: id };
};

const signAndPay = async (
  ventureId: string,
  name: string,
  phone: string,
  units: number,
  record: { nid?: string; bankAccount?: string } = {}
) => {
  const owner = await asOwner();
  const person = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone,
    address: "সাভার",
    ...record,
  });
  await nominationOnFile({
    investorId: person.id,
    nominees: [
      {
        ...theWhole("রোকেয়া"),
        bornOn: "2040-01-01",
        sharePercent: 60,
        receiver: { name: "রহিম", relation: "বাবা", phone: null },
      },
      { ...theWhole("করিম", "ভাই"), bornOn: "1980-01-01", sharePercent: 40 },
    ],
    signedOn: "2054-01-01",
    recordedAt: new Date(JANUARY),
  });
  const signed = await owner.ventures.sign({
    ventureId,
    investorId: person.id,
    units,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampKind: "paper",
    stampValueBdt: 300,
    stampedOn: "2054-01-02",
    stampSerial: `S-${phone}`,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: signed.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId: signed.id,
    amountBdt: units * 50_000,
    movedOn: "2054-01-03",
    paymentMethod: "bank",
    reference: `TRF-${phone}`,
  });
  return { investorId: person.id, agreementId: signed.id };
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000097",
    registrationNumber: `DLS/SAV/2054/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2056-03-31",
  });
  const venture = await owner.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2054-01-20",
    targetWindowStart: "2054-03-17",
    targetWindowEnd: "2054-03-19",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 800_000,
  });
  const his = await signAndPay(venture.id, "রহিম", `0176${suffix}`, 3, {
    nid: NID,
    bankAccount: BANK,
  });
  rahimId = his.investorId;
  hisAgreement = his.agreementId;
  const hers = await signAndPay(venture.id, "সালমা", `0177${suffix}`, 5);
  hersAgreement = hers.agreementId;
  await owner.investors.setPortalOpen({ open: true });
  const { code } = await invitedWithConsent(owner, rahimId);
  const { client: nobody } = await createTestClient(appRouter, {
    as: null,
    clock: clockAt(JANUARY),
  });
  ({ loginEmail } = await nobody.portal.join({
    phone: `0176${suffix}`,
    code,
    password: PASSWORD,
  }));
});

describe("an Investor's own record", () => {
  it("is shown back with all but the last digits of the NID and the bank account hidden, and the farm to call", async () => {
    const { client } = await rahimAt(at(1));

    const me = await client.portal.me();

    expect(me.record.nid).toBe("•••••••••8993");
    expect(me.record.bankAccount).toBe(
      `Rahim Uddin\n••••-••••-${suffix.slice(-4)}\nSonali Bank, Savar`
    );
    expect(JSON.stringify(me)).not.toContain(NID);
    // Their Nominees in force, each with the share they collect, and a minor on today's date with who collects for her.
    expect(me.record.nominees).toMatchObject([
      {
        name: "রোকেয়া",
        sharePercent: 60,
        minor: true,
        receiver: { name: "রহিম" },
      },
      { name: "করিম", sharePercent: 40, minor: false, receiver: null },
    ]);
    expect(me.farm).toMatchObject({
      phone: "+8801711000097",
      address: `সাভার, ঢাকা ${suffix}`,
    });
  });
});

describe("an Investor's portfolio", () => {
  it("is their Agreement and every taka of theirs, and nothing of anybody else's", async () => {
    const { client } = await rahimAt(at(1));

    const theirs = await client.portal.portfolio();

    expect(theirs.agreements).toEqual([
      expect.objectContaining({
        id: hisAgreement,
        units: 3,
        capitalHeldBdt: 150_000,
      }),
    ]);
    expect(
      theirs.movements.map((one) => [one.kind, one.amountBdt, one.reference])
    ).toEqual([["capital_in", 150_000, `TRF-0176${suffix}`]]);
    expect(JSON.stringify(theirs)).not.toContain(hersAgreement);
  });
});

describe("a sign-in to the portal", () => {
  it("says which one they are reading on", async () => {
    const { client, sessionId } = await rahimAt(at(2));

    const places = await client.portal.signedInOn();

    expect(places.find((one) => one.id === sessionId)).toMatchObject({
      here: true,
    });
  });

  it("lasts a working day, and is ended rather than read on after it", async () => {
    const since = at(3);
    const { client: stillIn } = await rahimAt(since, at(3 + 11));
    await expect(stillIn.portal.me()).resolves.toMatchObject({
      investorId: rahimId,
    });

    const { client: tooLong, sessionId } = await rahimAt(since, at(3 + 13));
    await expect(tooLong.portal.me()).rejects.toMatchObject({
      data: { refusal: "signed_in_too_long" },
    });
    const ended = await scratchDb().query.session.findFirst({
      where: { id: sessionId },
    });
    expect(ended?.expiresAt).toEqual(at(3 + 13));
  });
});

describe("the Owner's view of what an Investor did in the portal", () => {
  it("names the papers they read, when they were last in and where they are signed in — not the Owner's own prints", async () => {
    const { client } = await rahimAt(at(20));
    await client.portal.paper({ agreementId: hisAgreement, kind: "joining" });
    const owner = await asOwner(at(21));
    await owner.investorStatements.joining({ agreementId: hisAgreement });

    const activity = await owner.investors.portalActivity({ id: rahimId });

    expect(activity?.read).toEqual([
      expect.objectContaining({
        agreementId: hisAgreement,
        paper: "joining_letter",
      }),
    ]);
    expect(activity?.lastSeenAt).toEqual(at(20));
    expect(activity?.acceptedAt).toBeTruthy();
    expect(activity?.signedInOn.length).toBeGreaterThan(0);
  });

  it("is the Owner's alone", async () => {
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: clockAt(at(21)),
    });

    await expect(
      manager.investors.portalActivity({ id: rahimId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
