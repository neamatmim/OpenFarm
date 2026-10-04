/**
 * How the farm's people answer each piece of the Playbook, from what the seed knows of the herd: the Owner's
 * Playbook says what to record, and these say what was there to record.
 */
import { HEAT, STAYS_A_HEIFER } from "@OpenFarm/domain";

import { inThePenAt } from "../head-count-store";
import { bookAt } from "../medicine-count-store";
import type { Responder } from "./history";
import { RESPONDERS } from "./history";
import { addDays, onFarm } from "./runtime";
import {
  MINUTE,
  calvings,
  daysBetween,
  moveCow,
  shelfCount,
  shelfReason,
  sightings,
} from "./shared";
import type { Farm } from "./standing";

const WELL = "সুস্থ — চোখে পড়ার মতো কিছু নেই";
const NOT_CALVED = "এখনো বাচ্চা দেয়নি";

const STRAWS = [
  "HF-100% (আমেরিকান) — স্ট্র নং ২৪১৮-১১৭",
  "শাহীওয়াল — স্ট্র নং এসডব্লিউ-৩৩০৯",
  "জার্সি — স্ট্র নং জেএক্স-৯০২৪",
  "HF-75% (বিএলআরআই) — স্ট্র নং ৫৫১-০৯",
];
const TECHNICIANS = [
  "মোঃ সেলিম রেজা (এআই টেকনিশিয়ান, ব্র্যাক)",
  "আনোয়ার হোসেন (উপজেলা প্রাণিসম্পদ অফিস)",
];

/** The one animal a piece of work is about, for work raised by something that happened to her. */
const subjectOf = (board: Parameters<Responder>[2]["board"]) =>
  board.animals[0]?.tagNumber ??
  (board as unknown as { animal?: { tagNumber: string } }).animal?.tagNumber;

RESPONDERS.healthRound = (_step, beast, { herd, day }) => {
  if (!beast) {
    return null;
  }
  const seen = sightings.get(day)?.get(beast.tagNumber);
  if (seen) {
    return { evidence: [seen] };
  }
  const cow = herd.cows.get(beast.tagNumber);
  const cycling = cow?.state === "milking" || cow?.state === "heifer";
  if (cow?.nextHeat === day && cycling && !cow.expectedCalving) {
    return { evidence: [HEAT] };
  }
  return { skipReason: WELL };
};

RESPONDERS.insemination = (_step, _beast, { farm, herd, board }) => {
  const tag = subjectOf(board);
  const cow = tag ? herd.cows.get(tag) : undefined;
  if (cow) {
    cow.nextHeat = null;
    cow.conceives = farm.random.chance(cow.state === "heifer" ? 0.62 : 0.5);
  }
  return {
    evidence: [
      "ai",
      farm.random.pick(STRAWS),
      farm.random.pick(TECHNICIANS),
      farm.clock.now().toISOString(),
    ],
  };
};

RESPONDERS.pregnancyCheck = (_step, _beast, { farm, herd, day, board }) => {
  const tag = subjectOf(board);
  const cow = tag ? herd.cows.get(tag) : undefined;
  const positive = cow?.conceives ?? farm.random.chance(0.5);
  if (cow) {
    cow.conceives = null;
    if (positive) {
      cow.expectedCalving = addDays(day, 283 - 45);
    } else {
      cow.nextHeat = addDays(day, farm.random.int(4, 16));
    }
  }
  return { evidence: [positive ? "positive" : "negative"] };
};

RESPONDERS.dryOff = (_step, beast, { farm, herd }) => {
  const cow = beast ? herd.cows.get(beast.tagNumber) : undefined;
  if (cow) {
    cow.state = "dry";
    herd.followUps.push(async () => {
      if (cow.pen !== "dry" && cow.pen !== "calving") {
        await moveCow(farm, cow, "dry", "দুধ বন্ধের পর শুকনো গাভী পেনে");
      }
    });
  }
  return { evidence: [true] };
};

RESPONDERS.calvingPrep = (_step, beast, { farm, herd }) => {
  const cow = beast ? herd.cows.get(beast.tagNumber) : undefined;
  if (cow) {
    cow.pen = "calving";
  }
  return { evidence: [farm.pens.calving] };
};

