import { createAuth, setPasswordFor } from "@OpenFarm/auth";
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
import { invitedWithConsent } from "./test/portal-client";

// A password everybody else uses is no secret (the exposure review, 1.4; ASVS 6.2.4): refused wherever somebody
// chooses one — taking up a portal invitation, setting one with the farm's code, and changing one while signed in —
// whatever its capitals.

const auth = createAuth(scratchDb());
const clock = new FakeClock("2056-01-01T04:00:00.000Z");
const suffix = `${Date.now()}`.slice(-7);
const EMAIL = `common-${suffix}@test.openfarm`;
const FIRST = "the-first-password";
const COMMON = "Password123";

let userId = "";

beforeAll(async () => {
  await createTestPrincipal("owner", clock.now());
  await inviteWaitingFor(EMAIL, clock.now());
  const signedUp = await auth.api.signUpEmail({
    body: { name: "সাধারণ", email: EMAIL, password: FIRST },
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

describe("a common password", () => {
  it("is not taken up with a portal invitation, and the invitation still stands", async () => {
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock,
    });
    await owner.investors.setPortalOpen({ open: true });
    const him = await owner.investors.record({
      name: `সাধারণ বিনিয়োগকারী ${suffix}`,
      phone: `0181${suffix}`,
    });
    const { code } = await invitedWithConsent(owner, him.id);
    const { client: nobody } = await createTestClient(appRouter, {
      as: null,
      clock,
    });

    await expect(
      nobody.portal.join({ phone: `0181${suffix}`, code, password: COMMON })
    ).rejects.toMatchObject({ data: { refusal: "password_too_common" } });
    await expect(
      nobody.portal.join({
        phone: `0181${suffix}`,
        code,
        password: "gorur-khamar-2026",
      })
    ).resolves.toMatchObject({ loginEmail: expect.any(String) });
  });

  it("is not set with the farm's code", async () => {
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock,
    });
    const { code } = await owner.people.newPasswordCode({ userId });

    await expect(
      owner.people.setPasswordWithCode({
        email: EMAIL,
        code,
        newPassword: COMMON,
      })
    ).rejects.toMatchObject({ data: { refusal: "password_too_common" } });
  });

  it("is not chosen when changing one while signed in", async () => {
    const signedIn = await auth.api.signInEmail({
      body: { email: EMAIL, password: FIRST },
      returnHeaders: true,
    });
    const [cookie] = (signedIn.headers.get("set-cookie") ?? "").split(";");

    await expect(
      auth.api.changePassword({
        body: { currentPassword: FIRST, newPassword: COMMON },
        headers: new Headers({ cookie: cookie ?? "" }),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("is not set by a reset, however the farm's procedures came to ask for one", async () => {
    await expect(setPasswordFor(auth, EMAIL, COMMON)).rejects.toMatchObject({
      statusCode: 400,
    });
    const stillTheirs = await auth.api.signInEmail({
      body: { email: EMAIL, password: FIRST },
    });
    expect(stillTheirs.user.id).toBe(userId);
  });

  it("does not open an account, even with an invite", async () => {
    const invited = `invited-${suffix}@test.openfarm`;
    await inviteWaitingFor(invited, clock.now());

    await expect(
      auth.api.signUpEmail({
        body: { name: "নতুন", email: invited, password: COMMON },
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
