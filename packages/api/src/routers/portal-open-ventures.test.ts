import { session as sessionTable } from "@OpenFarm/db/schema/auth";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { beforeAll, describe, expect, it } from "vitest";

import { buildContext } from "../context";
import { createTestClient } from "../test/client";
import { invitedWithConsent } from "../test/portal-client";
import { appRouter } from "./index";

// A Venture still gathering capital, shown in the portal (ADR 0008): only once the Owner shows it, then to every
// invited Investor who is not retired, with its terms and rules and the Owner's words — and nothing about anybody
// else's money.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2052-01-01T04:00:00.000Z";
const PASSWORD = "gorur-khamar-2026";

const asOwner = async (at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  return client;
};

type Client = Awaited<ReturnType<typeof asOwner>>;

/** A client signed in as the account an invitation opened, on the day given. */
const signedInAs = async (
  loginEmail: string,
  at = JANUARY
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
  const id = `open-ventures-session-${person.id}-${at}`;
  await db
    .insert(sessionTable)
    .values({
      id,
      token: `open-ventures-token-${person.id}-${at}`,
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

/** An Investor written down by the Owner, invited, and signed in to the portal. */
const invited = async (name: string, phone: string) => {
  const owner = await asOwner();
  const them = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: `01234${phone.slice(-5)}`,
  });
  const { code } = await invitedWithConsent(owner, them.id);
  const { client: nobody } = await createTestClient(appRouter, {
    as: null,
    clock: new FakeClock(JANUARY),
  });
  const { loginEmail } = await nobody.portal.join({
    phone,
    code,
    password: PASSWORD,
  });
  return { id: them.id, loginEmail };
};

const TERMS = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 600_000,
  decideBy: "2052-01-20",
  targetWindowStart: "2052-06-01",
  targetWindowEnd: "2052-06-10",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

const WORDS = "কোরবানির ষাঁড়, ঈদ ২০৫২";

let karim = { id: "", loginEmail: "" };
let ventureId = "";

beforeAll(async () => {
  const owner = await asOwner();
  await owner.investors.setPortalOpen({ open: true });
  const venture = await owner.ventures.open({
    name: `ঈদের ভেঞ্চার ${suffix}`,
    ...TERMS,
  });
  ventureId = venture.id;
  karim = await invited("করিম", `0174${suffix}`);
});

describe("a Venture shown in the portal", () => {
  it("is seen by an invited Investor with no money in any Venture: its terms, the split the farm signs on, the rules and the Owner's words, and nothing more", async () => {
    const owner = await asOwner();
    await owner.ventures.showInPortal({ id: ventureId, words: WORDS });

    const him = await signedInAs(karim.loginEmail);
    const offered = await him.portal.openVentures();

    // The whole answer, so a field added later that carries anybody's money shows up here as a failure.
    expect(offered).toEqual([
      {
        id: ventureId,
        name: `ঈদের ভেঞ্চার ${suffix}`,
        unitPriceBdt: 50_000,
        targetCapitalBdt: 1_000_000,
        floorBdt: 600_000,
        decideBy: "2052-01-20",
        targetWindow: { start: "2052-06-01", end: "2052-06-10" },
        cattleBudgetBdt: 800_000,
        runningBudgetBdt: 200_000,
        investorsPercent: 60,
        words: WORDS,
        takingRequests: true,
      },
    ]);
  });
});

describe("what an invited Investor is offered", () => {
  it("leaves out a Venture the Owner has not shown", async () => {
    const owner = await asOwner();
    const hidden = await owner.ventures.open({
      name: `লুকানো ভেঞ্চার ${suffix}`,
      ...TERMS,
    });

    const him = await signedInAs(karim.loginEmail);
    const offered = await him.portal.openVentures();

    expect(offered.map((one) => one.id)).not.toContain(hidden.id);
    expect(offered.map((one) => one.id)).toContain(ventureId);
  });

  it("leaves out a Venture they are already signed for: it is theirs, not something to ask for", async () => {
    const owner = await asOwner();
    const theirs = await owner.ventures.open({
      name: `সালমার ভেঞ্চার ${suffix}`,
      ...TERMS,
    });
    await owner.ventures.showInPortal({ id: theirs.id, words: "" });
    const salma = await invited("সালমা", `0175${suffix}`);
    await owner.ventures.sign({
      ventureId: theirs.id,
      investorId: salma.id,
      units: 2,
      investorsPercent: 60,
      arbitrator: `সালিস ${suffix}`,
      stampKind: "paper",
      stampValueBdt: 300,
      stampedOn: "2052-01-02",
      stampSerial: `S-0175${suffix}`,
    });

    const her = await signedInAs(salma.loginEmail);
    const offered = await her.portal.openVentures();

    expect(offered.map((one) => one.id)).not.toContain(theirs.id);
    expect(offered.map((one) => one.id)).toContain(ventureId);
  });

  it("is nothing at all for a retired Investor, who reads their own papers and is offered no Venture", async () => {
    const owner = await asOwner();
    const jamal = await invited("জামাল", `0176${suffix}`);
    await owner.investors.retire({ id: jamal.id });

    const him = await signedInAs(jamal.loginEmail);

    expect(await him.portal.openVentures()).toEqual([]);
  });

  it("says a shown Venture past its decide-by day is no longer taking requests", async () => {
    const him = await signedInAs(karim.loginEmail, "2052-01-21T04:00:00.000Z");
    const offered = await him.portal.openVentures();

    expect(offered.find((one) => one.id === ventureId)?.takingRequests).toBe(
      false
    );
  });
});

/** What the Owner's hands on showing a Venture are refused with. */
const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    return (error as { data?: { refusal?: string } }).data?.refusal;
  }
  return "not refused";
};

