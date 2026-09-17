// PROTOTYPE — throwaway. Made-up figures for one Venture, to react to. Nothing here is a real farm record.

/** Bangla numerals with Bangladeshi grouping: 2000000 → ২০,০০,০০০ */
export const bn = (n: number): string => {
  const [whole, frac] = Math.abs(n).toFixed(0).split(".");
  const s = whole ?? "0";
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest
    ? `${rest.replaceAll(/\B(?=(?<pair>\d{2})+(?!\d))/gu, ",")},${last3}`
    : last3;
  const bangla = (n < 0 ? `−${grouped}` : grouped).replaceAll(
    /\d/gu,
    (d) => "০১২৩৪৫৬৭৮৯"[Number(d)] ?? d
  );
  return frac ? `${bangla}.${frac}` : bangla;
};

export const taka = (n: number): string => `৳ ${bn(n)}`;

export const FARM = {
  name: "মিম ডেইরি অ্যান্ড ফ্যাটেনিং ফার্ম",
  address: "গ্রাম: শালিখা, ডাক: কাশিমপুর, উপজেলা: সদর, জেলা: ময়মনসিংহ",
  phone: "০১৭১১-XXXXXX",
  registration: "DLS/MYM/2023/0418",
};

export const VENTURE = {
  name: "ঈদ ২০২৭ ভেঞ্চার",
  nameEn: "Eid 2027 Venture",
  opened: "১৫ আগস্ট ২০২৬",
  unitPrice: 50_000,
  units: 40,
  capital: 40 * 50_000,
  cattleBudget: 1_500_000,
  runningBudget: 500_000,
  window: "ঈদুল আজহা ২০২৭ (২৮ এপ্রিল – ১২ মে)",
  windUpDays: 30,
  splitInvestors: 60,
  splitFarm: 40,
  animals: 22,
  investors: 6,
  arbitrator: "মাওলানা আব্দুল হক, সভাপতি, বাজার কমিটি",
};

export const INVESTOR = {
  name: "করিম উদ্দিন আহমেদ",
  phone: "০১৮XX-XXXXXX",
  address: "১২/বি, নতুন বাজার রোড, ময়মনসিংহ",
  nid: "১৯৮৪XXXXXXXXXXXX",
  bank: "ইসলামী ব্যাংক, ময়মনসিংহ শাখা · হিসাব ****৪৭২১",
  nominee: "রাহেলা খাতুন (স্ত্রী) · ০১৯XX-XXXXXX",
  units: 3,
  paid: 150_000,
  paidOn: "২২ আগস্ট ২০২৬",
  bankRef: "IBBL/TRF/2026/884120",
  stamp: { value: 300, date: "২০ আগস্ট ২০২৬", serial: "AA ৭৭৪৫৩১" },
};

/** Where the Venture stands today — the progress statement's numbers. */
export const PROGRESS = {
  asOf: "১৮ ফেব্রুয়ারি ২০২৭",
  daysOnFeed: 168,
  daysToWindow: 69,
  alive: 21,
  died: 1,
  avgIntakeKg: 212,
  avgNowKg: 331,
  adg: 0.71,
  spent: { cattle: 1_480_000, feed: 312_000, medicine: 41_000, other: 19_000 },
  animals: [
    { tag: "F-0231", intakeKg: 208, nowKg: 342, adg: 0.8 },
    { tag: "F-0232", intakeKg: 221, nowKg: 351, adg: 0.77 },
    { tag: "F-0233", intakeKg: 196, nowKg: 305, adg: 0.65 },
    { tag: "F-0234", intakeKg: 234, nowKg: 358, adg: 0.74 },
    { tag: "F-0235", intakeKg: 201, nowKg: 297, adg: 0.57 },
    { tag: "F-0236", intakeKg: 215, nowKg: 339, adg: 0.74 },
  ],
};

/** The settled Venture. Profit = sales − everything charged. Capital returns whole before profit exists. */
export const SETTLEMENT = {
  approvedOn: "২৮ মে ২০২৭",
  sales: 2_639_500,
  internalSale: 120_000,
  cattle: 1_420_000,
  hasil: 42_000,
  buyingTrips: 18_000,
  feed: 380_000,
  doses: 34_000,
  vet: 22_000,
  herdCosts: 24_000,
  sellingTrips: 35_000,
  advanceRepaid: 50_000,
  soldHead: 20,
  boughtBackHead: 1,
  diedHead: 1,
};

const S = SETTLEMENT;
export const proceeds = S.sales + S.internalSale;
export const charged =
  S.cattle +
  S.hasil +
  S.buyingTrips +
  S.feed +
  S.doses +
  S.vet +
  S.herdCosts +
  S.sellingTrips;
export const profit = proceeds - charged;
export const investorsProfit = Math.round(
  (profit * VENTURE.splitInvestors) / 100
);
export const perUnitProfit = Math.floor(investorsProfit / VENTURE.units);
export const rounding = investorsProfit - perUnitProfit * VENTURE.units;
export const farmProfit = profit - investorsProfit + rounding;
export const perUnitPayout = VENTURE.unitPrice + perUnitProfit;
