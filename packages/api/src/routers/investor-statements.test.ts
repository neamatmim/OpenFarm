import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * যোগদানপত্র — the paper an Investor is handed when his money lands, and the surface the three
 * Investor Statements sit on.
 *
 * A paper may be the whole of what the Farm tells an Investor — the portal is by invitation (ADR 0007) — so: that it
 * has his money, how much, on what day, by which bank reference, and what he actually agreed to. Two
 * Investors stand in this Venture, because the one thing this paper must never do is carry one man's
 * money to another.
 */
const suffix = `joining-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2051-01-20",
  targetWindowStart: "2051-03-17",
  targetWindowEnd: "2051-03-19",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

let ventureId = "";
/** His Agreement and the other man's — one Venture, one paper each. */
let hisFirst = "";
let theOtherMans = "";
/** An Agreement nobody has paid a taka against yet. */
let unpaid = "";
const HIM = `রফিকুল ইসলাম ${suffix}`;
/** Him, so the test that tries to sign him a second paper does not have to go looking. */
let hisId = "";
const THE_OTHER_MAN = `জসিম উদ্দিন ${suffix}`;

type Owner = Awaited<ReturnType<typeof as>>;

const signFor = async (
  owner: Owner,
  investorId: string,
  which: string,
  units: number
) => {
  const agreement = await owner.client.ventures.sign({
    ventureId,
    investorId,
    units,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${which} ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2051-01-02",
    stampSerial: `AA ${which} ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  return agreement.id;
};

beforeAll(async () => {
  const owner = await as("owner", "2051-01-01T04:00:00.000Z");
  // Every Export is stamped with the Registration number, so the farm has to have written one down.
  await owner.client.farm.setIdentity({
    address: `গ্রাম: শিমুলিয়া, সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000099",
    registrationNumber: `DLS/SAV/2051/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2053-03-31",
  });
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    ...plan,
  });
  ventureId = venture.id;

  const him = await owner.client.investors.record({
    name: HIM,
    phone: "01977000011",
    address: `সাভার, ঢাকা ${suffix}`,
    nid: "1234567890",
    bankAccount: "0123456789",
    nominee: {
      name: `আমেনা বেগম ${suffix}`,
      phone: "01977000012",
      relation: "স্ত্রী",
    },
  });
  const other = await owner.client.investors.record({
    name: THE_OTHER_MAN,
    phone: "01977000021",
  });
  const nobodyPaid = await owner.client.investors.record({
    name: `নুরুল হক ${suffix}`,
    phone: "01977000031",
  });

  hisId = him.id;
  hisFirst = await signFor(owner, him.id, "1", 6);
  theOtherMans = await signFor(owner, other.id, "2", 8);
  unpaid = await signFor(owner, nobodyPaid.id, "3", 2);

  // His money comes in two transfers, a fortnight apart — which is the whole use of this sheet: he holds
  // it beside his own bank statement and sees the same two lines.
  const paying = await as("owner", "2051-01-03T04:00:00.000Z");
  await paying.client.ventures.takeCapital({
    agreementId: hisFirst,
    amountBdt: 200_000,
    movedOn: "2051-01-03",
    paymentMethod: "bank",
    reference: `TRF-A-${suffix}`,
  });
  const later = await as("owner", "2051-01-17T04:00:00.000Z");
  await later.client.ventures.takeCapital({
    agreementId: hisFirst,
    amountBdt: 100_000,
    movedOn: "2051-01-17",
    paymentMethod: "bank",
    reference: `TRF-B-${suffix}`,
  });
  await later.client.ventures.takeCapital({
    agreementId: theOtherMans,
    amountBdt: 400_000,
    movedOn: "2051-01-17",
    paymentMethod: "bank",
    reference: `TRF-C-${suffix}`,
  });
});

