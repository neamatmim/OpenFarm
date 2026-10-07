import { randomUUID } from "node:crypto";

import { auth } from "@OpenFarm/auth";
import { eq } from "@OpenFarm/db/operators";
import {
  account,
  passwordGiven,
  passwordGuess,
} from "@OpenFarm/db/schema/auth";
import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PASSWORD_GIVEN_FOR_MS } from "./password-again";
import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";

// The Owner's acts that pay money out, approve money, open the portal or copy an Investor's data ask for the password
// again once a quarter hour has passed since it was last given (the Owner, 2026-10-07): a laptop left open in the
// office is a session, not the Owner.

const PASSWORD = "the owner's own pass phrase";
const A_MINUTE = 60_000;

/** The Owner's password, kept as Better Auth keeps it. */
const withAPassword = async () => {
  const owner = thePerson("owner");
  const context = await auth.$context;
  const now = new Date();
  await scratchDb()
    .insert(account)
    .values({
      id: `account-${owner.id}`,
      accountId: owner.id,
      providerId: "credential",
      userId: owner.id,
      password: await context.password.hash(PASSWORD),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
};

/** The Owner, signed in now, on a clock that can be moved on. */
const theOwner = async () => {
  const clock = new FakeClock(new Date());
  const { client } = await createTestClient(appRouter, { as: "owner", clock });
  return { client, clock };
};

const wrongGuesses = () =>
  scratchDb().query.passwordGuess.findMany({
    where: { login: thePerson("owner").email.toLowerCase() },
  });

const PASSWORD_NEEDED = { data: { refusal: "password_needed" } };

beforeAll(async () => {
  await theOwner();
  await withAPassword();
});

describe("an act that asks for the password again", () => {
  it("is done within the quarter hour of signing in, without asking", async () => {
    const { client, clock } = await theOwner();
    clock.advance(PASSWORD_GIVEN_FOR_MS - A_MINUTE);
    await expect(
      client.investors.setPortalOpen({ open: true })
    ).resolves.toBeDefined();
  });

  it("is refused after it, each of them, until the password is given", async () => {
    const { client, clock } = await theOwner();
    clock.advance(PASSWORD_GIVEN_FOR_MS + A_MINUTE);
    await expect(
      client.investors.setPortalOpen({ open: true })
    ).rejects.toMatchObject(PASSWORD_NEEDED);
    await expect(
      client.investors.dataCopy({ id: "nobody" })
    ).rejects.toMatchObject(PASSWORD_NEEDED);
    await expect(
      client.money.approve({ id: "nothing" } as never)
    ).rejects.toMatchObject(PASSWORD_NEEDED);
    await expect(
      client.ventures.settlement.approve({ ventureId: "none" })
    ).rejects.toMatchObject(PASSWORD_NEEDED);
    await expect(
      client.ventures.settlement.pay({ ventureId: "none" } as never)
    ).rejects.toMatchObject(PASSWORD_NEEDED);

    await client.people.givePassword({ password: PASSWORD });
    await expect(
      client.investors.setPortalOpen({ open: true })
    ).resolves.toBeDefined();
    // And for a quarter hour from then, not from signing in.
    clock.advance(PASSWORD_GIVEN_FOR_MS + A_MINUTE);
    await expect(
      client.investors.setPortalOpen({ open: true })
    ).rejects.toMatchObject(PASSWORD_NEEDED);
  });

  it("never stands between the Owner and shutting the portal", async () => {
    const { client, clock } = await theOwner();
    clock.advance(PASSWORD_GIVEN_FOR_MS * 4);
    await expect(
      client.investors.setPortalOpen({ open: false })
    ).resolves.toBeDefined();
  });
});

describe("a password given again", () => {
  it("is refused when wrong, counted as a wrong sign-in is, and slowed after five", async () => {
    await scratchDb()
      .delete(passwordGuess)
      .where(eq(passwordGuess.login, thePerson("owner").email.toLowerCase()));
    // The file's one session gave it in a test before.
    await scratchDb()
      .delete(passwordGiven)
      .where(eq(passwordGiven.sessionId, `session-${thePerson("owner").id}`));
    const { client, clock } = await theOwner();
    clock.advance(PASSWORD_GIVEN_FOR_MS + A_MINUTE);
    for (const _ of [1, 2, 3, 4, 5]) {
      // One after another, as somebody guessing types them.
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        client.people.givePassword({ password: `guess ${randomUUID()}` })
      ).rejects.toMatchObject({ data: { refusal: "password_wrong" } });
    }
    expect(await wrongGuesses()).toHaveLength(5);
    // The sixth waits its minute — the right one included, so a guesser learns nothing.
    await expect(
      client.people.givePassword({ password: PASSWORD })
    ).rejects.toMatchObject({ data: { refusal: "account_slowed" } });
    await expect(
      client.investors.setPortalOpen({ open: true })
    ).rejects.toMatchObject(PASSWORD_NEEDED);
    clock.advance(A_MINUTE + 1000);
    await client.people.givePassword({ password: PASSWORD });
    expect(await wrongGuesses()).toEqual([]);
  });
});
