import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { CODE_ATTEMPTS } from "../attempts";
import { createTestClient } from "../test/client";
import { invitedWithConsent } from "../test/portal-client";
import { appRouter } from "./index";

// The Code Slip prints an invitation's code in two groups of four, so it can be read out over the phone: `K7QM 4PXA`.
// Typed as printed, it takes the invitation up — and a wrong one typed the same way is still one wrong guess.

const suffix = `${Date.now()}`.slice(-6);
const PASSWORD = "gorur-khamar-2026";
const JANUARY = "2056-01-01T04:00:00.000Z";
const clock = () => new FakeClock(JANUARY);

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: clock(),
  });
  return client;
};

const from = async (caller: string) => {
  const { client } = await createTestClient(appRouter, {
    as: null,
    clock: clock(),
    from: caller,
  });
  return client;
};

/** Somebody the Owner has recorded and invited, and the code the Owner was shown. */
const invited = async (phone: string) => {
  const owner = await asOwner();
  const investor = await owner.investors.record({
    name: `করিম ${phone}`,
    phone,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: "0123456789",
  });
  const { code } = await invitedWithConsent(owner, investor.id);
  return code;
};

/** How many letters the Code Slip prints before its gap. */
const GROUP = 4;

/** The code as the slip prints it: two groups of four with a gap between. */
const asPrinted = (code: string, gap = " ") =>
  `${code.slice(0, GROUP)}${gap}${code.slice(GROUP)}`;

type Caller = Awaited<ReturnType<typeof from>>;

/** Wrong codes, typed with a gap as the slip prints one, each refused as a wrong code. */
const guessWrong = async (guesser: Caller, phone: string, times: number) => {
  for (let at = 0; at < times; at += 1) {
    // Sequential: each wrong guess is counted before the next.
    // oxlint-disable-next-line no-await-in-loop
    await expect(
      guesser.portal.join({ phone, code: "WRNG CODE", password: PASSWORD })
    ).rejects.toMatchObject({ data: { refusal: "wrong_code" } });
  }
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.investors.setPortalOpen({ open: true });
});

describe("a code typed as the slip prints it", () => {
  it("takes the invitation up, with a space or a tab in the middle", async () => {
    const withSpace = `0172${suffix}1`;
    const withTab = `0172${suffix}2`;
    const spaceCode = await invited(withSpace);
    const tabCode = await invited(withTab);
    const nobody = await from("192.0.2.11");

    await expect(
      nobody.portal.join({
        phone: withSpace,
        code: asPrinted(spaceCode),
        password: PASSWORD,
      })
    ).resolves.toMatchObject({ loginEmail: expect.any(String) });
    await expect(
      nobody.portal.join({
        phone: withTab,
        code: asPrinted(tabCode.toLowerCase(), "\t"),
        password: PASSWORD,
      })
    ).resolves.toMatchObject({ loginEmail: expect.any(String) });
  });

  it("counts a wrong one typed that way as one wrong guess, no more and no fewer", async () => {
    const phone = `0172${suffix}3`;
    const code = await invited(phone);
    const guesser = await from("192.0.2.12");

    await guessWrong(guesser, phone, CODE_ATTEMPTS.limit - 1);
    // One short of the limit, the right code as printed still goes in: each spaced guess counted once, not twice.
    await expect(
      guesser.portal.join({ phone, code: asPrinted(code), password: PASSWORD })
    ).resolves.toMatchObject({ loginEmail: expect.any(String) });
  });

  it("is still stopped at the limit when every wrong guess is typed with a space", async () => {
    const phone = `0172${suffix}4`;
    await invited(phone);
    const guesser = await from("192.0.2.13");

    await guessWrong(guesser, phone, CODE_ATTEMPTS.limit);

    await expect(
      guesser.portal.join({ phone, code: "WRNG CODE", password: PASSWORD })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
