import { createAuth } from "@OpenFarm/auth";
import {
  FakeClock,
  createTestPrincipal,
  inviteWaitingFor,
  scratchDb,
  theFarm,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { grantRoles } from "./membership";
import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";

// Signing in tells a stranger nothing about who the farm knows (the exposure review, 1.7). A wrong password gets the
// same answer whoever the address is — an Investor while the portal is shut, one whose access was taken away, a
// milker whose Membership ended — and only the right password hears why the door stays shut, with no sign-in left
// behind.

const auth = createAuth(scratchDb());
const clock = new FakeClock("2057-01-01T04:00:00.000Z");
const suffix = `${Date.now()}`.slice(-7);
const PHONE = `0182${suffix}`;
const INVESTOR = `${PHONE}@investor.openfarm.invalid`;
const PASSWORD = "gorur-khamar-2026";
const STAFF = `left-${suffix}@test.openfarm`;
const WRONG = "not-their-password-at-all";

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, { as: "owner", clock });
  return client;
};

/** What the door answers, as a status: 401 for a wrong password, 403 for a door that stays shut. */
const answered = async (email: string, password: string) => {
  try {
    await auth.api.signInEmail({ body: { email, password } });
    return 200;
  } catch (error) {
    return (error as { statusCode?: number }).statusCode;
  }
};

/** How many places this address is signed in, to tell whether a refused sign-in left one behind. */
const signedInPlaces = async (email: string) => {
  const db = scratchDb();
  const person = await db.query.user.findFirst({ where: { email } });
  const live = person
    ? await db.query.session.findMany({
        where: { userId: person.id, expiresAt: { gt: new Date() } },
      })
    : [];
  return live.length;
};

/** The right password's answer, and whether it left a sign-in behind. */
const rightPassword = async (email: string) => {
  const before = await signedInPlaces(email);
  const status = await answered(email, PASSWORD);
  return { status, leftBehind: (await signedInPlaces(email)) - before };
};

let investorId = "";

beforeAll(async () => {
  await createTestPrincipal("owner", clock.now());
  const owner = await asOwner();
  await owner.investors.setPortalOpen({ open: true });
  const him = await owner.investors.record({
    name: `রহিম ${suffix}`,
    phone: PHONE,
  });
  investorId = him.id;
  const { code } = await owner.investors.inviteToPortal({ id: him.id });
  const { client: nobody } = await createTestClient(appRouter, {
    as: null,
    clock,
  });
  await nobody.portal.join({ phone: PHONE, code, password: PASSWORD });

  await inviteWaitingFor(STAFF, clock.now());
  const left = await auth.api.signUpEmail({
    body: { name: "চলে যাওয়া", email: STAFF, password: PASSWORD },
  });
  await scratchDb().transaction((tx) =>
    grantRoles(
      tx,
      theFarm().id,
      left.user.id,
      ["staff"],
      { id: null, role: null },
      clock.now()
    )
  );
  await owner.people.disable({ userId: left.user.id });
});

describe("a wrong password", () => {
  it("is only wrong, for an Investor while the portal is shut", async () => {
    const owner = await asOwner();
    await owner.investors.setPortalOpen({ open: false });

    expect(await answered(INVESTOR, WRONG)).toBe(401);
    expect(await rightPassword(INVESTOR)).toEqual({
      status: 403,
      leftBehind: 0,
    });
    await owner.investors.setPortalOpen({ open: true });
  });

  it("is only wrong, for an Investor whose access was taken away", async () => {
    const owner = await asOwner();
    await owner.investors.takePortalAway({ id: investorId });

    expect(await answered(INVESTOR, WRONG)).toBe(401);
    expect(await rightPassword(INVESTOR)).toEqual({
      status: 403,
      leftBehind: 0,
    });
  });

  it("is only wrong, for somebody who no longer works here", async () => {
    expect(await answered(STAFF, WRONG)).toBe(401);
    expect(await rightPassword(STAFF)).toEqual({ status: 403, leftBehind: 0 });
  });
});
