import { createAuth } from "@OpenFarm/auth";
import { PASSWORD_MIN_LENGTH } from "@OpenFarm/auth/password";
import {
  FakeClock,
  createTestPrincipal,
  inviteWaitingFor,
  scratchDb,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

// The screens say how short is too short before the farm has to, and they say it from the same constant. What
// decides it is here: better-auth refuses the password itself, whatever a phone with an older screen believes.

const auth = createAuth(scratchDb());
const clock = new FakeClock("2046-06-01T04:00:00.000Z");
const TOO_SHORT = "a".repeat(PASSWORD_MIN_LENGTH - 1);
// Not a run of one letter: that is one of the most common passwords, and refused for being common, not short.
const JUST_LONG_ENOUGH = "gorur-khamar".slice(0, PASSWORD_MIN_LENGTH);

beforeAll(async () => {
  await createTestPrincipal("owner", clock.now());
});

describe("the shortest password the farm takes", () => {
  it("refuses one character short, and takes the length itself", async () => {
    const email = "short@test.openfarm";
    // Invited first, as the door requires: an account is opened only for somebody the farm asked for.
    await inviteWaitingFor(email, clock.now());

    await expect(
      auth.api.signUpEmail({
        body: { name: "ছোট পাসওয়ার্ড", email, password: TOO_SHORT },
      })
    ).rejects.toThrow();

    const signedUp = await auth.api.signUpEmail({
      body: { name: "ছোট পাসওয়ার্ড", email, password: JUST_LONG_ENOUGH },
    });
    expect(signedUp.user.id).toBeTruthy();

    // And it is the password from here on, so the length was taken rather than quietly padded.
    const signedIn = await auth.api.signInEmail({
      body: { email, password: JUST_LONG_ENOUGH },
    });
    expect(signedIn.user.id).toBe(signedUp.user.id);
  });
});