RESPONDERS.calvingRecord = (_step, beast, { farm, herd, day }) => {
  if (!beast) {
    return null;
  }
  const cow = herd.cows.get(beast.tagNumber);
  if (!(cow && calvings.get(day)?.has(cow.tag))) {
    return { skipReason: NOT_CALVED };
  }
  const calvedAt = new Date(
    onFarm(day, "02:00").getTime() + farm.random.int(0, 180) * MINUTE
  );
  const ease = farm.random.chance(0.8)
    ? "unassisted"
    : farm.random.pick(["assisted", "assisted", "vet"]);
  const sex = farm.random.chance(0.5) ? "female" : "male";
  const outcome = farm.random.chance(0.94) ? "alive" : "stillborn";
  cow.state = "milking";
  cow.calvedOn = day;
  cow.expectedCalving = null;
  cow.nextHeat = addDays(day, farm.random.int(48, 75));
  return {
    evidence: [calvedAt.toISOString(), ease, sex, outcome, "", "", "", ""],
  };
};

RESPONDERS.weighIn = (_step, beast, { farm, herd, day }) => {
  if (!beast) {
    return null;
  }
  const bull = herd.bulls.get(beast.tagNumber);
  if (!bull || (bull.crushShyFrom && day >= bull.crushShyFrom)) {
    return { skipReason: "ক্রাশে ওঠেনি" };
  }
  const expected =
    bull.weightKg + bull.dailyGainKg * daysBetween(bull.arrivedOn, day);
  return {
    evidence: [Math.round(expected * farm.random.between(0.996, 1.004))],
  };
};

/** The gain each heifer keeps up, chosen the first time she is weighed: a few slowly enough to fall short of 250 kg by
 *  eighteen months, so the farm's list of heifers has some to name. */
const heiferGains = new WeakMap<Farm, Map<string, number>>();

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A heifer's monthly weight, grown from what she last weighed — her weaning weight, for one weaned here — or, never
 * weighed, from her birth at about 30 kg (18 for a deshi calf).
 */
RESPONDERS.heiferWeighIn = async (step, beast, { farm, day }) => {
  if (!beast) {
    return null;
  }
  if (step.id !== "weigh") {
    return { evidence: [true] };
  }
  const her = await farm.db.query.animal.findFirst({
    where: { farmId: farm.farmId, tagNumber: beast.tagNumber },
    columns: { birthDate: true },
    with: {
      breed: { columns: { deshi: true } },
      weighIns: {
        where: { flaggedNote: { isNull: true } },
        columns: { weightKg: true, weighedAt: true },
        orderBy: { weighedAt: "desc" },
        limit: 1,
      },
    },
  });
  const deshi = her?.breed?.deshi === true;
  const gains = heiferGains.get(farm) ?? new Map<string, number>();
  heiferGains.set(farm, gains);
  const gainKg =
    gains.get(beast.tagNumber) ??
    (deshi ? farm.random.between(0.2, 0.35) : farm.random.between(0.3, 0.55));
  gains.set(beast.tagNumber, gainKg);
  const now = onFarm(day, "07:00").getTime();
  const [last] = her?.weighIns ?? [];
  let weightKg = deshi ? 230 : 260;
  if (last) {
    weightKg =
      Number(last.weightKg) +
      (gainKg * (now - last.weighedAt.getTime())) / DAY_MS;
  } else if (her?.birthDate) {
    weightKg =
      (deshi ? 18 : 30) + (gainKg * (now - her.birthDate.getTime())) / DAY_MS;
  }
  return {
    evidence: [Math.round(weightKg * farm.random.between(0.99, 1.01))],
  };
};

const LOTS = {
  fmd: "এফএমডি লট নং LRI-FMD-2605-118",
  lsd: "এলএসডি লট নং LSDV-BD-2604-027",
  hs: "গলাফোলা লট নং LRI-HS-2606-044",
  bq: "বাদলা লট নং LRI-BQ-2606-019",
};

/** The vial a vaccination was given from, by what the procedure is for. */
const lotFor = (name: string): string => {
  if (name.includes("FMD")) {
    return LOTS.fmd;
  }
  if (name.includes("HS")) {
    return LOTS.hs;
  }
  if (name.includes("BQ")) {
    return LOTS.bq;
  }
  return LOTS.lsd;
};

const campaign: Responder = (step, _beast, { farm, board }) => {
  if (step.id === "lot") {
    return { evidence: [lotFor(board.content.name.en ?? "")] };
  }
  if (farm.random.chance(0.01)) {
    return { skipReason: "অসুস্থ — পরে দেওয়া হবে" };
  }
  return { evidence: [true, ""] };
};
RESPONDERS.fmdVaccination = campaign;
RESPONDERS.lsdVaccination = campaign;
RESPONDERS.deworming = campaign;

// The bought bull's chain: his doses on his own days, as the campaigns are given.
/** His own doses, as a campaign's are given — except to the bull taken unwell, whose doses are put off and so still owed:
 *  his Release will not go ahead until the Vet writes why they are not needed, or they are given. */
