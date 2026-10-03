import { A_DEATH_PHOTO } from "./death-photo";
import { DAY, addDays, onFarm } from "./runtime";
import { CATTLE_BUYERS, breedIdNamed } from "./shared";
/* oxlint-disable no-await-in-loop */
import type { Farm, PenKey } from "./standing";
import { SHEDS, paidBy } from "./standing";

/** What the seed remembers about a cow so the days that follow are hers: how much she gives, and where she is in
 *  her cycle. The farm's own records are the truth; this is only what the seed needs to answer the work
 *  believably. */
export interface Cow {
  tag: string;
  breed: string;
  pen: PenKey;
  state: "calf" | "heifer" | "pregnant_heifer" | "milking" | "dry";
  /** Peak litres a day this cow reaches in a lactation. */
  peak: number;
  calvedOn: string | null;
  expectedCalving: string | null;
  /** The next day she will show heat, while open and cycling. */
  nextHeat: string | null;
  /** Whether the service she is waiting on took, decided when she is served. */
  conceives: boolean | null;
}

export interface Bull {
  tag: string;
  pen: PenKey;
  breed: string;
  weightKg: number;
  dailyGainKg: number;
  arrivedOn: string;
  state: "quarantine" | "fattening" | "ready_for_sale" | "sold" | "died";
  /** The day he is to be made ready for sale, where the script knows it: his last month goes unsprayed, as a spray's
   *  meat withdrawal would hold up the sale. */
  sellBy?: string;
  /** The day from which he will not go up the crush, so his last weighing grows old: too old to price an Internal Sale
   *  on, as the Owner's picker says. */
  crushShyFrom?: string;
}

export interface Herd {
  cows: Map<string, Cow>;
  bulls: Map<string, Bull>;
  /** What somebody does once a piece of work is finished — the dried-off cow walked to the dry pen. */
  followUps: (() => Promise<void>)[];
}

const DAIRY_BREEDS: [string, number][] = [
  ["হলস্টেইন ফ্রিজিয়ান ক্রস", 19],
  ["শাহীওয়াল ক্রস", 11],
  ["জার্সি ক্রস", 13],
  ["রেড চিটাগাং", 6],
];
const BULL_BREEDS = [
  "ব্রাহমা ক্রস",
  "দেশি",
  "পাবনা ক্যাটল",
  "শাহীওয়াল ক্রস",
  "হলস্টেইন ফ্রিজিয়ান ক্রস",
];
const NAMES = [
  "লক্ষ্মী",
  "ধলি",
  "কালী",
  "সুন্দরী",
  "মায়া",
  "পরী",
  "লালি",
  "টুনি",
  "রানী",
  "ময়না",
  "চাঁদনী",
  "শাপলা",
  "বকুল",
  "জবা",
  "কাজলী",
  "পুতুল",
  "মেঘলা",
  "ঝুমুর",
  "শিউলি",
  "টগর",
  "বেলী",
  "মুক্তা",
  "সোনালী",
  "রূপা",
  "দুলালী",
  "নয়না",
  "হাসি",
  "খুশি",
  "পাখি",
  "মালতী",
  "চম্পা",
  "কুসুম",
  "জুঁই",
  "নীলা",
  "তারা",
  "সাথী",
  "আলো",
  "বৃষ্টি",
  "রাঙা",
  "গৌরী",
  "মিনু",
  "লিলি",
  "টিয়া",
  "ফুলি",
  "সুমি",
  "রুমা",
  "পিংকি",
  "বুলবুলি",
];

const csvRow = (values: (string | undefined)[]) =>
  values.map((value) => (value ?? "").replaceAll(",", " ")).join(",");

