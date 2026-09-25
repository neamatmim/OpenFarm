/* oxlint-disable no-await-in-loop -- a Venture's acts happen one after another, in the order they happened */
import { farmDayOf } from "@OpenFarm/domain";

import { balanceAtMonthEnd } from "../venture-store";
import type { Bull, Herd } from "./herd";
import type { Happening } from "./history";
import {
  SEED_PASSWORD,
  addDays,
  nobodyClientOf,
  onFarm,
  portalClientOf,
} from "./runtime";
import { CATTLE_BUYERS, breedIdNamed, daysBetween } from "./shared";
import type { Farm } from "./standing";

/**
 * The farm's Ventures: other people's money, buying and fattening cattle that stand in the same Pens as
 * the farm's own.
 *
 * Two of them, because one is not enough to look at. **কোরবানি ২০২৬** has run its course — bought, fed,
 * sold, reconciled, settled and paid out — so that the Settlement, the payouts, the Acknowledgements and
 * the হিসাব নিকাশ have something to draw. **ঈদ ২০২৭** is still fattening, with its Target Window next
 * year, so that the Venture card, the অগ্রগতি and the monthly Reimbursement have something to draw too.
 *
 * Everything here goes through the API on the farm's own clock, as the rest of the seed does. Nothing is
 * written into a table — so every rule the app has about Ventures is a rule this has to keep, and a seed
 * that runs is itself an end-to-end test of the whole arc.
 */

/** The one photograph that stands in for every stamped agreement: a 1×1 JPEG. The app refuses capital
 *  without one, and what it holds is a photo of the instrument, not the instrument. */
const A_STAMPED_PAPER =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

/** The people whose money is in. A known circle, as the law requires — neighbours, a brother-in-law, the
 *  pharmacy man in the bazaar — and every one of them with a nominee, because the agreement asks. */
const INVESTORS = [
  {
    name: "আবুল হাশেম মিয়া",
    phone: "01711-223344",
    address: "বিরুলিয়া বাজার, সাভার, ঢাকা",
    nid: "1994 7712 334455",
    bankAccount: "ডাচ্-বাংলা ব্যাংক · 1051 0023 44781",
    nominee: { name: "রোকেয়া বেগম", phone: "01911-223344", relation: "স্ত্রী" },
  },
  {
    name: "মোঃ শাহজাহান সরকার",
    phone: "01715-889012",
    address: "আশুলিয়া, ঢাকা",
    nid: "1988 4410 227719",
    bankAccount: "ইসলামী ব্যাংক · 2050 1177 09923",
    nominee: { name: "সাবিনা ইয়াসমিন", phone: "01715-889013", relation: "স্ত্রী" },
  },
  {
    name: "ডাঃ নুরুল আমিন",
    phone: "01819-445566",
    address: "ধামরাই, ঢাকা",
    nid: "1979 3302 118844",
    bankAccount: "ব্র্যাক ব্যাংক · 1501 2299 33410",
    nominee: { name: "তানভীর আমিন", phone: "01819-445567", relation: "ছেলে" },
  },
  {
    name: "হাজী আব্দুল মালেক",
    phone: "01818-771203",
    address: "কালিয়াকৈর, গাজীপুর",
    nid: "1971 5590 662211",
    bankAccount: "সোনালী ব্যাংক · 0102 3344 55661",
    nominee: { name: "মরিয়ম বিবি", phone: "01818-771204", relation: "স্ত্রী" },
  },
  {
    name: "ইঞ্জিনিয়ার রফিকুল ইসলাম",
    phone: "01712-330099",
    address: "উত্তরা সেক্টর ১১, ঢাকা",
    nid: "1985 2207 889933",
    bankAccount: "সিটি ব্যাংক · 3301 5566 77882",
    nominee: { name: "নাসরিন আক্তার", phone: "01712-330098", relation: "স্ত্রী" },
  },
] as const;

/** The farm's own share of the profit, and so the Investors' — one split per Venture, frozen at signing. */
const INVESTORS_PERCENT = 60;

const ARBITRATOR = "মাওলানা ইদ্রিস আলী, বিরুলিয়া জামে মসজিদ";

/**
 * The days the finished Venture sells up and closes its books on, worked from the turn of the month.
 *
 * A Settlement covers every month the Venture ran **including the one it is settled in**, and a month
 * still running cannot be reimbursed — so a Venture whose animals were still eating this month could
 * never close at all. They go before the month turns; the books are shut a few days after it.
 */
