import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitingInvestors } from "../test/portal-client";
import { appRouter } from "./index";

// How to pay (ADR 0008): the Owner writes the Venture Account's bank details on the Venture, and an invited Investor's
// own signed Agreement shows them with what is still owed, their Pay-in Code and the decide-by day — until the capital
// is in. Never beside a Venture they have not signed for, where the details would read as "pay here to join".

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2058-01-01T04:00:00.000Z";

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(JANUARY),
  });
  return client;
};

const invited = invitingInvestors({ prefix: "018", run: suffix }, JANUARY);

const ACCOUNT = {
  bank: "ডাচ-বাংলা ব্যাংক",
  branch: "সাভার",
  accountName: "মোঃ আব্দুল করিম (ভেঞ্চার হিসাব)",
  accountNumber: `1101${suffix}`,
  routingNumber: "090264321",
};

const TERMS = {
  targetCapitalBdt: 500_000,
  floorBdt: 300_000,
  decideBy: "2058-01-20",
  targetWindowStart: "2058-06-01",
  targetWindowEnd: "2058-06-10",
  unitPriceBdt: 50_000,
  units: 10,
  cattleBudgetBdt: 400_000,
};

/** A Venture of ten Units at fifty thousand each, shown in the portal. */
const aShownVenture = async (name: string) => {
  const owner = await as("owner");
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    ...TERMS,
  });
  await owner.ventures.showInPortal({ id: venture.id, words: "" });
  return venture.id;
};

/** An invited Investor signed for Units of a Venture, the stamped paper's photo on file. */
const signedUp = async (name: string, ventureId: string, units: number) => {
  const them = await invited(name);
  const owner = await as("owner");
  const agreement = await owner.ventures.sign({
    ventureId,
    investorId: them.id,
    units,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2058-01-02",
    stampSerial: `S-${them.id.slice(-8)}`,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  return { ...them, agreementId: agreement.id, payInCode: agreement.payInCode };
};

const paidIn = async (agreementId: string, amountBdt: number) => {
  const owner = await as("owner");
  await owner.ventures.takeCapital({
    agreementId,
    amountBdt,
    movedOn: "2058-01-05",
    paymentMethod: "bank",
    reference: `BEFTN ${agreementId.slice(-6)}`,
  });
};

/** What an act was refused with, as the screen reads it. */
const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    const said = error as { code?: string; data?: { refusal?: string } };
    return said.data?.refusal ?? said.code;
  }
  return "not refused";
};

/** The Venture Account as the Owner's own list reads it. */
const accountOnTheOwnersList = async (ventureId: string) => {
  const owner = await as("owner");
  const all = await owner.ventures.list();
  return all.find((one) => one.id === ventureId)?.account;
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.investors.setPortalOpen({ open: true });
  await as("manager");
});

describe("the Venture Account's bank details", () => {
  it("are written on the Venture by the Owner, and each change is in the trail with what it said before", async () => {
    const ventureId = await aShownVenture("হিসাবের ভেঞ্চার");
    const owner = await as("owner");

    await owner.ventures.setBankAccount({ id: ventureId, ...ACCOUNT });
    expect(await accountOnTheOwnersList(ventureId)).toEqual(ACCOUNT);

    const moved = { ...ACCOUNT, branch: "আশুলিয়া" };
    await owner.ventures.setBankAccount({ id: ventureId, ...moved });
    expect(await accountOnTheOwnersList(ventureId)).toEqual(moved);

    const events = await scratchDb().query.auditEvent.findMany({
      where: { entity: "venture", entityId: ventureId, action: "update" },
      orderBy: { receivedAt: "asc", id: "asc" },
    });
    const accountsSaid = events.map((one) => [
      (one.before as { account?: unknown } | null)?.account,
      (one.after as { account?: unknown } | null)?.account,
    ]);
    expect(accountsSaid.slice(-2)).toEqual([
      [null, ACCOUNT],
      [ACCOUNT, moved],
    ]);
  });

  it("are the Owner's alone to write", async () => {
    const ventureId = await aShownVenture("মালিকের হিসাব ভেঞ্চার");
    const manager = await as("manager");

    expect(
      await refusalOf(
        manager.ventures.setBankAccount({ id: ventureId, ...ACCOUNT })
      )
    ).toBe("owner_only");
    expect(await accountOnTheOwnersList(ventureId)).toBeNull();
  });

  it("need a bank, an account name and a number; the branch and routing number may wait", async () => {
    const ventureId = await aShownVenture("অর্ধেক হিসাব ভেঞ্চার");
    const owner = await as("owner");

    await owner.ventures.setBankAccount({
      id: ventureId,
      bank: ACCOUNT.bank,
      branch: "",
      accountName: ACCOUNT.accountName,
      accountNumber: ACCOUNT.accountNumber,
      routingNumber: "",
    });

    expect(await accountOnTheOwnersList(ventureId)).toEqual({
      ...ACCOUNT,
      branch: null,
      routingNumber: null,
    });
    expect(
      await refusalOf(
        owner.ventures.setBankAccount({
          id: ventureId,
          ...ACCOUNT,
          accountNumber: "  ",
        })
      )
    ).toBe("BAD_REQUEST");
  });
});

