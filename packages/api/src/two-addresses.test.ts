import { createAuth } from "@OpenFarm/auth";
import { hostOf } from "@OpenFarm/auth/hosts";
import type { Hosts } from "@OpenFarm/auth/hosts";
import { WRONG_ADDRESS } from "@OpenFarm/auth/wrong-address";
import { eq } from "@OpenFarm/db/operators";
import { user } from "@OpenFarm/db/schema/auth";
import { env } from "@OpenFarm/env/server";
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
import { invitedWithConsent } from "./test/portal-client";

// The portal at its own address (ADR 0009): the farm's sign-in and the portal's each answer only their own pages, and
// each turns away the other's people once their password is right, pointing them home. A page on the Investor address
// must never sign in, or act, at the farm's address with the farm's cookie: the two are one site to a browser, so its
// cookies would go with the request, and only the origin check stands in the way.

const FARM = env.BETTER_AUTH_URL;
const PORTAL = "http://investors.two-addresses.test";
const HOSTS: Hosts = { farm: FARM, portal: PORTAL };

const atFarm = createAuth(scratchDb(), {
  host: "farm",
  hosts: HOSTS,
});
const atPortal = createAuth(scratchDb(), {
  host: "portal",
  hosts: HOSTS,
});

const clock = new FakeClock("2058-01-01T04:00:00.000Z");
const suffix = `${Date.now()}`.slice(-7);
const PHONE = `0183${suffix}`;
const INVESTOR = `${PHONE}@investor.openfarm.invalid`;
const STAFF = `milker-${suffix}@test.openfarm`;
const PASSWORD = "gorur-khamar-2026";
const WRONG = "not-their-password-at-all";

/** A fresh sender each time: sign-in is counted per address, and these tests are not about how often. */
const aSender = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/**
 * A sign-in sent to one address from a page on another — or on the same one — carrying that address's cookie, as a
 * browser sends it to either of two addresses of one site.
 */