export const closingDays = (today: string) => {
  const monthTurned = `${today.slice(0, "YYYY-MM".length)}-01`;
  return {
    readyOn: addDays(monthTurned, -8),
    wentOn: addDays(monthTurned, -6),
    settledOn: addDays(monthTurned, 4),
    /** The Target Window it was bought to sell in, which its Sales fall inside. */
    window: {
      start: addDays(monthTurned, -7),
      end: addDays(monthTurned, -1),
    },
  };
};

/** What the seed keeps of a Venture so the days after it can find it again. */
export interface SeededVenture {
  id: string;
  name: string;
  /** Each Agreement, so a payout and an Acknowledgement can name one. */
  agreements: { id: string; units: number; investor: string }[];
  /** Its animals' tags, so the Sales and the selling trip know whose they are. */
  tags: string[];
  /** The month it opened in, so every month from then is bank-checked. */
  openedIn: string;
  /** The months whose paperwork has been kept, so the catch-up before settling does not try to
   *  reimburse one twice — which the app refuses, rightly. */
  kept: Set<string>;
}

/** One Investor signed onto a Venture: recorded, signed for, the stamped paper kept, and the money in. */
const signOn = async (
  farm: Farm,
  ventureId: string,
  who: (typeof INVESTORS)[number],
  {
    units,
    unitPriceBdt,
    on,
  }: { units: number; unitPriceBdt: number; on: string }
) => {
  farm.clock.set(onFarm(on, "10:30"));
  const person = await farm.as.owner.investors.record({
    name: who.name,
    phone: who.phone,
    address: who.address,
    nid: who.nid,
    bankAccount: who.bankAccount,
    nominee: { ...who.nominee },
  });
  const agreement = await farm.as.owner.ventures.sign({
    ventureId,
    investorId: person.id,
    units,
    investorsPercent: INVESTORS_PERCENT,
    arbitrator: ARBITRATOR,
    stampValueBdt: 300,
    stampedOn: on,
    stampSerial: `AA-${farm.random.int(100_000, 999_999)}`,
  });
  // No capital is taken until the farm holds a photo of the stamped instrument. The app refuses
  // otherwise, which is why this is here and not an afterthought.
  await farm.as.owner.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: A_STAMPED_PAPER,
  });
  farm.clock.set(onFarm(on, "11:15"));
  await farm.as.owner.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: units * unitPriceBdt,
    movedOn: on,
    paymentMethod: "bank",
    // What the bank printed, with the Pay-in Code the Investor wrote on the transfer inside it.
    reference: `BEFTN ${agreement.payInCode} TRF-${farm.random.int(100_000, 999_999)}`,
  });
  return { id: agreement.id, units, investor: who.name };
};

/**
 * Opens a Venture, signs its Investors on, takes their money and starts it buying.
 *
 * The order is the app's, not a convenience: Units are fixed once buying starts, so everybody signs
 * first, and capital is refused without the stamped paper.
 */
const openAVenture = async (
  farm: Farm,
  plan: {
    name: string;
    openedOn: string;
    signedOn: string;
    buyingFrom: string;
    targetCapitalBdt: number;
    unitPriceBdt: number;
    units: number;
    cattleBudgetBdt: number;
    decideBy: string;
    targetWindowStart: string;
    targetWindowEnd: string;
    takenBy: readonly { who: number; units: number }[];
  }
): Promise<SeededVenture> => {
  farm.clock.set(onFarm(plan.openedOn, "09:30"));
  const venture = await farm.as.owner.ventures.open({
    name: plan.name,
    targetCapitalBdt: plan.targetCapitalBdt,
    unitPriceBdt: plan.unitPriceBdt,
    units: plan.units,
    cattleBudgetBdt: plan.cattleBudgetBdt,
    decideBy: plan.decideBy,
    targetWindowStart: plan.targetWindowStart,
    targetWindowEnd: plan.targetWindowEnd,
  });
  const agreements: SeededVenture["agreements"] = [];
  for (const [index, taken] of plan.takenBy.entries()) {
    const who = INVESTORS[taken.who];
    if (!who) {
      continue;
    }
    agreements.push(
      await signOn(farm, venture.id, who, {
        units: taken.units,
        unitPriceBdt: plan.unitPriceBdt,
        on: addDays(plan.signedOn, index),
      })
    );
  }
  farm.clock.set(onFarm(plan.buyingFrom, "08:00"));
  await farm.as.owner.ventures.startBuying({ id: venture.id });
  return {
    id: venture.id,
    name: plan.name,
    agreements,
    tags: [],
    openedIn: plan.openedOn.slice(0, "YYYY-MM".length),
    kept: new Set<string>(),
  };
};

