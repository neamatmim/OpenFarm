import { DAY, addDays, onFarm } from "./runtime";
/* oxlint-disable no-await-in-loop */
import type { Farm, PenKey } from "./standing";
import { SHEDS } from "./standing";

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
  "হলস্টেইন ক্রস ষাঁড়",
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
      cow.calvedOn ? `${cow.calvedOn}T06:00:00+06:00` : undefined,
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

/** A lorry of bulls from the hat, taken in by the Manager on the day they arrive. */
export const takeInBulls = async (
  farm: Farm,
  herd: Herd,
  {
    on,
    count,
    pen,
    heavier = 0,
  }: { on: string; count: number; pen: PenKey; heavier?: number }
): Promise<Bull[]> => {
  const { random } = farm;
  const seller = random.pick(SELLERS);
  const arrived: Bull[] = [];
  for (let index = 0; index < count; index += 1) {
    farm.clock.set(
      new Date(onFarm(on, "15:30").getTime() + index * 4 * 60_000)
    );
    const breed = random.pick(BULL_BREEDS);
    const weightKg = random.int(185, 290) + heavier;
    const recorded = await farm.as.manager.intake.record({
      penId: farm.pens[pen],
      sex: "male",
      seller,
      purchasePriceBdt:
        Math.round((weightKg * random.between(430, 520)) / 500) * 500,
      weightKg,
      estimatedAgeMonths: random.int(16, 26),
      breed,
      paymentMethod: random.chance(0.6) ? "cash" : "bank",
    });
    const bull: Bull = {
      tag: recorded.tagNumber,
      pen,
      breed,
      weightKg,
      dailyGainKg: random.between(0.55, 1.05) + (heavier > 0 ? 0.2 : 0),
      arrivedOn: on,
      state: "quarantine",
    };
    herd.bulls.set(bull.tag, bull);
    arrived.push(bull);
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