/** The opening register: the dairy herd as it stood the day the farm started using the app. */
export const registerTheHerd = async (farm: Farm): Promise<Herd> => {
  const { random, start } = farm;
  const opened = addDays(start, -10);
  farm.clock.set(onFarm(opened, "11:00"));
  const penName = new Map(
    SHEDS.flatMap((shed) =>
      shed.pens.map(([key, name]) => [key, name] as const)
    )
  );

  const plan: Omit<Cow, "tag">[] = [];
  const breed = () => random.pick(DAIRY_BREEDS);
  // In milk: calved between three weeks and nine months before the farm opened. The ones well into their
  // lactation are already in calf, due inside or just beyond the three months the seed covers.
  for (let index = 0; index < 32; index += 1) {
    const [name, peak] = breed();
    const daysInMilk = random.int(20, 270);
    const inCalf = daysInMilk > 130 && random.chance(0.7);
    plan.push({
      breed: name,
      pen: index % 2 === 0 ? "milking1" : "milking2",
      state: "milking",
      peak: peak * random.between(0.85, 1.15),
      calvedOn: addDays(opened, -daysInMilk),
      expectedCalving: inCalf ? addDays(start, random.int(70, 150)) : null,
      nextHeat:
        inCalf || daysInMilk < 55 ? null : addDays(start, random.int(0, 20)),
      conceives: null,
    });
  }
  // Dry, and due within the three months.
  for (let index = 0; index < 7; index += 1) {
    const [name, peak] = breed();
    plan.push({
      breed: name,
      pen: "dry",
      state: "dry",
      peak: peak * random.between(0.85, 1.15),
      calvedOn: addDays(opened, -random.int(300, 360)),
      expectedCalving: addDays(start, random.int(8, 70)),
      nextHeat: null,
      conceives: null,
    });
  }
  for (let index = 0; index < 4; index += 1) {
    const [name, peak] = breed();
    plan.push({
      breed: name,
      pen: "heifers",
      state: "pregnant_heifer",
      peak: peak * 0.8,
      calvedOn: null,
      expectedCalving: addDays(start, random.int(25, 120)),
      nextHeat: null,
      conceives: null,
    });
  }
  for (let index = 0; index < 11; index += 1) {
    const [name, peak] = breed();
    plan.push({
      breed: name,
      pen: "heifers",
      state: "heifer",
      peak: peak * 0.8,
      calvedOn: null,
      expectedCalving: null,
      nextHeat: addDays(start, random.int(0, 30)),
      conceives: null,
    });
  }
  for (let index = 0; index < 9; index += 1) {
    const [name, peak] = breed();
    plan.push({
      breed: name,
      pen: "calves",
      state: "calf",
      peak: peak * 0.8,
      calvedOn: null,
      expectedCalving: null,
      nextHeat: null,
      conceives: null,
    });
  }

  const header =
    "sex,side,state,pen,source,breed,birth_date,calved_at,expected_calving,alias";
  const lines = plan.map((cow, index) => {
    const ageYears = {
      calf: 0.3,
      heifer: 1.5,
      pregnant_heifer: 2.2,
      milking: random.between(3.5, 7),
      dry: 5,
    }[cow.state];
    const born = addDays(
      opened,
      -Math.round(ageYears * 365 + random.int(0, 90))
    );
    const bought = cow.state === "milking" && index % 5 === 0;
    return csvRow([
      "female",
      "dairy",
      cow.state,
      penName.get(cow.pen),
      bought ? "bought" : "born",
      cow.breed,
      born,
      cow.calvedOn ? onFarm(cow.calvedOn, "06:00").toISOString() : undefined,
      cow.expectedCalving ?? undefined,
      NAMES[index % NAMES.length],
    ]);
  });
  const result = await farm.as.manager.animals.importRegister({
    csv: [header, ...lines].join("\n"),
  });
  if (result.failed.length > 0) {
    throw new Error(
      `Register refused rows: ${JSON.stringify(result.failed.slice(0, 3))}`
    );
  }
  const cows = new Map<string, Cow>();
  for (const { line, tagNumber } of result.imported) {
    const cow = plan[line - 2];
    if (cow) {
      cows.set(tagNumber, { ...cow, tag: tagNumber });
    }
  }
  return { cows, bulls: new Map(), followUps: [] };
};

