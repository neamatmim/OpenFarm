import { session as sessionTable } from "@OpenFarm/db/schema/auth";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { beforeAll, describe, expect, it } from "vitest";

import { buildContext } from "../context";
import { createTestClient } from "../test/client";
import { invitedWithConsent } from "../test/portal-client";
import { appRouter } from "./index";

// What an Investor reads in the portal (ADR 0007): their own Ventures, how they are doing today, and their own
// papers — each asked for by an Agreement that has to be theirs, so another man's never comes back.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2052-01-01T04:00:00.000Z";
const clock = () => new FakeClock(JANUARY);
const PASSWORD = "gorur-khamar-2026";

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: clock(),
  });
  return client;
};

type Client = Awaited<ReturnType<typeof asOwner>>;

/** A client signed in as the account an invitation opened. */
const signedInAs = async (loginEmail: string): Promise<Client> => {
  const db = scratchDb();
  const person = await db.query.user.findFirst({
    where: { email: loginEmail },
  });
  if (!person) {
    throw new Error("expected the Investor's account");
  }
  const at = clock().now();
  await db
    .insert(sessionTable)
    .values({
      id: `reading-session-${person.id}`,
      token: `reading-token-${person.id}`,
      userId: person.id,
      expiresAt: new Date(at.getTime() + 24 * 60 * 60 * 1000),
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoNothing();
  const session = await db.query.session.findFirst({
    where: { id: `reading-session-${person.id}` },
  });
  if (!session) {
    throw new Error("expected the session");
  }
  const context = await buildContext({
    session: { user: person, session },
    device: null,
    deviceStatus: "none",
    callerAddress: null,
    clock: clock(),
    db,
    farmId: theFarm().id,
  });
  return createRouterClient(appRouter, { context });
};

let ventureId = "";
const agreementOf: Record<string, string> = {};
let rahim: Client;
let rahimsUser = "";

/** One Investor, signed for the Venture on stamp paper and paid in by bank. */
const signAndPay = async (name: string, phone: string, units: number) => {
  const owner = await asOwner();
  const him = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: `01234${phone.slice(-5)}`,
  });
  const signed = await owner.ventures.sign({
    ventureId,
    investorId: him.id,
    units,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampKind: "paper",
    stampValueBdt: 300,
    stampedOn: "2052-01-02",
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
    movedOn: "2052-01-03",
    paymentMethod: "bank",
    reference: `TRF-${phone}`,
  });
  agreementOf[name] = signed.id;
  return him.id;
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000096",
    registrationNumber: `DLS/SAV/2052/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2054-03-31",
  });
  const venture = await owner.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2052-01-20",
    targetWindowStart: "2052-03-17",
    targetWindowEnd: "2052-03-19",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 800_000,
  });
  ventureId = venture.id;
  const rahimId = await signAndPay("রহিম", `0172${suffix}`, 3);
  await signAndPay("সালমা", `0173${suffix}`, 5);
  await owner.investors.setPortalOpen({ open: true });
  const { code } = await invitedWithConsent(owner, rahimId);
  const { client: nobody } = await createTestClient(appRouter, {
    as: null,
    clock: clock(),
  });
  const { loginEmail } = await nobody.portal.join({
    phone: `0172${suffix}`,
    code,
    password: PASSWORD,
  });
  rahim = await signedInAs(loginEmail);
  const account = await scratchDb().query.user.findFirst({
    where: { email: loginEmail },
  });
  rahimsUser = account?.id ?? "";
});

describe("an Investor's Ventures", () => {
  it("are theirs alone: the Venture they are in, their Units and the capital the Farm holds of theirs", async () => {
    const { agreements } = await rahim.portal.portfolio();

    expect(agreements).toEqual([
      expect.objectContaining({
        id: agreementOf["রহিম"],
        units: 3,
        capitalHeldBdt: 150_000,
        investorsPercent: 60,
      }),
    ]);
  });

  it("read today: their share, the days to the window, and where the money has gone, nobody else's name", async () => {
    const today = await rahim.portal.venture({
      agreementId: agreementOf["রহিম"] ?? "",
    });

    expect(today.his).toMatchObject({ units: 3, capitalBdt: 150_000 });
    // Three of the eight Units signed, as a whole percent.
    expect(today.his.sharePercent).toBe(38);
    expect(today.window.daysTo).toBeGreaterThan(0);
    expect(JSON.stringify(today)).not.toContain("সালমা");
  });
});

describe("another Investor's Agreement", () => {
  it("is no such agreement, for the Venture, for any paper", async () => {
    const hers = agreementOf["সালমা"] ?? "";

    await expect(
      rahim.portal.venture({ agreementId: hers })
    ).rejects.toMatchObject({ data: { refusal: "no_such_agreement" } });
    for (const kind of ["joining", "progress", "settlement"] as const) {
      // Sequential: each refusal is its own question.
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        rahim.portal.paper({ agreementId: hers, kind })
      ).rejects.toMatchObject({ data: { refusal: "no_such_agreement" } });
    }
  });
});

describe("an Investor's papers", () => {
  it("are the Farm's papers, signed for by the Owner, and the trail says the Investor read them", async () => {
    const { text } = await rahim.portal.paper({
      agreementId: agreementOf["রহিম"] ?? "",
      kind: "joining",
    });
    const { text: progress } = await rahim.portal.paper({
      agreementId: agreementOf["রহিম"] ?? "",
      kind: "progress",
    });

    expect(text).toContain(`রহিম ${suffix}`);
    expect(text).toContain("মুনাফা ভাগ হবে বিনিয়োগকারী ৬০% এবং খামার ৪০%");
    expect(text).not.toContain("সালমা");
    expect(progress).toContain(`ভেঞ্চার ${suffix}`);
    const read = await scratchDb().query.auditEvent.findMany({
      where: {
        entity: "investment_agreement",
        entityId: agreementOf["রহিম"],
        action: "export",
        actorId: rahimsUser,
      },
      columns: { roleUsed: true },
    });
    expect(read.length).toBeGreaterThanOrEqual(2);
    expect(read.every((one) => one.roleUsed === null)).toBe(true);
  });

  it("have no settlement before the Settlement is approved", async () => {
    await expect(
      rahim.portal.paper({
        agreementId: agreementOf["রহিম"] ?? "",
        kind: "settlement",
      })
    ).rejects.toMatchObject({ data: { refusal: "not_settled_yet" } });
  });
});