const signingIn = (
  to: string,
  from: string,
  { email, password }: { email: string; password: string }
) =>
  new Request(`${to}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: from,
      cookie: "better-auth.session_token=whoever-was-signed-in-there",
      "x-forwarded-for": aSender(),
    },
    body: JSON.stringify({ email, password }),
  });

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

/** What one sign-in answered, and whether it left a sign-in behind. */
const answered = async (
  auth: ReturnType<typeof createAuth>,
  request: Request,
  email: string
) => {
  const before = await signedInPlaces(email);
  const response = await auth.handler(request);
  const body = (await response.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
    host?: string;
  };
  return {
    status: response.status,
    body,
    leftBehind: (await signedInPlaces(email)) - before,
  };
};

beforeAll(async () => {
  await createTestPrincipal("owner", clock.now());
  const { client: owner } = await createTestClient(appRouter, {
    as: "owner",
    clock,
  });
  await owner.investors.setPortalOpen({ open: true });
  const him = await owner.investors.record({
    name: `করিম ${suffix}`,
    phone: PHONE,
  });
  const { code } = await invitedWithConsent(owner, him.id);
  const { client: nobody } = await createTestClient(appRouter, {
    as: null,
    clock,
  });
  await nobody.portal.join({ phone: PHONE, code, password: PASSWORD });

  await inviteWaitingFor(STAFF, clock.now());
  const milker = await atFarm.api.signUpEmail({
    body: { name: "দুধ দোয়ানো", email: STAFF, password: PASSWORD },
  });
  await scratchDb().transaction((tx) =>
    grantRoles(
      tx,
      theFarm().id,
      milker.user.id,
      ["staff"],
      { id: null, role: null },
      clock.now()
    )
  );
  // Somebody who reads the app in English is told in English.
  await scratchDb()
    .update(user)
    .set({ language: "en" })
    .where(eq(user.id, milker.user.id));
});

describe("which address a request came to", () => {
  it("is the portal's only where it has one and the request names its host", () => {
    expect(hostOf(`${PORTAL}/portal/login`, HOSTS)).toBe("portal");
    expect(hostOf(`${FARM}/portal/login`, HOSTS)).toBe("farm");
    expect(hostOf(`${PORTAL}/portal/login`, { farm: FARM, portal: null })).toBe(
      "farm"
    );
  });
});

describe("a page on one address", () => {
  it("cannot sign in at the other, whichever way round", async () => {
    const investor = { email: INVESTOR, password: PASSWORD };
    const staff = { email: STAFF, password: PASSWORD };

    const fromThePortal = await answered(
      atFarm,
      signingIn(FARM, PORTAL, staff),
      STAFF
    );
    const fromTheFarm = await answered(
      atPortal,
      signingIn(PORTAL, FARM, investor),
      INVESTOR
    );

    expect(fromThePortal).toMatchObject({ status: 403, leftBehind: 0 });
    expect(fromTheFarm).toMatchObject({ status: 403, leftBehind: 0 });
  });

  it("signs its own people in", async () => {
    const atHome = await answered(
      atPortal,
      signingIn(PORTAL, PORTAL, { email: INVESTOR, password: PASSWORD }),
      INVESTOR
    );
    const staffAtHome = await answered(
      atFarm,
      signingIn(FARM, FARM, { email: STAFF, password: PASSWORD }),
      STAFF
    );

    expect(atHome).toMatchObject({ status: 200, leftBehind: 1 });
    expect(staffAtHome).toMatchObject({ status: 200, leftBehind: 1 });
  });
});

describe("the door, once the password is right", () => {
  it("turns an Investor away from the farm's address, pointing them to the portal's, in their own language", async () => {
    const turned = await answered(
      atFarm,
      signingIn(FARM, FARM, { email: INVESTOR, password: PASSWORD }),
      INVESTOR
    );

    expect(turned).toMatchObject({
      status: 403,
      leftBehind: 0,
      body: { code: WRONG_ADDRESS, address: `${PORTAL}/portal/login` },
    });
    expect(turned.body.message).toContain("investors.two-addresses.test");
    expect(turned.body.message).toMatch(/[ঀ-৿]/u);
  });

  it("turns staff away from the portal's address, pointing them to the farm's, in their own language", async () => {
    const turned = await answered(
      atPortal,
      signingIn(PORTAL, PORTAL, { email: STAFF, password: PASSWORD }),
      STAFF
    );

    expect(turned).toMatchObject({
      status: 403,
      leftBehind: 0,
      body: {
        code: WRONG_ADDRESS,
        address: `${new URL(FARM).origin}/login`,
      },
    });
    expect(turned.body.message).toContain(new URL(FARM).host);
    expect(turned.body.message).not.toMatch(/[ঀ-৿]/u);
  });

  it("says nothing of the other address to a wrong password", async () => {
    const investorAtFarm = await answered(
      atFarm,
      signingIn(FARM, FARM, { email: INVESTOR, password: WRONG }),
      INVESTOR
    );
    const staffAtPortal = await answered(
      atPortal,
      signingIn(PORTAL, PORTAL, { email: STAFF, password: WRONG }),
      STAFF
    );

    expect(investorAtFarm.status).toBe(401);
    expect(staffAtPortal.status).toBe(401);
    expect(investorAtFarm.body).toEqual(staffAtPortal.body);
  });

  it("lets an Investor in at the farm's address while the portal has none of its own", async () => {
    const oneAddress = createAuth(scratchDb(), {
      host: "farm",
      hosts: { farm: FARM, portal: null },
    });

    const signedIn = await answered(
      oneAddress,
      signingIn(FARM, FARM, { email: INVESTOR, password: PASSWORD }),
      INVESTOR
    );

    expect(signedIn).toMatchObject({ status: 200, leftBehind: 1 });
  });
});