/**
 * A lorry bought on a Venture's money: the Float drawn before it, the beasts taken in against it, and
 * what did not get spent banked again the same evening.
 *
 * Cattle are bought from a reconciled Float and from nothing else, so this is the only way a Venture
 * gets an animal — and an open Float is one of the five things that will not let it settle.
 */
const buyOnTheVenture = async (
  farm: Farm,
  herd: Herd,
  venture: SeededVenture,
  {
    on,
    count,
    floatBdt,
    window,
  }: {
    on: string;
    count: number;
    floatBdt: number;
    window: { start: string; end: string };
  }
): Promise<void> => {
  farm.clock.set(onFarm(on, "05:30"));
  const day = {
    brokerBdt: count * farm.random.int(250, 400),
    transportBdt: farm.random.int(6000, 11_000),
    keepBdt: farm.random.int(900, 1800),
  };
  const trip = await farm.as.manager.trips.record({
    wentTo: "গাবতলী গরুর হাট, ঢাকা",
    ...day,
    wentOn: onFarm(on, "05:30"),
    paymentMethod: "cash",
  });
  farm.clock.set(onFarm(on, "06:00"));
  await farm.as.owner.ventures.drawFloat({
    ventureId: venture.id,
    buyingTripId: trip.id,
    amountBdt: floatBdt,
    movedOn: on,
    paymentMethod: "bank",
    reference: `FLT-${farm.random.int(100_000, 999_999)}`,
  });
  let spent = 0;
  for (let index = 0; index < count; index += 1) {
    farm.clock.set(
      new Date(onFarm(on, "15:00").getTime() + index * 5 * 60_000)
    );
    // Kept inside what the Float can cover: six beasts at the top of this range still come in under
    // the Cattle Budget drawn for them, and the app refuses the lorry that spends more than was drawn.
    const weightKg = farm.random.int(205, 265);
    const price =
      Math.round((weightKg * farm.random.between(440, 495)) / 500) * 500;
    const hasil =
      Math.round((price * farm.random.between(0.03, 0.045)) / 50) * 50;
    const breed = farm.random.pick([
      "ব্রাহমা ক্রস",
      "দেশি",
      "পাবনা ক্যাটল",
      "শাহীওয়াল ক্রস",
    ]);
    const recorded = await farm.as.manager.intake.record({
      penId: farm.pens.quarantine,
      sex: "male",
      seller: {
        name: "মোঃ হানিফ ব্যাপারী",
        address: "গাবতলী গরুর হাট, ঢাকা",
        phone: "01819-224571",
      },
      purchasePriceBdt: price,
      hasilBdt: hasil,
      buyingTripId: trip.id,
      weightKg,
      estimatedAgeMonths: farm.random.int(17, 26),
      breedId: await breedIdNamed(farm.as.manager, breed),
      paymentMethod: "cash",
      // What makes her the Venture's rather than the Farm's, set at Intake and only correctable inside
      // the window — and the Window she is being bought to sell in.
      ventureId: venture.id,
      targetWindowStart: window.start,
      targetWindowEnd: window.end,
    });
    spent += price + hasil;
    const bull: Bull = {
      tag: recorded.tagNumber,
      pen: "quarantine",
      breed,
      weightKg,
      dailyGainKg: farm.random.between(0.7, 1.15),
      arrivedOn: on,
      state: "quarantine",
    };
    herd.bulls.set(bull.tag, bull);
    venture.tags.push(bull.tag);
  }
  farm.clock.set(onFarm(on, "19:30"));
  // What went to the haat and did not get spent goes back in the same evening, and the Float is closed.
  // The beasts *and* the day itself came out of it — the broker, the lorry and keeping the men who went
  // — and the app refuses a count that does not balance to the taka, which is the whole point of it.
  const spentOnTheDay = day.brokerBdt + day.transportBdt + day.keepBdt;
  await farm.as.owner.ventures.reconcileFloat({
    buyingTripId: trip.id,
    cashBackBdt: floatBdt - spent - spentOnTheDay,
    movedOn: on,
    reference: `DEP-${farm.random.int(100_000, 999_999)}`,
  });
};

