import { session as sessionTable } from "@OpenFarm/db/schema/auth";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";

import { buildContext } from "../context";
import { appRouter } from "../routers";
import { createTestClient } from "./client";

// The Investor's side of the portal, for tests that drive it: an Investor written down, invited and joined, and the
// API as they reach it signed in. Each test file's own Farm, as every other test client's.

type Client = RouterClient<typeof appRouter>;

/** The password every Investor these tests invite chooses: not a common one, which joining would refuse. */
const PASSWORD = "gorur-khamar-2026";

/** The API as the account an invitation opened reaches it, signed in at the moment given. */
export const signedInAs = async (
  loginEmail: string,
  at: string
): Promise<Client> => {
  const db = scratchDb();
  const person = await db.query.user.findFirst({
    where: { email: loginEmail },
  });
  if (!person) {
    throw new Error("expected the Investor's account");
  }
  const clock = new FakeClock(at);
  const start = clock.now();
  const id = `portal-session-${person.id}-${at}`;
  await db
    .insert(sessionTable)
    .values({
      id,
      token: `portal-token-${person.id}-${at}`,
      userId: person.id,
      expiresAt: new Date(start.getTime() + 24 * 60 * 60 * 1000),
      createdAt: start,
      updatedAt: start,
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
    clock,
    db,
    farmId: theFarm().id,
  });
  return createRouterClient(appRouter, { context });
};

/**
 * An Investor the Owner wrote down and invited, who took the invitation up with their phone: their id, the account
 * they sign in as, and the API as they reach it at the moment given.
 */
export const anInvitedInvestor = async (
  { name, phone }: { name: string; phone: string },
  at: string
) => {
  const { client: owner } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  const them = await owner.investors.record({
    name,
    phone,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: `01234${phone.slice(-5)}`,
  });
  const { code } = await owner.investors.inviteToPortal({ id: them.id });
  const { client: nobody } = await createTestClient(appRouter, {
    as: null,
    clock: new FakeClock(at),
  });
  const { loginEmail } = await nobody.portal.join({
    phone,
    code,
    password: PASSWORD,
  });
  const account = await scratchDb().query.user.findFirst({
    where: { email: loginEmail },
    columns: { id: true },
  });
  return {
    id: them.id,
    userId: account?.id ?? "",
    loginEmail,
    client: await signedInAs(loginEmail, at),
  };
};
