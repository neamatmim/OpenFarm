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

// Somebody who has forgotten their password cannot sign in to change it, and the farm cannot set one for them:
// a password somebody else has seen signs work in their name. So the farm hands them a code and takes it back.

const auth = createAuth(scratchDb());
const clock = new FakeClock("2046-05-01T04:00:00.000Z");
const EMAIL = "forgot@test.openfarm";
const FIRST = "the-first-password";
const CHOSEN = "the-one-they-chose";
let userId = "";

beforeAll(async () => {
  // The Farm itself, which the harness seeds with the first person on it.
  await createTestPrincipal("owner", clock.now());
  // Invited first, as the door requires: an account is opened only for somebody the farm asked for.
  await inviteWaitingFor(EMAIL, clock.now());
  const signedUp = await auth.api.signUpEmail({
    body: { name: "ভুলে যাওয়া", email: EMAIL, password: FIRST },
  });
  userId = signedUp.user.id;
  await scratchDb().transaction((tx) =>
    grantRoles(
      tx,
      theFarm().id,
      userId,
      ["staff"],
      { id: null, role: null },
      clock.now()
    )
  );
});

describe("a forgotten password", () => {
  it("is set by the person themselves, with a code the farm handed over once", async () => {
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const { code } = await owner.client.people.newPasswordCode({ userId });

    // A code the farm is not holding is not an answer, however close it looks.
    await expect(
      owner.client.people.setPasswordWithCode({
        email: EMAIL,
        code: "WRONGCOD",
        newPassword: CHOSEN,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await owner.client.people.setPasswordWithCode({
      email: EMAIL,
      code,
      newPassword: CHOSEN,
    });

    // The password is theirs now, and the one they had is not a way in.
    const signedIn = await auth.api.signInEmail({
      body: { email: EMAIL, password: CHOSEN },
    });
    expect(signedIn.user.id).toBe(userId);
    await expect(
      auth.api.signInEmail({ body: { email: EMAIL, password: FIRST } })
    ).rejects.toMatchObject({ status: "UNAUTHORIZED" });

    // And the code is spent: handing it over once is the whole of what it is for.
    await expect(
      owner.client.people.setPasswordWithCode({
        email: EMAIL,
        code,
        newPassword: "another-go-at-it",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is only ever issued for somebody who works on this farm", async () => {
    // Somebody with an account and no Role on this farm. Seeded rather than signed up, because the door
    // no longer opens an account for anybody the farm has not asked for.
    const stranger = await createTestPrincipal("newcomer", clock.now());
    const owner = await createTestClient(appRouter, { as: "owner", clock });

    await expect(
      owner.client.people.newPasswordCode({ userId: stranger.user.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