describe("the paper an Investor gets when he joins", () => {
  it("acknowledges what arrived, each transfer with its own day and reference", async () => {
    const owner = await as("owner", "2051-01-20T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.joining({
      agreementId: hisFirst,
    });
    expect(text).toContain(HIM);
    expect(text).toContain(`TRF-A-${suffix}`);
    expect(text).toContain(`TRF-B-${suffix}`);
    // Both transfers, and what they come to — a total nobody can check against a bank line is not an
    // acknowledgement.
    expect(text).toContain("৩,০০,০০০");
  });

  it("carries the letterhead, his nominee, the stamp and the terms he signed", async () => {
    const owner = await as("owner", "2051-01-20T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.joining({
      agreementId: hisFirst,
    });
    expect(text).toContain("নিবন্ধন নম্বর");
    expect(text).toContain(`আমেনা বেগম ${suffix}`);
    expect(text).toContain(`AA 1 ${suffix}`);
    expect(text).toContain(`মাওলানা 1 ${suffix}`);
    // The split as his own paper froze it, in words rather than as a percentage on its own.
    expect(text).toContain("৬০%");
    expect(text).toContain("৪০%");
  });

  it("says on every sheet that no return is guaranteed", async () => {
    const owner = await as("owner", "2051-01-20T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.joining({
      agreementId: hisFirst,
    });
    expect(text).toContain("কোনো মুনাফার নিশ্চয়তা নেই");
    expect(text).toContain(
      "No return is guaranteed. A loss comes off capital."
    );
  });

  it("never carries the other man's name, money or reference", async () => {
    const owner = await as("owner", "2051-01-20T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.joining({
      agreementId: hisFirst,
    });
    expect(text).not.toContain(THE_OTHER_MAN);
    expect(text).not.toContain(`TRF-C-${suffix}`);
    expect(text).not.toContain("৪,০০,০০০");
  });

  it("is refused while no capital has arrived against it", async () => {
    const owner = await as("owner", "2051-01-20T04:00:00.000Z");
    await expect(
      owner.client.investorStatements.joining({ agreementId: unpaid })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "no_capital_yet" },
    });
  });

  it("is refused for an agreement this farm does not hold", async () => {
    const owner = await as("owner", "2051-01-20T04:00:00.000Z");
    await expect(
      owner.client.investorStatements.joining({ agreementId: `none-${suffix}` })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { refusal: "no_such_agreement" },
    });
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager", "2051-01-20T04:00:00.000Z");
    await expect(
      manager.client.investorStatements.joining({ agreementId: hisFirst })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("records the Export against the Agreement, naming the Venture and the man", async () => {
    const owner = await as("owner", "2051-01-21T04:00:00.000Z");
    await owner.client.investorStatements.joining({ agreementId: hisFirst });
    const trail = await owner.client.audit.list({
      entity: "investment_agreement",
      entityId: hisFirst,
    });
    const sent = trail.find((event) => event.action === "export");
    expect(sent?.after).toMatchObject({
      paper: "joining_letter",
      ventureId,
      movements: 2,
      capitalBdt: 300_000,
    });
    // The Registration number every Export is stamped with, so "which registration did that sheet
    // quote" has an answer years later.
    expect(sent?.after).toHaveProperty("registrationNumber");
  });

  it("is asked for by Agreement, which is one man's own paper on one Venture", async () => {
    const owner = await as("owner", "2051-02-01T04:00:00.000Z");
    // One Agreement per Investor per Venture, as the database has it — so asking by Agreement can never
    // be ambiguous, and a man cannot end up with two sheets that each tell half a story.
    await expect(signFor(owner, hisId, "4", 3)).rejects.toBeDefined();
    const agreements = await owner.client.ventures.agreements({ ventureId });
    expect(agreements.filter((one) => one.investorId === hisId)).toHaveLength(
      1
    );
  });

  it("refuses a sheet for capital that has gone back", async () => {
    // A Venture that misses its Floor is called off and every taka returns. A joining letter then would
    // tell a man the Farm holds money it has already sent him.
    const owner = await as("owner", "2051-02-10T04:00:00.000Z");
    const cancelled = await owner.client.ventures.open({
      name: `বাতিল ${suffix}`,
      ...plan,
      decideBy: "2051-02-15",
    });
    const person = await owner.client.investors.record({
      name: `ফেরতপ্রাপ্ত ${suffix}`,
      phone: "01977000041",
    });
    const agreement = await owner.client.ventures.sign({
      ventureId: cancelled.id,
      investorId: person.id,
      units: 4,
      investorsPercent: 60,
      arbitrator: `মাওলানা ৫ ${suffix}`,
      stampValueBdt: 300,
      stampedOn: "2051-02-10",
      stampSerial: `AA 5 ${suffix}`,
    });
    await owner.client.ventures.keepAgreementPaper({
      agreementId: agreement.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    await owner.client.ventures.takeCapital({
      agreementId: agreement.id,
      amountBdt: 200_000,
      movedOn: "2051-02-10",
      paymentMethod: "bank",
      reference: `TRF-E-${suffix}`,
    });
    // While the money is there, the sheet is his to have.
    const held = await owner.client.investorStatements.joining({
      agreementId: agreement.id,
    });
    expect(held.text).toContain(`TRF-E-${suffix}`);

    // Calling a Venture off sends every taka back, and each capital movement needs its own refund named.
    const calling = await as("owner", "2051-02-16T04:00:00.000Z");
    const taken = await calling.client.ventures.movements({
      ventureId: cancelled.id,
    });
    await calling.client.ventures.cancel({
      id: cancelled.id,
      reason: `মূলধন জোগাড় হয়নি ${suffix}`,
      refunds: taken
        .filter((one) => one.kind === "capital_in")
        .map((one) => ({
          movementId: one.id,
          movedOn: "2051-02-16",
          reference: `REF-${suffix}`,
        })),
    });
    const refunds = await calling.client.ventures.movements({
      ventureId: cancelled.id,
    });
    expect(refunds.some((one) => one.kind === "refund")).toBe(true);

    await expect(
      calling.client.investorStatements.joining({ agreementId: agreement.id })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "capital_returned" },
    });
  });

  it("prints the Wind-up Period, not only the Target Window", async () => {
    const owner = await as("owner", "2051-01-20T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.joining({
      agreementId: hisFirst,
    });
    // The days after the window in which it keeps selling before the Farm buys what is left — a man
    // reading only the window would think his money comes back on the 19th of March.
    expect(text).toContain("গুটিয়ে আনার সময়");
    expect(text).toContain("৩০ দিন");
  });
});
