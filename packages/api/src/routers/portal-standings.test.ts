import { session as sessionTable } from "@OpenFarm/db/schema/auth";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { beforeAll, describe, expect, it } from "vitest";

import { buildContext } from "../context";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Where each Investor stands with the portal, as the Owner's list says it (ADR 0007): a code nobody took up before
// it ran out, somebody in who was handed a new one, and when each was last in the portal.

const suffix = `${Date.now()}`.slice(-7);
const PASSWORD = "gorur-khamar-2026";
const JANUARY = "2052-01-01T04:00:00.000Z";
const A_DAY = 24 * 60 * 60 * 1000;
const clockAt = (at: string | Date) =>
  new FakeClock(new Date(at).toISOString());
const later = (days: number, hours = 0) =>
  new Date(Date.parse(JANUARY) + days * A_DAY + hours * 60 * 60 * 1000);

const ownerAt = async (at: string | Date = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: clockAt(at),
  });
  return client;
};

/** A client signed in as the account an invitation opened, reading at a given moment. */
const investorAt = async (loginEmail: string, at: string | Date) => {
  const db = scratchDb();
  const person = await db.query.user.findFirst({
    where: { email: loginEmail },
  });
  if (!person) {
    throw new Error("expected the Investor's account");
  }
  const opened = new Date(JANUARY);
  await db
    .insert(sessionTable)
    .values({
      id: `standings-session-${person.id}`,
      token: `standings-token-${person.id}`,
      userId: person.id,
      expiresAt: new Date(opened.getTime() + 60 * A_DAY),
      createdAt: opened,
      updatedAt: opened,
    })
    .onConflictDoNothing();
  const session = await db.query.session.findFirst({
    where: { id: `standings-session-${person.id}` },
  });
  if (!session) {
    throw new Error("expected the session");
  }
  const context = await buildContext({
    session: { user: person, session },
    device: null,
    deviceStatus: "none",
    callerAddress: null,
    clock: clockAt(at),
    db,
    farmId: theFarm().id,
  });
  return createRouterClient(appRouter, { context });
};

const record = async (name: string, phone: string) => {
  const owner = await ownerAt();
  const one = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: `01234${phone.slice(-5)}`,
  });
  return one.id;
};

const said = async (investorId: string, at: string | Date) => {
  const owner = await ownerAt(at);
  const listed = await owner.investors.list();
  const one = listed.people.find((person) => person.id === investorId);
  if (!one) {
    throw new Error("expected them on the list");
  }
  return {
    portal: one.portal,
    portalCodeUntil: one.portalCodeUntil,
    portalLastSeenAt: one.portalLastSeenAt,
  };
};

let slow = "";
let prompt = "";
const PROMPT_PHONE = `0175${suffix}`;

beforeAll(async () => {
  slow = await record("করিম", `0174${suffix}`);
  prompt = await record("জামাল", PROMPT_PHONE);
  const owner = await ownerAt();
  await owner.investors.setPortalOpen({ open: true });
});

describe("a code nobody takes up", () => {
  it("is invited until its week is out, and then says it ran out", async () => {
    const owner = await ownerAt();
    const { expiresAt } = await owner.investors.inviteToPortal({ id: slow });

    expect(await said(slow, later(3))).toEqual({
      portal: "invited",
      portalCodeUntil: expiresAt,
      portalLastSeenAt: null,
    });
    expect(await said(slow, later(8))).toEqual({
      portal: "code_ran_out",
      portalCodeUntil: null,
      portalLastSeenAt: null,
    });
  });
});

describe("somebody in the portal", () => {
  it("is seen when they read it, to the hour, and stays in when handed a new code", async () => {
    const owner = await ownerAt();
    const { code } = await owner.investors.inviteToPortal({ id: prompt });
    const { client: nobody } = await createTestClient(appRouter, {
      as: null,
      clock: clockAt(JANUARY),
    });
    const { loginEmail } = await nobody.portal.join({
      phone: PROMPT_PHONE,
      code,
      password: PASSWORD,
    });
    const lastSeen = async () => {
      const one = await said(prompt, later(1));
      return one.portalLastSeenAt;
    };
    const readsAt = async (at: Date) => {
      const investor = await investorAt(loginEmail, at);
      await investor.portal.ventures();
    };
    expect(await lastSeen()).toBeNull();

    await readsAt(later(1));
    expect(await lastSeen()).toEqual(later(1));
    // Within the hour it is not written again; after it, it is.
    await readsAt(later(1, 0.5));
    expect(await lastSeen()).toEqual(later(1));
    await readsAt(later(1, 2));
    expect(await lastSeen()).toEqual(later(1, 2));

    // A forgotten password: a new code, and their old password still lets them in meanwhile.
    const againLater = await ownerAt(later(2));
    const { expiresAt } = await againLater.investors.inviteToPortal({
      id: prompt,
    });
    expect(await said(prompt, later(2))).toEqual({
      portal: "in",
      portalCodeUntil: expiresAt,
      portalLastSeenAt: later(1, 2),
    });
  });
});
