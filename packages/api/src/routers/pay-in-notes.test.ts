import {
  PAY_IN_CLOSE_REASONS as CLOSE_REASONS_KEPT,
  PAY_IN_NOTE_STATES as STATES_KEPT,
  PAY_IN_WAYS as WAYS_KEPT,
} from "@OpenFarm/db/schema/venture-account";
import {
  PAY_IN_CLOSE_REASONS,
  PAY_IN_NOTE_STATES,
  PAY_IN_WAYS,
} from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { invitingInvestors } from "../test/portal-client";
import { appRouter } from "./index";

// A Pay-in Note: an Investor's word, from the portal, that they sent money towards one of their Agreements, for the
// Owner to check against the Venture Account (ADR 0018). It moves no money and records no capital: the Owner records
// the capital from it, which answers it received, or answers it not found. Behind the farm's switch, which is off until
// the Owner turns it on.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2094-01-10T04:00:00.000Z";
const TODAY = "2094-01-10";

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(JANUARY),
  });
  return client;
};

const invited = invitingInvestors({ prefix: "019", run: suffix }, JANUARY);

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

/** The Venture Account the farm writes on a Venture: where it tells an Investor to pay. */
const ACCOUNT = {
  bank: "ডাচ-বাংলা ব্যাংক",
  branch: "সাভার",
  accountName: "মোঃ আব্দুল করিম (ভেঞ্চার হিসাব)",
  accountNumber: `1101${suffix}`,
  routingNumber: "090264321",
};

/** A Venture of ten Units at fifty thousand each, still gathering its capital, its Venture Account written unless
 *  asked otherwise. */
const aVenture = async (name: string, { withAccount = true } = {}) => {
  const owner = await as("owner");
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalMoney: 500_000,
    floorMoney: 0,
    decideBy: "2094-01-25",
    targetWindowStart: "2094-06-01",
    targetWindowEnd: "2094-06-10",
    unitPriceMoney: 50_000,
    units: 10,
    cattleBudgetMoney: 400_000,
  });
  if (withAccount) {
    await owner.ventures.setBankAccount({ id: venture.id, ...ACCOUNT });
  }
  return venture.id;
};

