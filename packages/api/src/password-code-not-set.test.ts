import { createAuth } from "@OpenFarm/auth";
import type { setPasswordFor } from "@OpenFarm/auth";
import {
  FakeClock,
  createTestPrincipal,
  inviteWaitingFor,
  scratchDb,
  theFarm,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { grantRoles } from "./membership";
import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";

// The one thing a code is for is a new password. When Better Auth could not set it — the server dies halfway, or it
// answers that it did nothing — the code must still be theirs to use, and nobody told it worked.

/** The first password this file asks for is not set; after that, as Better Auth does it. */
const notSetOnce = vi.hoisted(() => ({ left: 1 }));
vi.mock("@OpenFarm/auth", async (importOriginal) => {
  const real = await importOriginal<{
    setPasswordFor: typeof setPasswordFor;
  }>();
  return {
    ...real,
    setPasswordFor: (...args: Parameters<typeof setPasswordFor>) => {
      if (notSetOnce.left > 0) {
        notSetOnce.left -= 1;
        return Promise.resolve(false);
      }
      return real.setPasswordFor(...args);
    },
  };
});

const auth = createAuth(scratchDb());
const clock = new FakeClock("2046-06-01T04:00:00.000Z");
const EMAIL = "not-set@test.openfarm";
const CHOSEN = "the-one-they-chose";
let userId = "";

beforeAll(async () => {
  await createTestPrincipal("owner", clock.now());
  await inviteWaitingFor(EMAIL, clock.now());
  const signedUp = await auth.api.signUpEmail({
    body: { name: "আবার", email: EMAIL, password: "the-first-password" },
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

describe("a password the farm could not set", () => {
  it("is not said to have worked, and leaves the code theirs to try again", async () => {
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const { code } = await owner.client.people.newPasswordCode({ userId });

    await expect(
      owner.client.people.setPasswordWithCode({
        email: EMAIL,
        code,
        newPassword: CHOSEN,
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    // The same code, again, and this time it is set.
    await owner.client.people.setPasswordWithCode({
      email: EMAIL,
      code,
      newPassword: CHOSEN,
    });
    const signedIn = await auth.api.signInEmail({
      body: { email: EMAIL, password: CHOSEN },
    });
    expect(signedIn.user.id).toBe(userId);
  });
});