const hisDoses: Responder = (step, beast, context) => {
  const bull = beast ? context.herd.bulls.get(beast.tagNumber) : undefined;
  if (
    step.id === "dose" &&
    bull?.crushShyFrom &&
    context.day >= bull.crushShyFrom
  ) {
    return { skipReason: "অসুস্থ — পরে দেওয়া হবে" };
  }
  return campaign(step, beast, context);
};

RESPONDERS.arrivalDeworming = hisDoses;
RESPONDERS.arrivalFmd = hisDoses;
RESPONDERS.arrivalLsd = hisDoses;
RESPONDERS.hsVaccination = campaign;
RESPONDERS.bqVaccination = campaign;
RESPONDERS.fmdBooster = campaign;
RESPONDERS.dewormBooster = campaign;

RESPONDERS.arrivalCheck = (step, beast, { day }) => {
  if (step.id !== "look") {
    return { evidence: [true] };
  }
  const seen = beast ? sightings.get(day)?.get(beast.tagNumber) : undefined;
  return seen ? { evidence: [seen] } : { skipReason: WELL };
};

/** Within a month of his sale a bull is left unsprayed: the spray's meat withdrawal would hold the sale up. */
const SPRAY_CLEAR_OF_SALE_DAYS = 35;

RESPONDERS.tickSpray = (step, beast, { farm, herd, day }) => {
  if (step.id !== "spray") {
    return { evidence: [true] };
  }
  const bull = beast ? herd.bulls.get(beast.tagNumber) : undefined;
  const toSale = bull?.sellBy ? daysBetween(day, bull.sellBy) : null;
  if (toSale !== null && toSale >= 0 && toSale <= SPRAY_CLEAR_OF_SALE_DAYS) {
    return { skipReason: "এক মাসের মধ্যে বিক্রি — স্প্রে নয়" };
  }
  if (farm.random.chance(0.01)) {
    return { skipReason: "অসুস্থ — পরে দেওয়া হবে" };
  }
  return { evidence: [true] };
};

RESPONDERS.quarantineRelease = (step, beast, { farm, herd }) => {
  const bull = beast ? herd.bulls.get(beast.tagNumber) : undefined;
  // The bull that will not go up the crush is not well either: kept in at his Release, which comes round again a week on.
  if (bull?.crushShyFrom && (step.id === "healthy" || step.id === "release")) {
    return { skipReason: "অসুস্থ — কোয়ারেন্টিনে থাকবে" };
  }
  if (step.id === "release" && bull) {
    // The farm walks him to the Pen whose Ration suits his weight; the script's herd follows where he went.
    herd.followUps.push(async () => {
      const him = await farm.as.manager.animals.get({ tagNumber: bull.tag });
      const penKey = (
        Object.entries(farm.pens) as [keyof typeof farm.pens, string][]
      ).find(([, id]) => id === him.pen.id)?.[0];
      bull.state = "fattening";
      if (penKey) {
        bull.pen = penKey;
      }
    });
  }
  return { evidence: [true] };
};

RESPONDERS.shedDisinfection = () => ({ evidence: [true] });

RESPONDERS.preSale = (step, beast, { farm, herd, day }) => {
  if (step.id === "weigh") {
    const bull = beast ? herd.bulls.get(beast.tagNumber) : undefined;
    if (!bull) {
      return { skipReason: "ক্রাশে ওঠেনি" };
    }
    const expected =
      bull.weightKg + bull.dailyGainKg * daysBetween(bull.arrivedOn, day);
    return {
      evidence: [Math.round(expected * farm.random.between(0.996, 1.004))],
    };
  }
  // No photograph kept on the seed's farm: the certificate is handed over with the bull.
  return { evidence: [step.id === "papers" ? "" : true] };
};

RESPONDERS.treatmentDose = () => ({ evidence: [true] });

RESPONDERS.burial = (step) =>
  step.id === "bury"
    ? { evidence: [true, "খামারের পূর্ব কোণে ছয় ফুট গর্তে চুন দিয়ে পুঁতে দেওয়া হয়েছে"] }
    : null;

RESPONDERS.afterCalvingCheck = () => ({
  skipReason: "সুস্থ — চোখে পড়ার মতো কিছু নেই",
});

RESPONDERS.seeToUnwell = () => ({
  evidence: ["watching", "সন্ধ্যায় আবার দেখা হবে; না সারলে ডাক্তারকে ফোন"],
});