const SELLERS = [
  {
    name: "মোঃ হানিফ ব্যাপারী",
    address: "গাবতলী গরুর হাট, ঢাকা",
    phone: "01819-224571",
  },
  { name: "আলমগীর হোসেন", address: "সাভার হাট", phone: "01712-908133" },
  { name: "নূর মোহাম্মদ", address: "সিরাজগঞ্জ, শাহজাদপুর", phone: "01731-552908" },
  { name: "বাবুল মিয়া", address: "মানিকগঞ্জ, সিঙ্গাইর হাট", phone: "01917-330245" },
];

/** The dearest a bull off the lorry can come to, with his Hasil: what the Owner's float allows for each. */
const dearestBullMoney = (heavier: number) => (290 + heavier) * 520 * 1.05;

/** Floats go out in round sums, as the bank counts notes. */
const FLOAT_ROUNDS_TO_MONEY = 50_000;

/**
 * A lorry of bulls from the hat, taken in by the Manager on the day they arrive — on the Farm's own float: the Owner
 * draws enough for the dearest lorry from the bank into the Manager's hand that morning, the livestock market is paid in cash
 * from it, and the Owner counts it home that night against what the outing bought.
 */
export const takeInBulls = async (
  farm: Farm,
  herd: Herd,
  {
    on,
    count,
    pen,
    heavier = 0,
    oneTypedHeavy = false,
  }: {
    on: string;
    count: number;
    pen: PenKey;
    heavier?: number;
    /** The lorry whose first bull the Manager wrote down 24 kg heavier than he was, and paid for so: his first round on
     *  the farm's own scale comes in under it, and the Owner is told. */
    oneTypedHeavy?: boolean;
  }
): Promise<Bull[]> => {
  const { random } = farm;
  const seller = random.pick(SELLERS);
  const arrived: Bull[] = [];
  farm.clock.set(onFarm(on, "06:00"));
  // The day at the livestock market: a broker to find them, the lorry home, and keeping the men who went. Its cost is
  // split evenly across the beasts that came home on it.
  const costs = {
    brokerMoney: count * random.int(250, 400),
    transportMoney: random.int(6000, 11_000),
    keepMoney: random.int(900, 1800),
  };
  const trip = await farm.as.manager.trips.record({
    wentTo: seller.address ?? "গাবতলী হাট, ঢাকা",
    ...costs,
    wentOn: onFarm(on, "06:00"),
    paymentMethod: "cash",
  });
  const tripCostMoney =
    costs.brokerMoney + costs.transportMoney + costs.keepMoney;
  await farm.as.owner.cash.handOver({
    from: { farmAccountId: farm.farmAccounts.bank },
    to: { userId: farm.accounts.manager.session.user.id },
    amountMoney:
      Math.ceil(
        (count * dearestBullMoney(heavier) + tripCostMoney) /
          FLOAT_ROUNDS_TO_MONEY
      ) * FLOAT_ROUNDS_TO_MONEY,
    reference: `চেক নং ${random.int(100_000, 999_999)}`,
    note: "হাটে গরু কেনার টাকা",
    buyingTripId: trip.id,
  });
  for (let index = 0; index < count; index += 1) {
    farm.clock.set(
      new Date(onFarm(on, "15:30").getTime() + index * 4 * 60_000)
    );
    const breed = random.pick(BULL_BREEDS);
    const weightKg = random.int(185, 290) + heavier;
    // What the Manager wrote down and paid for; what he really weighed is what the scale will say.
    const typedKg = weightKg + (oneTypedHeavy && index === 0 ? 24 : 0);
    const price = Math.round((typedKg * random.between(430, 520)) / 500) * 500;
    const recorded = await farm.as.manager.intake.record({
      penId: farm.pens[pen],
      sex: "male",
      seller,
      purchasePriceMoney: price,
      // The livestock market's toll on this beast, as its slip gives it: a fraction of what she fetched.
      hasilMoney: Math.round((price * random.between(0.03, 0.045)) / 50) * 50,
      buyingTripId: trip.id,
      weightKg: typedKg,
      estimatedAgeMonths: random.int(16, 26),
      breedId: await breedIdNamed(farm.as.manager, breed),
      // The livestock market takes cash, and the float is what it is paid from.
      paymentMethod: "cash",
    });
    const bull: Bull = {
      tag: recorded.tagNumber,
      pen,
      breed,
      weightKg,
      dailyGainKg: random.between(0.55, 1.05) + (heavier > 0 ? 0.2 : 0),
      arrivedOn: on,
      state: "quarantine",
      // The second off the same lorry is weighed once, then will not go up the crush again.
      ...(oneTypedHeavy && index === 1 ? { crushShyFrom: addDays(on, 9) } : {}),
    };
    herd.bulls.set(bull.tag, bull);
    arrived.push(bull);
  }
  // That night the Manager brings back what the livestock market did not take, and the Owner counts it against the slips.
  farm.clock.set(onFarm(on, "20:30"));
  const floats = await farm.as.owner.cash.tripFloats();
  const float = floats.find((one) => one.tripId === trip.id);
  if (float) {
    await farm.as.owner.cash.countFloatHome({
      tripId: trip.id,
      cashBackMoney: float.handedMoney - float.boughtMoney,
    });
  }
  return arrived;
};