/** An invited Investor signed for Units of a Venture — the stamped paper's photo on file unless asked otherwise. */
const signedUp = async (
  name: string,
  ventureId: string,
  units: number,
  { paperKept = true } = {}
) => {
  const them = await invited(name);
  const owner = await as("owner");
  const agreement = await owner.ventures.agreements.sign({
    ventureId,
    investorId: them.id,
    units,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2094-01-02",
    stampSerial: `S-${them.id.slice(-8)}`,
  });
  if (paperKept) {
    await owner.ventures.agreements.keepPaper({
      agreementId: agreement.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
  }
  return { ...them, agreementId: agreement.id };
};

/** What a note says, the rest as it usually is. */
const saying = (agreementId: string, amountMoney: number) => ({
  agreementId,
  amountMoney,
  sentOn: TODAY,
  way: "bank_transfer" as const,
  reference: `BEFTN ${agreementId.slice(-6)}`,
});

/** One of an Investor's own notes, as the portal reads it back. */
const theirNote = async (
  them: Awaited<ReturnType<typeof signedUp>>,
  noteId: string
) => {
  const notes = await them.client.portal.payInNotes();
  return notes.find((one) => one.id === noteId);
};

/** What somebody's own list says about notes on one Venture, still on it. */
const toldAbout = async (role: "owner" | "manager", ventureId: string) => {
  const client = await as(role);
  const alerts = await client.alerts.mine({ about: ventureId });
  return alerts.filter(
    (one) => one.kind === "pay_in_note_sent" && one.dismissedAt === null
  );
};

/** Turns the switch, each read and act by a fresh client: a client reads the farm once, when it is made. */
const turn = async (shown: boolean) => {
  const owner = await as("owner");
  await owner.investors.setPayInNotes({ shown });
};

const switchedOn = async () => {
  const owner = await as("owner");
  const listed = await owner.investors.list();
  return listed.payInNotes;
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.investors.setPortalOpen({ open: true });
  // The Manager is on the farm before anybody sends a note, or "the Manager was not told" would only mean there was
  // none.
  await as("manager");
});

describe("the switch", () => {
  it("is off until the Owner turns it on, and off again when they turn it off", async () => {
    expect(await switchedOn()).toBe(false);
    await turn(true);
    expect(await switchedOn()).toBe(true);
    await turn(false);
    expect(await switchedOn()).toBe(false);
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager");
    await expect(
      manager.investors.setPayInNotes({ shown: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("off, refuses a note, and the portal offers none", async () => {
    const ventureId = await aVenture("বন্ধ");
    const them = await signedUp("বন্ধ সুইচ", ventureId, 2);
    expect(
      await refusalOf(
        them.client.portal.sendPayInNote(saying(them.agreementId, 10_000))
      )
    ).toBe("pay_in_notes_off");
    const today = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    // Nor is a note changed while it is off: the portal offers neither.
    expect(today.payIn).toMatchObject({ mayTell: false, mayChange: false });
  });
});

describe("a Pay-in Note, sent", () => {
  beforeAll(async () => {
    await turn(true);
  });

  it("waits for the Owner, who is told at once — and the Manager is not", async () => {
    const ventureId = await aVenture("পাঠানো");
    const them = await signedUp("পাঠানো টাকা", ventureId, 2);
    const before = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    // Two Units at ৳50,000, nothing paid and nothing told yet: room for all of it.
    expect(before.payIn).toEqual({
      mayTell: true,
      mayChange: true,
      roomMoney: 100_000,
      notes: [],
    });

    const sent = await them.client.portal.sendPayInNote({
      ...saying(them.agreementId, 60_000),
      way: "mobile_money",
      reference: "TrxID 9XK2LM01",
      photo: { contentType: "image/jpeg", data: "c2xpcA==" },
    });

    expect(await theirNote(them, sent.id)).toMatchObject({
      agreementId: them.agreementId,
      amountMoney: 60_000,
      sentOn: TODAY,
      way: "mobile_money",
      reference: "TrxID 9XK2LM01",
      state: "waiting",
      hasPhoto: true,
    });
    const owners = await toldAbout("owner", ventureId);
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({
      entity: "pay_in_note",
      params: {
        noteId: sent.id,
        ventureId,
        venture: `পাঠানো ${suffix}`,
        investor: `পাঠানো টাকা ${suffix}`,
        amountMoney: 60_000,
        sentOn: TODAY,
        way: "mobile_money",
      },
    });
    expect(await toldAbout("manager", ventureId)).toEqual([]);
    // It moved no money: the Agreement still owes all of it.
    const after = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    expect(after.howToPay?.owedMoney).toBe(100_000);
    // Their own act, in the trail.
    const event = await scratchDb().query.auditEvent.findFirst({
      where: { entity: "pay_in_note", entityId: sent.id, action: "create" },
    });
    expect(event?.actorId).toBe(them.userId);
  });

  it("is refused for more than the paper still owes, counting the notes still waiting", async () => {
    const ventureId = await aVenture("বেশি");
    const them = await signedUp("বেশি টাকা", ventureId, 2);
    await them.client.portal.sendPayInNote(saying(them.agreementId, 70_000));
    expect(
      await refusalOf(
        them.client.portal.sendPayInNote(saying(them.agreementId, 30_001))
      )
    ).toBe("pay_in_over_owed");
    await them.client.portal.sendPayInNote(saying(them.agreementId, 30_000));
  });

  it("is refused for a day still to come, a paper not on file, and an Agreement not theirs", async () => {
    const ventureId = await aVenture("না");
    const them = await signedUp("না বলা", ventureId, 1);
    const unpapered = await signedUp("কাগজ ছাড়া", ventureId, 1, {
      paperKept: false,
    });
    expect(
      await refusalOf(
        them.client.portal.sendPayInNote({
          ...saying(them.agreementId, 10_000),
          sentOn: "2094-01-11",
        })
      )
    ).toBe("pay_in_day_ahead");
    expect(
      await refusalOf(
        unpapered.client.portal.sendPayInNote(
          saying(unpapered.agreementId, 10_000)
        )
      )
    ).toBe("agreement_has_no_paper");
    // Refused, and so not offered: the portal asks what the note is refused by.
    const notOnFile = await unpapered.client.portal.venture({
      agreementId: unpapered.agreementId,
    });
    expect(notOnFile.payIn.mayTell).toBe(false);
    expect(
      await refusalOf(
        them.client.portal.sendPayInNote(saying(unpapered.agreementId, 10_000))
      )
    ).toBe("no_such_agreement");
  });

  it("is offered only where it would be taken, and for no more than is left once the notes waiting are counted", async () => {
    const ventureId = await aVenture("দেওয়ার মতো");
    const them = await signedUp("জায়গা আছে", ventureId, 2);
    // Two Units at ৳50,000, nothing paid: room for ৳1,00,000.
    const before = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    expect(before.payIn).toMatchObject({ mayTell: true, roomMoney: 100_000 });
    // A note of ৳70,000 waiting leaves room for ৳30,000; one of the rest leaves none to tell.
    await them.client.portal.sendPayInNote(saying(them.agreementId, 70_000));
    const partly = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    expect(partly.payIn).toMatchObject({ mayTell: true, roomMoney: 30_000 });
    await them.client.portal.sendPayInNote(saying(them.agreementId, 30_000));
    const full = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    // No room for another, but the ones waiting may still be changed.
    expect(full.payIn).toMatchObject({
      mayTell: false,
      mayChange: true,
      roomMoney: 0,
    });
  });

  it("is neither offered nor taken before the farm has written where to pay", async () => {
    const ventureId = await aVenture("হিসাব ছাড়া", { withAccount: false });
    const them = await signedUp("হিসাব নেই", ventureId, 1);
    const today = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    expect(today.payIn.mayTell).toBe(false);
    expect(
      await refusalOf(
        them.client.portal.sendPayInNote(saying(them.agreementId, 10_000))
      )
    ).toBe("venture_has_no_account");
  });

  it("is refused once its Venture takes no more capital", async () => {
    const ventureId = await aVenture("কেনা");
    const them = await signedUp("কেনা শুরু", ventureId, 1);
    const owner = await as("owner");
    await owner.ventures.takeCapital({
      agreementId: them.agreementId,
      amountMoney: 40_000,
      movedOn: TODAY,
      paymentMethod: "bank",
      reference: "BEFTN 1",
    });
    await owner.ventures.startBuying({ id: ventureId });
    expect(
      await refusalOf(
        them.client.portal.sendPayInNote(saying(them.agreementId, 10_000))
      )
    ).toBe("venture_takes_no_capital");
  });
});

describe("a note while it waits", () => {
  beforeAll(async () => {
    await turn(true);
  });

  it("is changed by the Investor, each change kept, and the Owner's Notice says what it says now", async () => {
    const ventureId = await aVenture("বদল");
    const them = await signedUp("বদলানো", ventureId, 2);
    const sent = await them.client.portal.sendPayInNote(
      saying(them.agreementId, 5000)
    );
    await them.client.portal.changePayInNote({
      noteId: sent.id,
      amountMoney: 50_000,
      sentOn: TODAY,
      way: "cheque",
      reference: "Cheque 004512",
    });

    expect(await theirNote(them, sent.id)).toMatchObject({
      amountMoney: 50_000,
      way: "cheque",
      reference: "Cheque 004512",
      state: "waiting",
      hasPhoto: false,
    });
    const changes = await scratchDb().query.payInNoteChange.findMany({
      where: { noteId: sent.id },
      orderBy: { createdAt: "asc", id: "asc" },
    });
    expect(changes.map((one) => [one.kind, one.amountMoney])).toEqual([
      ["sent", 5000],
      ["changed", 50_000],
    ]);
    const owners = await toldAbout("owner", ventureId);
    expect(owners).toHaveLength(1);
    expect(owners[0]?.params).toMatchObject({
      amountMoney: 50_000,
      way: "cheque",
    });
  });

  it("is withdrawn by the Investor, and leaves the Owner's list", async () => {
    const ventureId = await aVenture("ফেরত");
    const them = await signedUp("ফিরিয়ে নেওয়া", ventureId, 1);
    const sent = await them.client.portal.sendPayInNote(
      saying(them.agreementId, 50_000)
    );
    await them.client.portal.withdrawPayInNote({ noteId: sent.id });
    const withdrawn = await theirNote(them, sent.id);
    expect(withdrawn?.state).toBe("withdrawn");
    expect(await toldAbout("owner", ventureId)).toEqual([]);
    expect(
      await refusalOf(them.client.portal.withdrawPayInNote({ noteId: sent.id }))
    ).toBe("pay_in_note_not_waiting");
    // Withdrawn, what it said no longer counts against what is owed.
    await them.client.portal.sendPayInNote(saying(them.agreementId, 50_000));
  });

  it("is nobody else's to change or withdraw", async () => {
    const ventureId = await aVenture("অন্যের");
    const them = await signedUp("নিজের", ventureId, 1);
    const other = await signedUp("অন্য কেউ", ventureId, 1);
    const sent = await them.client.portal.sendPayInNote(
      saying(them.agreementId, 10_000)
    );
    expect(
      await refusalOf(
        other.client.portal.withdrawPayInNote({ noteId: sent.id })
      )
    ).toBe("no_such_pay_in_note");
  });
});

describe("the Owner's answer", () => {
  beforeAll(async () => {
    await turn(true);
  });

  it("received: the capital recorded from the note, which reads received and names it — once", async () => {
    const ventureId = await aVenture("পাওয়া");
    const them = await signedUp("পাওয়া গেছে", ventureId, 2);
    const sent = await them.client.portal.sendPayInNote(
      saying(them.agreementId, 60_000)
    );
    const owner = await as("owner");
    const listed = await owner.ventures.payInNotes.list({ ventureId });
    expect(listed).toEqual([
      expect.objectContaining({
        id: sent.id,
        investor: `পাওয়া গেছে ${suffix}`,
        state: "waiting",
      }),
    ]);

    const recorded = await owner.ventures.takeCapital({
      agreementId: them.agreementId,
      amountMoney: 60_000,
      movedOn: TODAY,
      paymentMethod: "bank",
      reference: "BEFTN 60",
      payInNoteId: sent.id,
    });

    expect(await theirNote(them, sent.id)).toMatchObject({
      state: "received",
    });
    const kept = await scratchDb().query.payInNote.findFirst({
      where: { id: sent.id },
    });
    expect(kept?.movementId).toBe(recorded.id);
    expect(await toldAbout("owner", ventureId)).toEqual([]);
    // The same note is not received twice.
    expect(
      await refusalOf(
        owner.ventures.takeCapital({
          agreementId: them.agreementId,
          amountMoney: 10_000,
          movedOn: TODAY,
          paymentMethod: "bank",
          reference: "BEFTN 61",
          payInNoteId: sent.id,
        })
      )
    ).toBe("pay_in_note_not_waiting");
    const movements = await scratchDb().query.ventureMovement.findMany({
      where: { agreementId: them.agreementId, kind: "capital_in" },
    });
    expect(movements.map((one) => one.amountMoney)).toEqual([60_000]);
  });

  it("received is refused where the capital is: the note stays waiting", async () => {
    const ventureId = await aVenture("থাকা");
    const them = await signedUp("অপেক্ষায়", ventureId, 1);
    const sent = await them.client.portal.sendPayInNote(
      saying(them.agreementId, 50_000)
    );
    const owner = await as("owner");
    expect(
      await refusalOf(
        owner.ventures.takeCapital({
          agreementId: them.agreementId,
          amountMoney: 50_001,
          movedOn: TODAY,
          paymentMethod: "bank",
          reference: "BEFTN 99",
          payInNoteId: sent.id,
        })
      )
    ).toBe("capital_over_units");
    const still = await theirNote(them, sent.id);
    expect(still?.state).toBe("waiting");
  });

  it("not found: with a line the Investor reads, and off the Owner's list", async () => {
    const ventureId = await aVenture("পাওয়া যায়নি");
    const them = await signedUp("খোঁজা", ventureId, 1);
    const sent = await them.client.portal.sendPayInNote(
      saying(them.agreementId, 50_000)
    );
    const owner = await as("owner");
    expect(
      await refusalOf(
        owner.ventures.payInNotes.notFound({ noteId: sent.id, line: " " })
      )
    ).toBe("BAD_REQUEST");
    await owner.ventures.payInNotes.notFound({
      noteId: sent.id,
      line: "৫ তারিখ পর্যন্ত হিসাবে আসেনি — স্লিপটা পাঠাবেন",
    });
    expect(await theirNote(them, sent.id)).toMatchObject({
      state: "not_found",
      answerLine: "৫ তারিখ পর্যন্ত হিসাবে আসেনি — স্লিপটা পাঠাবেন",
    });
    expect(await toldAbout("owner", ventureId)).toEqual([]);
  });

  it("is the Owner's alone: the Manager reads no note and answers none", async () => {
    const ventureId = await aVenture("ম্যানেজার");
    const manager = await as("manager");
    await expect(
      manager.ventures.payInNotes.list({ ventureId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("opens the slip's photo for the Owner, in the trail", async () => {
    const ventureId = await aVenture("ছবি");
    const them = await signedUp("ছবিসহ", ventureId, 1);
    const sent = await them.client.portal.sendPayInNote({
      ...saying(them.agreementId, 50_000),
      photo: { contentType: "image/png", data: "cGhvdG8=" },
    });
    const owner = await as("owner");
    expect(await owner.ventures.payInNotes.photo({ noteId: sent.id })).toEqual({
      contentType: "image/png",
      data: "cGhvdG8=",
    });
    const opened = await scratchDb().query.auditEvent.findFirst({
      where: { entity: "pay_in_note", entityId: sent.id, action: "export" },
    });
    expect(opened).toBeDefined();
  });
});

describe("a note nobody answered", () => {
  beforeAll(async () => {
    await turn(true);
  });

  it("closes by itself once nothing is owed on its paper", async () => {
    const ventureId = await aVenture("শোধ");
    const them = await signedUp("পুরো শোধ", ventureId, 1);
    const sent = await them.client.portal.sendPayInNote(
      saying(them.agreementId, 50_000)
    );
    const owner = await as("owner");
    // Recorded without the note: the bank showed it first.
    await owner.ventures.takeCapital({
      agreementId: them.agreementId,
      amountMoney: 50_000,
      movedOn: TODAY,
      paymentMethod: "bank",
      reference: "BEFTN 50",
    });
    expect(await theirNote(them, sent.id)).toMatchObject({
      state: "closed",
      closedBecause: "nothing_owed",
    });
    expect(await toldAbout("owner", ventureId)).toEqual([]);
  });

  it("closes by itself once its Venture takes no more capital", async () => {
    const ventureId = await aVenture("বন্ধ হওয়া");
    const them = await signedUp("দেরিতে", ventureId, 2);
    const owner = await as("owner");
    await owner.ventures.takeCapital({
      agreementId: them.agreementId,
      amountMoney: 50_000,
      movedOn: TODAY,
      paymentMethod: "bank",
      reference: "BEFTN 51",
    });
    const sent = await them.client.portal.sendPayInNote(
      saying(them.agreementId, 50_000)
    );
    await owner.ventures.startBuying({ id: ventureId });
    expect(await theirNote(them, sent.id)).toMatchObject({
      state: "closed",
      closedBecause: "venture_takes_no_capital",
    });
  });
  it("closes by itself when a Venture paid by the month makes its first Sale, and takes no more Monthly Sums", async () => {
    const owner = await as("owner");
    const venture = await owner.ventures.open({
      name: `মাসে মাসে ${suffix}`,
      targetCapitalMoney: 500_000,
      floorMoney: 0,
      decideBy: "2094-01-25",
      targetWindowStart: "2094-06-01",
      targetWindowEnd: "2094-06-10",
      unitPriceMoney: 50_000,
      units: 10,
      cattleBudgetMoney: 400_000,
      capitalPaid: "by_the_month",
    });
    await owner.ventures.setBankAccount({ id: venture.id, ...ACCOUNT });
    const them = await signedUp("মাসিক", venture.id, 1);
    // The Cattle Part in, buying started: the Monthly Sums still come in, and a note of one waits.
    await owner.ventures.takeCapital({
      agreementId: them.agreementId,
      amountMoney: 40_000,
      movedOn: TODAY,
      paymentMethod: "bank",
      reference: "BEFTN গরুর অংশ",
    });
    await owner.ventures.startBuying({ id: venture.id });
    const sent = await them.client.portal.sendPayInNote(
      saying(them.agreementId, 2000)
    );
    expect(await theirNote(them, sent.id)).toMatchObject({ state: "waiting" });

    // The first Sale turns it to selling: no Monthly Sum is taken after that, so the note waits for nothing.
    const shed = await owner.sheds.create({ name: `মাসিক ${suffix}` });
    const pen = await owner.sheds.pens.create({
      quarantine: true,
      shedId: shed.id,
      name: `মাসিক পেন ${suffix}`,
    });
    const bull = await owner.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `প্রতিবেশী ${suffix}` },
      purchasePriceMoney: 30_000,
      weightKg: 200,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(JANUARY),
      ventureId: venture.id,
      targetWindowStart: "2094-06-01",
      targetWindowEnd: "2094-06-10",
      ...PAID_FROM_THE_ACCOUNT,
    });
    await owner.sales.record({
      tagNumber: bull.tagNumber,
      buyer: { name: `কসাই ${suffix}` },
      destination: "গাবতলী",
      vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৫",
      driver: "সোহেল",
      priceMoney: 40_000,
      weightKg: 210,
      paymentMethod: "bank",
      reference: `SALE-MONTHLY-${suffix}`,
    });

    expect(await theirNote(them, sent.id)).toMatchObject({
      state: "closed",
      closedBecause: "venture_takes_no_capital",
    });
    expect(await toldAbout("owner", venture.id)).toEqual([]);
  });
});

describe("the notes still to check", () => {
  beforeAll(async () => {
    await turn(true);
  });

  it("are counted on each Venture in the Owner's list: those waiting, and none answered or withdrawn", async () => {
    const ventureId = await aVenture("গোনা");
    const quiet = await aVenture("চুপচাপ");
    const them = await signedUp("গোনার জন", ventureId, 2);
    await them.client.portal.sendPayInNote(saying(them.agreementId, 10_000));
    await them.client.portal.sendPayInNote(saying(them.agreementId, 20_000));
    const withdrawn = await them.client.portal.sendPayInNote(
      saying(them.agreementId, 5000)
    );
    await them.client.portal.withdrawPayInNote({ noteId: withdrawn.id });
    const missing = await them.client.portal.sendPayInNote(
      saying(them.agreementId, 7000)
    );
    const owner = await as("owner");
    await owner.ventures.payInNotes.notFound({
      noteId: missing.id,
      line: "হিসাবে আসেনি",
    });
    const listed = await owner.ventures.list();
    expect(listed.find((one) => one.id === ventureId)?.payInNotesWaiting).toBe(
      2
    );
    expect(listed.find((one) => one.id === quiet)?.payInNotesWaiting).toBe(0);
  });
});

describe("the words a note keeps to", () => {
  it("are the same in the database and on the screens", () => {
    expect([...PAY_IN_WAYS]).toEqual([...WAYS_KEPT]);
    expect([...PAY_IN_NOTE_STATES]).toEqual([...STATES_KEPT]);
    expect([...PAY_IN_CLOSE_REASONS]).toEqual([...CLOSE_REASONS_KEPT]);
  });
});
