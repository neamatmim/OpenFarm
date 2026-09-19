import { createAuth } from "@OpenFarm/auth";
import { eq } from "@OpenFarm/db/operators";
import { user } from "@OpenFarm/db/schema/auth";
import {
  createTestPrincipal,
  inviteWaitingFor,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

// Signing in is the one path a farm cannot be locked out of by a mistake, so what it does is said here:
// anybody who works here gets in, and anybody whose Membership has ended is told so rather than let in and
// refused everywhere. And an account is opened only by somebody the farm asked for.

const auth = createAuth(scratchDb());
const PASSWORD = "shed-phone-1234";
const ours = thePerson("staff");

/** By email: signing somebody up is Better Auth's to do, and the id it gives them is its own. */
const disabled = (at: Date | null) =>
  scratchDb()
    .update(user)
    .set({ disabledAt: at })
    .where(eq(user.email, ours.email));

beforeAll(async () => {
  // The Owner exists and the Farm with her, so this file meets the door as a running farm does.
  await createTestPrincipal("owner", new Date());
  await inviteWaitingFor(ours.email, new Date());
  await auth.api.signUpEmail({
    body: { name: ours.name, email: ours.email, password: PASSWORD },
  });
});

describe("the door", () => {
  it("lets in somebody who works here", async () => {
    await disabled(null);

    const signedIn = await auth.api.signInEmail({
      body: { email: ours.email, password: PASSWORD },
    });

    expect(signedIn.user.email).toBe(ours.email);
  });

  it("is not opened by the wrong password, and says no more than it did", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: ours.email, password: "not-the-password" },
      })
    ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });

  it("turns away somebody whose Membership has ended, in their own language", async () => {
    await disabled(new Date());

    await expect(
      auth.api.signInEmail({
        body: { email: ours.email, password: PASSWORD },
      })
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { message: "আপনি আর এই খামারে কাজ করেন না। ভুল হলে মালিককে বলুন।" },
    });

    // And is opened again the moment they are back at work.
    await disabled(null);
    const backIn = await auth.api.signInEmail({
      body: { email: ours.email, password: PASSWORD },
    });
    expect(backIn.user.email).toBe(ours.email);
  });

  it("does not let a stranger open an account, and says why", async () => {
    // Nobody invited him. He would get no Role and see nothing, but the farm takes other people's money and
    // a door standing open is the thing itself.
    await expect(
      auth.api.signUpEmail({
        body: {
          name: "\u0985\u09AA\u09B0\u09BF\u099A\u09BF\u09A4",
          email: `stranger.${theFarm().id}@test.openfarm`,
          password: PASSWORD,
        },
      })
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: {
        message:
          "\u098F\u0987 \u09A0\u09BF\u0995\u09BE\u09A8\u09BE\u09AF\u09BC \u0996\u09BE\u09AE\u09BE\u09B0 \u0995\u09BE\u0989\u0995\u09C7 \u09A1\u09BE\u0995\u09C7\u09A8\u09BF\u0964 \u09AE\u09BE\u09B2\u09BF\u0995\u0995\u09C7 \u09AC\u09B2\u09C1\u09A8 \u0986\u09AA\u09A8\u09BE\u0995\u09C7 \u09AF\u09CB\u0997 \u0995\u09B0\u09A4\u09C7, \u09A4\u09BE\u09B0\u09AA\u09B0 \u09AF\u09C7 \u0995\u09CB\u09A1 \u09AA\u09BE\u09AC\u09C7\u09A8 \u09A4\u09BE \u09A6\u09BF\u09AF\u09BC\u09C7 \u0985\u09CD\u09AF\u09BE\u0995\u09BE\u0989\u09A8\u09CD\u099F \u0996\u09C1\u09B2\u09C1\u09A8\u0964",
      },
    });
  });

  it("opens for somebody the farm asked for", async () => {
    // The invite is what lets the account be made; the code they were handed separately is what then takes
    // the Roles up. This is the narrower door, not a way around that one.
    const asked = `asked.${theFarm().id}@test.openfarm`;
    await inviteWaitingFor(asked, new Date());

    const made = await auth.api.signUpEmail({
      body: {
        name: "\u09A8\u09A4\u09C1\u09A8",
        email: asked,
        password: PASSWORD,
      },
    });

    expect(made.user.email).toBe(asked);
  });
});