/** Every whole month from the one a Venture opened in up to (and including) the month before `until`. */
const monthsBetween = (from: string, until: string): string[] => {
  const months: string[] = [];
  const last = until.slice(0, "YYYY-MM".length);
  for (
    const cursor = new Date(`${from}-01T06:00:00.000Z`);
    cursor.toISOString().slice(0, 7) < last;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  ) {
    months.push(cursor.toISOString().slice(0, 7));
  }
  return months;
};

/**
 * What the Venture's animals ate and were dosed with that month, paid back to the Farm that bought it.
 *
 * The figure is the one the app works out, asked for exactly as the sheet asks it — the amount is
 * refused if it is not what the month now comes to, so there is nothing here to invent. Once only: a
 * month reimbursed twice is refused, rightly, and the catch-up before settling walks the same months
 * again.
 */
const reimburseTheMonth = async (
  farm: Farm,
  venture: SeededVenture,
  month: string,
  on: string
): Promise<void> => {
  if (venture.kept.has(month)) {
    return;
  }
  venture.kept.add(month);
  farm.clock.set(onFarm(on, "11:00"));
  const owed = await farm.as.owner.ventures.consumption({
    ventureId: venture.id,
    month,
  });
  if (owed.totalBdt <= 0) {
    return;
  }
  await farm.as.owner.ventures.reimburse({
    ventureId: venture.id,
    month,
    amountBdt: owed.totalBdt,
    movedOn: on,
    paymentMethod: "bank",
    reference: `RMB-${month}-${farm.random.int(1000, 9999)}`,
  });
};

/**
 * The bank statement read against what the farm believes the account held at that month's end.
 *
 * She reads the figure the app expects, so the month agrees — a seed that invented a reading would be
 * inventing a disagreement and calling it a farm. Safe to do again: a month re-read after a movement
 * landed in it is exactly how a **stale** month comes right, and a Settlement will not close while one
 * is still out.
 */
const readTheStatement = async (
  farm: Farm,
  venture: SeededVenture,
  month: string,
  on: string
): Promise<void> => {
  farm.clock.set(onFarm(on, "11:30"));
  const expected = await balanceAtMonthEnd(
    farm.db,
    farm.farmId,
    venture.id,
    month
  );
  await farm.as.owner.ventures.checkTheBank({
    ventureId: venture.id,
    month,
    readBdt: expected,
  });
};

/** The month's paperwork as the Owner does it: what is owed goes back, then the statement is read. */
const keepTheMonth = async (
  farm: Farm,
  venture: SeededVenture,
  month: string,
  on: string
): Promise<void> => {
  await reimburseTheMonth(farm, venture, month, on);
  await readTheStatement(farm, venture, month, on);
};

/** Takes a Venture's animals to the haat and sells them, one after another over a few days. */
const sellTheVenture = async (
  farm: Farm,
  herd: Herd,
  venture: SeededVenture,
  { readyOn, wentOn }: { readyOn: string; wentOn: string }
): Promise<void> => {
  const standing = venture.tags
    .map((tag) => herd.bulls.get(tag))
    .filter(
      (bull): bull is Bull => bull !== undefined && bull.state === "fattening"
    );
  farm.clock.set(onFarm(readyOn, "12:00"));
  for (const bull of standing) {
    await farm.as.manager.ready.confirm({ tagNumber: bull.tag });
    bull.state = "ready_for_sale";
  }
  if (standing.length === 0) {
    return;
  }
  farm.clock.set(onFarm(wentOn, "05:30"));
  await farm.as.manager.sellingTrips.record({
    wentTo: "গাবতলী পশুর হাট, ঢাকা",
    transportBdt: farm.random.int(7000, 9500),
    keepBdt: farm.random.int(1200, 2200),
    animals: standing.map((bull) => bull.tag),
    wentOn: onFarm(wentOn, "05:30"),
    paymentMethod: "cash",
  });
  for (const [index, bull] of standing.entries()) {
    const day = addDays(wentOn, Math.floor(index / 2));
    farm.clock.set(onFarm(day, `${10 + (index % 2) * 3}:30`));
    const weightKg = Math.round(
      bull.weightKg + bull.dailyGainKg * daysBetween(bull.arrivedOn, day)
    );
    const buyer = farm.random.pick(CATTLE_BUYERS);
    await farm.as.manager.sale.record({
      tagNumber: bull.tag,
      buyer,
      priceBdt:
        Math.round((weightKg * farm.random.between(575, 640)) / 1000) * 1000,
      weightKg,
      destination: buyer.address,
      vehicle: `ঢাকা মেট্রো-ন ${farm.random.int(11, 19)}-${farm.random.int(1000, 9999)}`,
      driver: farm.random.pick(["মোঃ হাবিব", "সোহেল রানা", "আব্দুর রহিম"]),
      paymentMethod: "bank",
    });
    bull.state = "sold";
  }
};