describe("the Owner showing a Venture", () => {
  it("can take it out of the portal again, and invited Investors stop being offered it", async () => {
    const owner = await asOwner();
    const brief = await owner.ventures.open({
      name: `ক্ষণিকের ভেঞ্চার ${suffix}`,
      ...TERMS,
    });
    await owner.ventures.showInPortal({ id: brief.id, words: "" });
    const him = await signedInAs(karim.loginEmail);
    const before = await him.portal.openVentures();
    expect(before.map((one) => one.id)).toContain(brief.id);

    await owner.ventures.takeOutOfPortal({ id: brief.id });

    const after = await him.portal.openVentures();
    expect(after.map((one) => one.id)).not.toContain(brief.id);
  });

  it("can change the words on a shown Venture, and the Investor reads the new ones", async () => {
    const owner = await asOwner();
    const worded = await owner.ventures.open({
      name: `শব্দের ভেঞ্চার ${suffix}`,
      ...TERMS,
    });
    await owner.ventures.showInPortal({ id: worded.id, words: "প্রথম কথা" });

    await owner.ventures.changePortalWords({
      id: worded.id,
      words: "দ্বিতীয় কথা",
    });

    const him = await signedInAs(karim.loginEmail);
    const offered = await him.portal.openVentures();
    expect(offered.find((one) => one.id === worded.id)?.words).toBe(
      "দ্বিতীয় কথা"
    );
  });

  it("refuses to change the words of a Venture that is not shown", async () => {
    const owner = await asOwner();
    const unshown = await owner.ventures.open({
      name: `অদেখা ভেঞ্চার ${suffix}`,
      ...TERMS,
    });

    expect(
      await refusalOf(
        owner.ventures.changePortalWords({ id: unshown.id, words: "কথা" })
      )
    ).toBe("venture_not_shown");
  });

  it("refuses to show a Venture past its decide-by day, whose Floor question is already answered", async () => {
    const owner = await asOwner();
    const late = await owner.ventures.open({
      name: `দেরির ভেঞ্চার ${suffix}`,
      ...TERMS,
    });
    const afterwards = await asOwner("2052-01-21T04:00:00.000Z");

    expect(
      await refusalOf(
        afterwards.ventures.showInPortal({ id: late.id, words: "" })
      )
    ).toBe("venture_past_decide_by");
  });

  it("refuses to show or take out a Venture that is no longer gathering capital", async () => {
    const owner = await asOwner();
    const over = await owner.ventures.open({
      name: `বাতিল ভেঞ্চার ${suffix}`,
      ...TERMS,
    });
    await owner.ventures.showInPortal({ id: over.id, words: "" });
    await owner.ventures.cancel({ id: over.id, reason: "টাকা ওঠেনি" });

    expect(
      await refusalOf(owner.ventures.showInPortal({ id: over.id, words: "" }))
    ).toBe("venture_wrong_state");
    expect(
      await refusalOf(owner.ventures.takeOutOfPortal({ id: over.id }))
    ).toBe("venture_wrong_state");
  });

  it("is the Owner's alone: the Manager cannot show one", async () => {
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(JANUARY),
    });

    await expect(
      manager.ventures.showInPortal({ id: ventureId, words: "" })
    ).rejects.toThrow();
  });

  it("writes showing, new words and taking out in the trail, with the words as they were", async () => {
    const owner = await asOwner();
    const traced = await owner.ventures.open({
      name: `খাতার ভেঞ্চার ${suffix}`,
      ...TERMS,
    });
    await owner.ventures.showInPortal({ id: traced.id, words: "এক" });
    await owner.ventures.changePortalWords({ id: traced.id, words: "দুই" });
    await owner.ventures.takeOutOfPortal({ id: traced.id });

    const trail = await owner.audit.list({
      entity: "venture",
      entityId: traced.id,
    });
    const said = trail
      .filter((one) => one.action === "update")
      .map((one) => {
        const after = one.after as {
          shownInPortal?: boolean;
          portalWords?: string | null;
        };
        return [after.shownInPortal, after.portalWords];
      })
      .toReversed();

    expect(said).toEqual([
      [true, "এক"],
      [true, "দুই"],
      [false, "দুই"],
    ]);
  });

  it("shows on the Owner's own list whether each Venture is shown, and with what words", async () => {
    const owner = await asOwner();
    const listed = await owner.ventures.list();

    const shown = listed.find((one) => one.id === ventureId);
    expect(shown?.shownInPortal).toBe(true);
    expect(shown?.portalWords).toBe(WORDS);
  });
});