/** Litres a cow gives in a whole day, `daysInMilk` into her lactation: up to her peak by the seventh week and
 *  falling away after. */
export const dailyYield = (cow: Cow, day: string): number => {
  if (cow.state !== "milking" || !cow.calvedOn) {
    return 0;
  }
  const daysInMilk =
    (onFarm(day).getTime() - onFarm(cow.calvedOn).getTime()) / DAY;
  const rising = Math.min(1, 0.65 + (0.35 * daysInMilk) / 50);
  const falling =
    daysInMilk > 60 ? Math.max(0.35, 1 - (daysInMilk - 60) * 0.0022) : 1;
  return cow.peak * rising * falling;
};

/** Days from the lorry in January to Eid-ul-Adha 2026: what each bull grew over. */
const DAYS_TO_EID_2026 = 123;
/** How many of them go on the first day of Qurbani; the rest the next. */
const SOLD_ON_THE_FIRST_DAY = 3;

/**
 * Last Eid's Season, finished before the farm's history begins: a lorry of the Farm's own bulls bought in January for
 * Eid-ul-Adha 2026, one of them dead in April, the rest sold over Eid — so the Owner's Returns page has a Season that is
 * a result, the dead among it, beside the settled Venture. Taken off the herd once gone, so the days that follow never
 * feed or sell them again.
 */