/**
 * The end of it: the Owner approves what the Settlement says, sends each man his money by bank, takes
 * the Farm's own share out, and writes down who has said he had his.
 *
 * One Investor is left without an Acknowledgement on purpose. The screen exists to show the Owner who
 * has confirmed and who has not, and a list where everybody has confirmed never shows the half of it
 * she actually looks for.
 */
const settleUp = async (
  farm: Farm,
  venture: SeededVenture,
  on: string
): Promise<void> => {
  // Every complete month of its life, brought up to date on the day she closes the books: what its
  // animals ate in its last months, and the statement read again for the months a Sale landed in after
  // they were first read. A Settlement will not close while one month is still out — not a month that
  // disagrees, not one that went stale, and not one nobody has opened.
  for (const month of monthsBetween(venture.openedIn, on)) {
    await reimburseTheMonth(farm, venture, month, on);
  }
  for (const month of monthsBetween(venture.openedIn, on)) {
    await readTheStatement(farm, venture, month, on);
  }
  farm.clock.set(onFarm(on, "10:00"));
  await farm.as.owner.ventures.approveSettlement({
    ventureId: venture.id,
    note: "হিসাব মিলিয়ে দেখা হয়েছে; সব পশু বিক্রি, ব্যাংকও মিলেছে।",
  });
  const approved = await farm.as.owner.ventures.approvedSettlement({
    ventureId: venture.id,
  });
  if (!approved) {
    return;
  }
  if (approved.advanceBdt > 0) {
    farm.clock.set(onFarm(on, "10:30"));
    await farm.as.owner.ventures.repayAdvance({
      ventureId: venture.id,
      movedOn: on,
      paymentMethod: "bank",
      reference: `ADV-BACK-${farm.random.int(1000, 9999)}`,
    });
  }
  for (const [index, share] of approved.shares.entries()) {
    const day = addDays(on, index === 0 ? 0 : 1);
    farm.clock.set(onFarm(day, `${11 + index}:00`));
    await farm.as.owner.ventures.paySettlement({
      ventureId: venture.id,
      agreementId: share.agreementId,
      amountBdt: share.payoutBdt,
      movedOn: day,
      paymentMethod: "bank",
      reference: `OUT-${farm.random.int(100_000, 999_999)}`,
    });
  }
  // Two of the three say they had it; the third has not been reached yet.
  for (const share of approved.shares.slice(0, -1)) {
    farm.clock.set(onFarm(addDays(on, 2), "09:30"));
    await farm.as.owner.ventures.acknowledgePayout({
      ventureId: venture.id,
      agreementId: share.agreementId,
      note: "ফোনে জানিয়েছেন, টাকা পেয়েছেন।",
    });
  }
  // The Farm's own share leaves too: its money never stays in a Venture Account, so a settled one
  // reads nothing. A run that made the Farm nothing has nothing to take.
  if (approved.farmBdt > 0) {
    farm.clock.set(onFarm(addDays(on, 2), "16:00"));
    await farm.as.owner.ventures.takeTheFarmsShare({
      ventureId: venture.id,
      movedOn: addDays(on, 2),
      paymentMethod: "bank",
      reference: `FARM-${farm.random.int(1000, 9999)}`,
    });
  }
};

/**
 * Both Ventures, opened and bought before the farm's history window starts — a fattening run is longer
 * than the ninety days the seed lives through, so the beginning of each has to be behind us already.
 */
