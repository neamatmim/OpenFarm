import { user } from "@OpenFarm/db/schema/auth";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { buildContext } from "../context";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// An invitation nobody takes up does not stand open for ever: the Owner may withdraw it, and it lapses after fourteen
// days. Either way the address may be invited again (the Owner, 2026-10-07).

const T0 = "2077-01-05T05:00:00.000Z";
const DAY = 24 * 60 * 60 * 1000;
const after = (days: number) =>
  new Date(Date.parse(T0) + days * DAY).toISOString();

/** Somebody signed up under this address, signed in at this moment. */
const signedUp = async (email: string, at: string) => {
  const userId = `person-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await scratchDb()
    .insert(user)
    .values({ id: userId, name: "আমন্ত্রিত", email, emailVerified: false });
  const row = await scratchDb().query.user.findFirst({ where: { id: userId } });
  await createTestClient(appRouter, { as: "staff" });
  const session = await scratchDb().query.session.findFirst({
    where: { userId: thePerson("staff").id },
  });
  if (!row || !session) {
    throw new Error("seed failed");
  }
  const context = await buildContext({
    session: {
      user: row,
      session: {
        ...session,
        userId,
        expiresAt: new Date(Date.parse(at) + DAY),
      },
    },
    clock: new FakeClock(at),
    db: scratchDb(),
    farmId: theFarm().id,
  });
  return createRouterClient(appRouter, { context });
};

const owner = async (at = T0) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  return client;
};

describe("an invitation", () => {
  it("withdrawn, is taken up by nobody, and the address may be asked again", async () => {
    const email = `withdrawn-${Date.now()}@test.openfarm`;
    const asking = await owner();
    const first = await asking.people.invite({
      email,
      name: "ভুল ঠিকানা",
      roles: ["staff"],
    });
    await asking.people.withdrawInvite({ id: first.id });
    const them = await signedUp(email, after(1));
    await expect(
      them.people.acceptInvite({ code: first.code ?? "" })
    ).rejects.toMatchObject({ data: { refusal: "code_not_valid" } });
    const askingAgain = await owner(after(1));
    const again = await askingAgain.people.invite({
      email,
      name: "ঠিক ঠিকানা",
      roles: ["staff"],
    });
    const taken = await them.people.acceptInvite({ code: again.code ?? "" });
    expect(taken.roles).toEqual(["staff"]);
  });

  it("lapses after fourteen days untaken, and a new code starts its fourteen again", async () => {
    const email = `lapsed-${Date.now()}@test.openfarm`;
    const asking = await owner();
    const sent = await asking.people.invite({
      email,
      name: "দেরিতে",
      roles: ["staff"],
    });
    const late = await signedUp(email, after(15));
    await expect(
      late.people.acceptInvite({ code: sent.code ?? "" })
    ).rejects.toMatchObject({ data: { refusal: "code_not_valid" } });
    // The Owner gives a fresh code on the 15th: fourteen days from then.
    const later = await owner(after(15));
    const fresh = await later.people.reissueInviteCode({ id: sent.id });
    const taken = await late.people.acceptInvite({ code: fresh.code });
    expect(taken.roles).toEqual(["staff"]);
  });
});