export const lastEidsSeason = async (farm: Farm, herd: Herd) => {
  const lorry = await takeInBulls(farm, herd, {
    on: "2026-01-25",
    count: 6,
    pen: "quarantine",
    heavier: 20,
  });
  const [dead, ...sold] = lorry;
  if (dead) {
    farm.clock.set(onFarm("2026-04-10", "08:00"));
    await farm.as.manager.animals.recordMortality({
      photo: A_DEATH_PHOTO,
      tagNumber: dead.tag,
      kind: "died",
      cause: "পেট ফুলে গিয়েছিল, সকালে মরে পড়ে ছিল",
      disposal: "buried",
      disposalNote: "খামারের পিছনে, ছয় ফুট গভীরে",
      happenedAt: onFarm("2026-04-10", "06:00"),
    });
  }
  for (const [index, bull] of sold.entries()) {
    const day = index < SOLD_ON_THE_FIRST_DAY ? "2026-05-28" : "2026-05-29";
    farm.clock.set(onFarm(day, `${10 + index}:15`));
    const weightKg = Math.round(
      bull.weightKg + bull.dailyGainKg * DAYS_TO_EID_2026
    );
    const buyer = farm.random.pick(CATTLE_BUYERS);
    await farm.as.manager.sale.record({
      tagNumber: bull.tag,
      buyer,
      priceMoney:
        // Lower than a finished bull fetches in the days that follow: these bulls were bought before the farm's
        // history begins, so nothing they ate is charged to them, and at a full price their Season would read as a
        // return no fattening makes.
        Math.round((weightKg * farm.random.between(410, 440)) / 1000) * 1000,
      weightKg,
      destination: buyer.address,
      vehicle: `ঢাকা মেট্রো-ন ${farm.random.int(11, 19)}-${farm.random.int(1000, 9999)}`,
      driver: farm.random.pick(["মোঃ হাবিব", "সোহেল রানা", "আব্দুর রহিম"]),
      ...paidBy(farm, "bank"),
    });
  }
  for (const bull of lorry) {
    herd.bulls.delete(bull.tag);
  }
  // The rate the Owner reads the Season against: what the bank declared for 2024, typed the day after Eid, holding
  // from the first of the year — so the Season's first taka in January reads it.
  farm.clock.set(onFarm("2026-05-30", "20:00"));
  await farm.as.owner.returns.setBankRate({
    perYear: 9.19,
    note: "IBBL ১২ মাসের মুদারাবা, চূড়ান্ত ২০২৪",
    fromDay: "2025-01-01",
  });
};

/** What the Owner reckons a head of each kind was worth the day the books opened, low to high. */
const OPENING_PRICE = {
  calf: [12_000, 18_000],
  heifer: [40_000, 55_000],
  pregnant_heifer: [65_000, 85_000],
  milking: [85_000, 120_000],
  dry: [60_000, 80_000],
} as const;

/**
 * The Owner's prices for the dairy herd: every cow on the opening register was here before the farm kept its books, or
 * was bought, so each is counted from a price the Owner enters — all but the last cow bought, left to price so the
 * Returns page has one waiting. And the Head Prices a cow still here counts at, for four kinds of five: a dry cow has
 * none yet, so the herd's figure names the dry pen until the Owner sets one.
 */
export const priceTheDairyHerd = async (farm: Farm, herd: Herd) => {
  const opened = addDays(farm.start, -10);
  farm.clock.set(onFarm(opened, "20:00"));
  const cows = [...herd.cows.values()];
  const bought = new Set<string>();
  for (const cow of cows) {
    // oxlint-disable-next-line no-await-in-loop -- one cow at a time, as the Owner reads the register
    const her = await farm.as.owner.animals.byTag({ tagNumber: cow.tag });
    if (her.source === "bought") {
      bought.add(cow.tag);
    }
  }
  const leftToPrice = [...bought].at(-1);
  for (const cow of cows) {
    if (cow.tag === leftToPrice) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one cow at a time
    const her = await farm.as.owner.animals.byTag({ tagNumber: cow.tag });
    const [low, high] = OPENING_PRICE[cow.state];
    // oxlint-disable-next-line no-await-in-loop -- one price at a time, each its own line in the trail
    await farm.as.owner.returns.priceCow({
      animalId: her.id,
      priceMoney: Math.round(farm.random.between(low, high) / 500) * 500,
      note: bought.has(cow.tag)
        ? "কেনার রসিদ অনুযায়ী"
        : "খাতা খোলার দিন পাড়ার বেপারীর মুখের দাম",
    });
  }
  // The Owner's opening prices stand as the Head Prices too — all but a dry cow's, which waits.
  for (const kind of [
    "calf",
    "heifer",
    "pregnant_heifer",
    "milking",
  ] as const) {
    const [lowMoney, highMoney] = OPENING_PRICE[kind];
    // oxlint-disable-next-line no-await-in-loop -- one kind at a time
    await farm.as.owner.returns.setHeadPrice({ kind, lowMoney, highMoney });
  }
};