export const openTheVentures = async (
  farm: Farm,
  herd: Herd
): Promise<{ settling: SeededVenture; running: SeededVenture }> => {
  const { start, today } = farm;
  const closing = closingDays(today);
  const settling = await openAVenture(farm, {
    name: "কোরবানি ২০২৬ ভেঞ্চার",
    openedOn: addDays(start, -10),
    signedOn: addDays(start, -9),
    buyingFrom: addDays(start, -6),
    targetCapitalBdt: 1_200_000,
    unitPriceBdt: 50_000,
    units: 24,
    cattleBudgetBdt: 900_000,
    decideBy: addDays(start, -7),
    targetWindowStart: closing.window.start,
    targetWindowEnd: closing.window.end,
    takenBy: [
      { who: 0, units: 10 },
      { who: 1, units: 8 },
      { who: 2, units: 6 },
    ],
  });
  await buyOnTheVenture(farm, herd, settling, {
    on: addDays(start, -5),
    count: 6,
    floatBdt: 900_000,
    window: closing.window,
  });

  const running = await openAVenture(farm, {
    name: "ঈদ ২০২৭ ভেঞ্চার",
    openedOn: addDays(start, -8),
    signedOn: addDays(start, -7),
    buyingFrom: addDays(start, -4),
    targetCapitalBdt: 1_000_000,
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 750_000,
    decideBy: addDays(start, -5),
    targetWindowStart: addDays(today, 150),
    targetWindowEnd: addDays(today, 160),
    takenBy: [
      { who: 3, units: 12 },
      { who: 4, units: 8 },
    ],
  });
  // The finished Venture's animals are made ready before the month turns: their last month goes unsprayed.
  for (const tag of settling.tags) {
    const bull = herd.bulls.get(tag);
    if (bull) {
      bull.sellBy = closing.readyOn;
    }
  }
  await buyOnTheVenture(farm, herd, running, {
    on: addDays(start, -3),
    count: 5,
    floatBdt: 750_000,
    window: {
      start: addDays(today, 150),
      end: addDays(today, 160),
    },
  });
  return { settling, running };
};

/**
 * One of the farm's Investors let into the portal, taking the invitation up with the seed's password, and asking to
 * join a Venture the farm is showing. Answers with the Request's id.
 */
const anInvestorAsks = async (
  f: Farm,
  who: (typeof INVESTORS)[number],
  ventureId: string,
  asked: { units: number; note: string }
): Promise<string> => {
  const them = await f.db.query.investor.findFirst({
    where: { farmId: f.farmId, name: who.name, phone: who.phone },
    columns: { id: true },
  });
  if (!them) {
    throw new Error(`${who.name} was never written down`);
  }
  const { code } = await f.as.owner.investors.inviteToPortal({ id: them.id });
  const nobody = await nobodyClientOf(f.db, f.clock);
  const { loginEmail } = await nobody.portal.join({
    phone: who.phone,
    code,
    password: SEED_PASSWORD,
  });
  const investor = await portalClientOf(f.db, loginEmail, f.clock);
  const { id } = await investor.portal.requestToJoin({ ventureId, ...asked });
  return id;
};

/**
 * What happens to the two Ventures as the ninety days go by: quarantine ends, the month's paperwork is
 * kept, one Venture's animals go to the haat and its books are closed, and the Owner puts her own money
 * into the other when its Running Budget gets thin.
 */
