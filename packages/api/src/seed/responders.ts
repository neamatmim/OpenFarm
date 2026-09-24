/**
 * How the farm's people answer each piece of the Playbook, from what the seed knows of the herd: the Owner's
 * Playbook says what to record, and these say what was there to record.
 */
import { HEAT } from "@OpenFarm/domain";

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
  if (!bull) {
    return { skipReason: "ক্রাশে ওঠেনি" };
  }
  const expected =
    bull.weightKg + bull.dailyGainKg * daysBetween(bull.arrivedOn, day);
  return {
    evidence: [Math.round(expected * farm.random.between(0.996, 1.004))],
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
RESPONDERS.arrivalDeworming = campaign;
RESPONDERS.arrivalFmd = campaign;
RESPONDERS.arrivalLsd = campaign;
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
  if (step.id === "release" && bull) {
    // The farm walks him to the Pen whose Ration suits his weight; the script's herd follows where he went.
    herd.followUps.push(async () => {
      const him = await farm.as.manager.animals.byTag({ tagNumber: bull.tag });
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
