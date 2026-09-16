import { createAuth } from "@OpenFarm/auth";
import { eq } from "@OpenFarm/db/operators";
import { user } from "@OpenFarm/db/schema/auth";
import { scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

// Signing in is the one path a farm cannot be locked out of by a mistake, so what it does is said here:
// anybody who works here gets in, and anybody whose Membership has ended is told so rather than let in and
// refused everywhere.

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
});