RESPONDERS.seeToUnwellUrgent = () => ({
  evidence: ["vet_called", "ডাক্তার সাহেবকে ফোন করা হয়েছে, এক ঘণ্টার মধ্যে আসছেন"],
});

RESPONDERS.dlsReport = () => ({
  evidence: [
    "স্মারক নং ৩৩.০১.২৬৭২.০০৩.১৮.৪১২.২৬ — উপজেলা প্রাণিসম্পদ কর্মকর্তা, সাভার বরাবর হাতে পৌঁছে দেওয়া হয়েছে",
  ],
});

RESPONDERS.stockCount = (_step, _beast, { board }) => ({
  evidence: [true],
  counts: (board.stockCount?.items ?? []).map((item) => ({
    feedItemId: item.feedItemId,
    counted: shelfCount.get(item.feedItemId) ?? 0,
    reason: shelfReason.get(item.feedItemId),
  })),
});

/**
 * The medicine store holds what its book says at the moment it is counted: every dose bought and not given by then.
 * Read as the count reads it, not as the Drug List does — the seed's work runs a few minutes apart, so a dose given
 * later that morning may already be written down.
 */
RESPONDERS.medicineCount = async (_step, _beast, { farm, board }) => {
  const book = await bookAt(farm.db, farm.farmId, farm.clock.now(), "");
  return {
    evidence: [true],
    medicineCounts: (board.medicineCount?.items ?? []).map((item) => ({
      drugProductId: item.drugProductId,
      counted: book.get(item.drugProductId)?.expected ?? 0,
    })),
  };
};

/** Every animal the register puts in the Pen at lock-up is standing in it. */
RESPONDERS.headCount = async (_step, _beast, { farm, board }) => {
  if (!board.penId) {
    return null;
  }
  const standing = await inThePenAt(
    farm.db,
    farm.farmId,
    board.penId,
    farm.clock.now()
  );
  return { evidence: [standing.length] };
};

/** The Manager's hand holds what the farm says it does: the bank tops it up before it runs dry (script.ts). */
RESPONDERS.cashCount = async (_step, _beast, { farm }) => {
  const [mine] = await farm.as.manager.cash.inHand();
  return { evidence: [mine?.amount ?? 0, ""] };
};

/** Half a litre at a time, as a bottle is filled. */
const toHalfLitre = (litres: number) => Math.round(litres * 2) / 2;

/** What each calf weighed at birth, so her colostrum can be a tenth of it. */
const birthWeights = new Map<string, number>();

/**
 * The newborn calf's first hours: well, dipped, weighed, fed a tenth of her weight, tagged. A calf born on the seed's
 * last day is left for the morning — her first colostrum is the late work on the Manager's list.
 */
RESPONDERS.newbornCalfCare = (step, beast, { farm, day }) => {
  if (!beast || day === farm.today) {
    return null;
  }
  switch (step.id) {
    case "well": {
      return { skipReason: "সুস্থ — শ্বাস নিচ্ছে, দাঁড়িয়েছে, দুধ টানছে" };
    }
    case "weigh": {
      const kg = toHalfLitre(farm.random.between(22, 34));
      birthWeights.set(beast.tagNumber, kg);
      return { evidence: [kg] };
    }
    case "colostrum": {
      // Now and then she is found already sucking her dam, and nobody knows how much she had.
      if (farm.random.chance(0.15)) {
        return {
          skipReason: "মায়ের বাঁট থেকে নিজে খেয়েছে — পরিমাণ জানা নেই",
        };
      }
      return {
        evidence: [toHalfLitre((birthWeights.get(beast.tagNumber) ?? 28) / 10)],
      };
    }
    default: {
      return { evidence: [true] };
    }
  }
};

RESPONDERS.newbornSecondFeed = (step, beast, { farm, day }) => {
  if (!beast || day === farm.today) {
    return null;
  }
  if (step.id === "navel") {
    return { skipReason: "ডোবানো হয়েছে — নাভি ঠিক আছে" };
  }
  return {
    evidence: [toHalfLitre((birthWeights.get(beast.tagNumber) ?? 28) / 20)],
  };
};

/** Weaned at three months: weighed, and a heifer calf stays a heifer while a bull calf goes to the lightest bulls. */
RESPONDERS.weaning = (step, beast, { farm }) => {
  if (!beast) {
    return null;
  }
  if (step.id === "weigh") {
    return { evidence: [Math.round(farm.random.between(55, 75))] };
  }
  if (step.id === "wean") {
    return {
      evidence: [beast.sex === "female" ? STAYS_A_HEIFER : farm.pens.bullsA],
    };
  }
  return { evidence: [true] };
};