export const runTheVentures = (
  farm: Farm,
  ventures: { settling: SeededVenture; running: SeededVenture },
  on: (day: string, time: string, what: string, run: Happening["run"]) => void
): void => {
  const { start, today } = farm;
  const { settling, running } = ventures;
  /**
   * When the finished Venture sells up and closes its books.
   *
   * Worked from the first of this month rather than counted back from today, because a Settlement
   * covers every month the Venture ran **including the one it is settled in** — and a month still
   * running cannot be reimbursed, so a Venture whose animals were still eating this month could never
   * close at all. They go before the month turns; the books are shut a few days after it.
   */
  const { readyOn, wentOn, settledOn } = closingDays(today);

  // Its bulls out of Quarantine, thirty days on, released by the Playbook to the Pens whose Rations suit their weight
  // — the ordinary fattening pens, beside the Farm's own, since costs follow the animal and not the Pen. Then the
  // Venture is feeding them: its Units are long since fixed, and a Venture left in Buying would never reach Selling
  // on its first Sale.
  for (const [venture, day] of [
    [settling, addDays(start, 26)],
    [running, addDays(start, 28)],
  ] as const) {
    on(day, "10:30", `${venture.name} out of quarantine`, async (f) => {
      await f.as.owner.ventures.startFattening({ id: venture.id });
    });
  }

  // The next run, opened a few days ago and still gathering capital, shown to the farm's invited Investors with a
  // line of the Owner's (ADR 0008) — so the portal's page of Ventures raising capital has one to show.
  let nextId = "";
  on(
    addDays(today, -3),
    "10:00",
    "the next Venture is opened and shown",
    async (f) => {
      const next = await f.as.owner.ventures.open({
        name: "কোরবানি ২০২৭ ভেঞ্চার",
        targetCapitalBdt: 1_500_000,
        unitPriceBdt: 50_000,
        units: 30,
        cattleBudgetBdt: 1_100_000,
        decideBy: addDays(today, 25),
        targetWindowStart: addDays(today, 200),
        targetWindowEnd: addDays(today, 210),
      });
      await f.as.owner.ventures.showInPortal({
        id: next.id,
        words: "২০২৭ সালের ঈদুল আযহার জন্য দেশি ষাঁড়, সাভারের শেডে।",
      });
      nextId = next.id;
    }
  );

  // Two of the farm's Investors, let into the portal the evening before, ask to join it — so the Venture-to-join page,
  // their own lists and the Owner's Requests have one waiting and one answered. They sign in with their phone and the
  // seed's password.
  on(
    addDays(today, -1),
    "20:30",
    "Investors ask to join the next Venture",
    async (f) => {
      await f.as.owner.investors.setPortalOpen({ open: true });
      const [waiting, answered] = INVESTORS;
      await anInvestorAsks(f, waiting, nextId, {
        units: 4,
        note: "ঈদের পরে বাকি টাকা দিতে পারব।",
      });
      const promised = await anInvestorAsks(f, answered, nextId, {
        units: 6,
        note: "",
      });
      // The Owner says come and sign, for five of the six: the rest are for somebody she has already promised.
      await f.as.owner.ventures.answerRequest({
        requestId: promised,
        answer: { kind: "come_and_sign", units: 5 },
      });
    }
  );

  // The Owner's own money, interest-free, when what was set aside to keep them runs thin. Repaid at
  // cost before anybody's capital comes back — which the Settlement does.
  on(
    addDays(today, -47),
    "14:00",
    "the Owner advances her own money",
    async (f) => {
      await f.as.owner.ventures.advance({
        ventureId: running.id,
        amountBdt: 60_000,
        movedOn: addDays(today, -47),
        paymentMethod: "bank",
        reference: `ADV-${f.random.int(100_000, 999_999)}`,
      });
    }
  );

  // Selling: ready, the lorry, and the beasts sold one after another over three days. Well clear of the
  // lumpy-skin campaign at `start + 40`, whose vaccine keeps a beast off the meat market for twenty-one
  // days — the farm will not confirm one ready inside her withdrawal, and nor should it.
  on(readyOn, "12:00", "the Venture's bulls are ready", (f, h) =>
    sellTheVenture(f, h, settling, { readyOn, wentOn })
  );

  // The month's paperwork for both, on the fourth of the month after. The settled one stops once it is
  // settled; the running one keeps going.
  for (const month of monthsBetween(settling.openedIn, farmDayOf(new Date()))) {
    const keptOn = addDays(`${month}-01`, 34);
    if (keptOn < start || keptOn > today) {
      continue;
    }
    for (const venture of [settling, running]) {
      // Nothing before it opened, and nothing for a run whose books are shut: a settled Venture pays
      // for nothing more, and the app refuses the month that tries. Its own last months are brought up
      // to date by the Settlement itself, on the day it closes them.
      const tooLate = venture === settling && keptOn > settledOn;
      if (month < venture.openedIn || tooLate) {
        continue;
      }
      on(keptOn, "11:00", `${venture.name}: ${month}`, (f) =>
        keepTheMonth(f, venture, month, keptOn)
      );
    }
  }

  // The books are closed: every month brought up to date first, then approved, paid and acknowledged.
  on(settledOn, "10:00", "the Settlement is approved and paid", (f) =>
    settleUp(f, settling, settledOn)
  );
};