describe("how to pay, on the Investor's own Agreement", () => {
  it("says the bank details, all that is owed, their Pay-in Code and the decide-by day, before anything is paid", async () => {
    const ventureId = await aShownVenture("দেওয়ার ভেঞ্চার");
    const owner = await as("owner");
    await owner.ventures.setBankAccount({ id: ventureId, ...ACCOUNT });
    const karim = await signedUp("করিম", ventureId, 4);

    const theirs = await karim.client.portal.venture({
      agreementId: karim.agreementId,
    });

    expect(theirs.howToPay).toEqual({
      owedBdt: 200_000,
      payInCode: karim.payInCode,
      decideBy: "2058-01-20",
      account: ACCOUNT,
    });
  });

  it("says what is left after a part payment", async () => {
    const ventureId = await aShownVenture("আংশিক ভেঞ্চার");
    const owner = await as("owner");
    await owner.ventures.setBankAccount({ id: ventureId, ...ACCOUNT });
    const rahim = await signedUp("রহিম", ventureId, 4);

    await paidIn(rahim.agreementId, 50_000);

    const theirs = await rahim.client.portal.venture({
      agreementId: rahim.agreementId,
    });
    expect(theirs.howToPay?.owedBdt).toBe(150_000);
  });

  it("is gone once the capital is all in", async () => {
    const ventureId = await aShownVenture("শোধের ভেঞ্চার");
    const owner = await as("owner");
    await owner.ventures.setBankAccount({ id: ventureId, ...ACCOUNT });
    const salma = await signedUp("সালমা", ventureId, 2);

    await paidIn(salma.agreementId, 60_000);
    await paidIn(salma.agreementId, 40_000);

    const theirs = await salma.client.portal.venture({
      agreementId: salma.agreementId,
    });
    expect(theirs.howToPay).toBeNull();
  });

  it("with no bank details written, still says what is owed and the code, and no account", async () => {
    const ventureId = await aShownVenture("হিসাব ছাড়া ভেঞ্চার");
    const nasir = await signedUp("নাসির", ventureId, 1);

    const theirs = await nasir.client.portal.venture({
      agreementId: nasir.agreementId,
    });
    expect(theirs.howToPay).toEqual({
      owedBdt: 50_000,
      payInCode: nasir.payInCode,
      decideBy: "2058-01-20",
      account: null,
    });
  });

  it("is gone once the Venture has stopped taking capital", async () => {
    const ventureId = await aShownVenture("বাতিল ভেঞ্চার");
    const owner = await as("owner");
    await owner.ventures.setBankAccount({ id: ventureId, ...ACCOUNT });
    const jamal = await signedUp("জামাল", ventureId, 2);

    await owner.ventures.cancel({ id: ventureId, reason: "যথেষ্ট টাকা আসেনি" });

    const theirs = await jamal.client.portal.venture({
      agreementId: jamal.agreementId,
    });
    expect(theirs.howToPay).toBeNull();
  });

  it("is never another Investor's to read: their Agreement is no such agreement", async () => {
    const ventureId = await aShownVenture("অন্যের দেওয়ার ভেঞ্চার");
    const owner = await as("owner");
    await owner.ventures.setBankAccount({ id: ventureId, ...ACCOUNT });
    const karim = await signedUp("করিম অন্য", ventureId, 2);
    const other = await invited("অন্য কেউ");

    expect(
      await refusalOf(
        other.client.portal.venture({ agreementId: karim.agreementId })
      )
    ).toBe("no_such_agreement");
  });
});

describe("a Venture an Investor has not signed for", () => {
  it("carries no bank details in what they are offered: the whole answer", async () => {
    const ventureId = await aShownVenture("দেখানো হিসাব ভেঞ্চার");
    const owner = await as("owner");
    await owner.ventures.setBankAccount({ id: ventureId, ...ACCOUNT });
    const looking = await invited("দেখছেন");

    const offered = await looking.client.portal.openVentures();

    expect(offered.find((one) => one.id === ventureId)).toEqual({
      id: ventureId,
      name: `দেখানো হিসাব ভেঞ্চার ${suffix}`,
      unitPriceBdt: 50_000,
      targetCapitalBdt: 500_000,
      floorBdt: 300_000,
      decideBy: "2058-01-20",
      targetWindow: { start: "2058-06-01", end: "2058-06-10" },
      cattleBudgetBdt: 400_000,
      runningBudgetBdt: 100_000,
      investorsPercent: 60,
      words: null,
      takingRequests: true,
    });
    expect(JSON.stringify(offered)).not.toContain(ACCOUNT.accountNumber);
  });
});
