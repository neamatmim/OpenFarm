import { auth, openInvestorAccount } from "@OpenFarm/auth";
import { session as sessionTable } from "@OpenFarm/db/schema/auth";
import { investorLoginOf } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { beforeAll, describe, expect, it } from "vitest";

import { buildContext } from "../context";
import { createTestClient } from "../test/client";
import { invitedWithConsent } from "../test/portal-client";
import { appRouter } from "./index";

// The Investor portal's door (ADR 0007): shut until the Owner opens it, taken up only with the code the Owner handed
// over, opening an account that holds no Role on the farm, and taken away again by the Owner.

const suffix = `${Date.now()}`.slice(-7);
const PHONE = `0171${suffix}`;

/** The address an Investor's account signs in as, asked of the one rule that makes it. */
const loginOf = (phone: string): string =>
  investorLoginOf(phone) ?? `not a mobile number: ${phone}`;
const PASSWORD = "gorur-khamar-2026";
const JANUARY = "2052-01-01T04:00:00.000Z";
const clock = () => new FakeClock(JANUARY);

let investorId = "";

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: clock(),
  });
  return client;
};

const asNobody = async () => {
  const { client } = await createTestClient(appRouter, {
    as: null,
    clock: clock(),
  });
  return client;
};

/** A client signed in as the account the invitation opened, as the portal's own sign-in would leave it. */
const asTheInvestor = async (loginEmail: string) => {
  const db = scratchDb();
  const person = await db.query.user.findFirst({
    where: { email: loginEmail },
  });
  if (!person) {
    throw new Error("expected the Investor's account");
  }
  const at = clock().now();
  const [session] = await db
    .insert(sessionTable)
    .values({
      id: `portal-session-${person.id}`,
      token: `portal-token-${person.id}`,
      userId: person.id,
      expiresAt: new Date(at.getTime() + 24 * 60 * 60 * 1000),
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoNothing()
    .returning();
  const context = await buildContext({
    session: session ? { user: person, session } : null,
    device: null,
    deviceStatus: "none",
    callerAddress: null,
    clock: clock(),
    db,
    farmId: theFarm().id,
  });
  return createRouterClient(appRouter, { context });
};

beforeAll(async () => {
  const owner = await asOwner();
  const him = await owner.investors.record({
    name: `রহিম ${suffix}`,
    phone: PHONE,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: "0123456789",
  });
  investorId = him.id;
});

describe("the portal, shut", () => {
  it("takes up no invitation until the Owner opens it", async () => {
    const owner = await asOwner();
    const { code } = await invitedWithConsent(owner, investorId);
    const nobody = await asNobody();

    await expect(
      nobody.portal.join({ phone: PHONE, code, password: PASSWORD })
    ).rejects.toMatchObject({ data: { refusal: "portal_closed" } });
  });

  it("is the Owner's to open", async () => {
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: clock(),
    });

    await expect(
      manager.investors.setPortalOpen({ open: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("an invitation", () => {
  it("is taken up with the phone and the code, however the phone is typed, and opens an account with no Role", async () => {
    const owner = await asOwner();
    await owner.investors.setPortalOpen({ open: true });
    const { code } = await invitedWithConsent(owner, investorId);
    const nobody = await asNobody();

    await expect(
      nobody.portal.join({ phone: PHONE, code: "WRONGCOD", password: PASSWORD })
    ).rejects.toMatchObject({ data: { refusal: "wrong_code" } });
    const { loginEmail } = await nobody.portal.join({
      phone: `+88 ${PHONE.slice(0, 5)}-${PHONE.slice(5)}`,
      code: code.toLowerCase(),
      password: PASSWORD,
    });

    const signedIn = await auth.api.signInEmail({
      body: { email: loginEmail, password: PASSWORD },
    });
    expect(signedIn.user.email).toBe(loginEmail);
    const investor = await asTheInvestor(loginEmail);
    const me = await investor.people.me();
    expect(me).toMatchObject({ roles: [], investor: true });
    expect(await investor.portal.me()).toMatchObject({
      investorId,
      name: `রহিম ${suffix}`,
    });
    // An account the farm opened for an Investor reads nothing of the farm's.
    await expect(investor.animals.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const listed = await owner.investors.list();
    expect(listed.people.find((one) => one.id === investorId)?.portal).toBe(
      "in"
    );
  });

  it("is used once: the same code does not open anything again", async () => {
    const nobody = await asNobody();
    const owner = await asOwner();
    const { code } = await invitedWithConsent(owner, investorId);
    await nobody.portal.join({ phone: PHONE, code, password: PASSWORD });

    await expect(
      nobody.portal.join({ phone: PHONE, code, password: "another-password" })
    ).rejects.toMatchObject({ data: { refusal: "wrong_code" } });
  });

  it("opens no account by signing up: the address made from a phone is the farm's to open", async () => {
    const nobody = await asNobody();
    const { loginEmail } = await nobody.portal
      .join({ phone: PHONE, code: "X", password: PASSWORD })
      .catch(() => ({ loginEmail: loginOf(PHONE) }));

    // Not even with an invitation to work here written against it by mistake.
    const owner = await asOwner();
    await owner.people.invite({
      email: loginEmail,
      name: "Stranger",
      roles: ["staff"],
    });

    await expect(
      auth.api.signUpEmail({
        body: { email: loginEmail, password: PASSWORD, name: "Stranger" },
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("the portal", () => {
  it("is for the Investor alone: the Owner's own session is refused there", async () => {
    const owner = await asOwner();

    await expect(owner.portal.me()).rejects.toMatchObject({
      data: { refusal: "not_an_investor" },
    });
  });

  it("taken away, signs nobody in and answers nobody, and given back with a new code", async () => {
    const owner = await asOwner();
    const loginEmail = loginOf(PHONE);

    await owner.investors.takePortalAway({
      id: investorId,
      why: { reason: "owner" },
    });
    await expect(
      auth.api.signInEmail({ body: { email: loginEmail, password: PASSWORD } })
    ).rejects.toMatchObject({ statusCode: 403 });

    const { code } = await invitedWithConsent(owner, investorId);
    const nobody = await asNobody();
    await nobody.portal.join({
      phone: PHONE,
      code,
      password: "a-new-password",
    });
    const back = await auth.api.signInEmail({
      body: { email: loginEmail, password: "a-new-password" },
    });
    expect(back.user.email).toBe(loginEmail);
  });

  it("closed, signs no Investor in", async () => {
    const owner = await asOwner();
    await owner.investors.setPortalOpen({ open: false });

    await expect(
      auth.api.signInEmail({
        body: {
          email: loginOf(PHONE),
          password: "a-new-password",
        },
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    await owner.investors.setPortalOpen({ open: true });
  });
});

/** Whether this password signs this address in now. */
const signsInWith = async (email: string, password: string) => {
  try {
    await auth.api.signInEmail({ body: { email, password } });
    return true;
  } catch {
    return false;
  }
};

describe("taking up an invitation, when something goes wrong", () => {
  /** An Investor of this test's own, so what it does to their account touches nobody else's. */
  const anotherInvestor = async (phone: string) => {
    const owner = await asOwner();
    await owner.investors.setPortalOpen({ open: true });
    const them = await owner.investors.record({
      name: `করিম ${phone}`,
      phone,
      address: "সাভার",
      nid: "1234567890",
      bankAccount: "0123456789",
    });
    return {
      owner,
      id: them.id,
      loginEmail: loginOf(phone),
    };
  };

  it("finishes an account a crash left half-made, rather than refusing the next try", async () => {
    const phone = `0181${suffix}`;
    const { owner, id, loginEmail } = await anotherInvestor(phone);
    const { code } = await invitedWithConsent(owner, id);
    // The server made the account and died before it wrote the invitation down as taken.
    await openInvestorAccount(auth, {
      email: loginEmail,
      name: `করিম ${phone}`,
      password: "the-first-try-2026",
    });

    const nobody = await asNobody();
    await nobody.portal.join({ phone, code, password: PASSWORD });

    expect(await signsInWith(loginEmail, PASSWORD)).toBe(true);
    const listed = await owner.investors.list();
    expect(listed.people.find((one) => one.id === id)?.portal).toBe("in");
  });

  it("lets only the try that used the code set the password, when two arrive at once", async () => {
    const phone = `0191${suffix}`;
    const { owner, id, loginEmail } = await anotherInvestor(phone);
    const first = await invitedWithConsent(owner, id);
    const nobody = await asNobody();
    await nobody.portal.join({ phone, code: first.code, password: PASSWORD });

    // Back for a new password, twice at once — a double tap, or somebody else holding the same slip. Whichever used
    // the code, its password is the one that works; the other changed nothing.
    for (const round of [1, 2, 3, 4, 5]) {
      // oxlint-disable-next-line no-await-in-loop
      const { code } = await invitedWithConsent(owner, id);
      const mine = `mine-round-${round}-2026`;
      const theirs = `theirs-round-${round}-2026`;
      // oxlint-disable-next-line no-await-in-loop
      const [a, b] = await Promise.allSettled([
        nobody.portal.join({ phone, code, password: mine }),
        nobody.portal.join({ phone, code, password: theirs }),
      ]);
      const won = [a, b].filter((one) => one.status === "fulfilled");
      expect(won).toHaveLength(1);
      const winner = a.status === "fulfilled" ? mine : theirs;
      const loser = winner === mine ? theirs : mine;
      // oxlint-disable-next-line no-await-in-loop
      expect(await signsInWith(loginEmail, winner)).toBe(true);
      // oxlint-disable-next-line no-await-in-loop
      expect(await signsInWith(loginEmail, loser)).toBe(false);
    }
  });
});
