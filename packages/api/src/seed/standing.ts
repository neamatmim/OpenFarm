/* oxlint-disable no-await-in-loop */
import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import type {
  PlaybookKey,
  StandardDrugKey,
  StandardFeedKey,
  StandardRationKey,
} from "@OpenFarm/domain";
import {
  STANDARD_DRUGS,
  STANDARD_FEED_ITEMS,
  STANDARD_RATIONS,
  farmDayOf,
  standardPlaybook,
} from "@OpenFarm/domain";

import type { Account, ApiClient, Random, SeedClock } from "./runtime";
import { addDays, clientOf, onFarm, openAccount } from "./runtime";

/** The people of the farm. The Owner's is the account to look around with: it sees everything. */
export const PEOPLE = [
  {
    key: "owner",
    role: "owner",
    name: "মোঃ আব্দুল করিম",
    email: "owner@openfarm.test",
  },
  {
    key: "manager",
    role: "manager",
    name: "রফিকুল ইসলাম",
    email: "manager@openfarm.test",
  },
  { key: "vet", role: "vet", name: "ডা. সালমা আক্তার", email: "vet@openfarm.test" },
  {
    key: "milker",
    role: "staff",
    name: "জাহিদ হাসান",
    email: "staff@openfarm.test",
  },
  {
    key: "feeder",
    role: "staff",
    name: "মিনারা বেগম",
    email: "staff2@openfarm.test",
  },
  {
    key: "stockman",
    role: "staff",
    name: "শফিকুল ইসলাম",
    email: "staff3@openfarm.test",
  },
] as const;
export type PersonKey = (typeof PEOPLE)[number]["key"];

export type PenKey =
  | "milking1"
  | "milking2"
  | "dry"
  | "calving"
  | "heifers"
  | "calves"
  | "bullsA"
  | "bullsB"
  | "quarantine"
  | "isolation";

export const SHEDS: { name: string; pens: [PenKey, string][] }[] = [
  {
    name: "গাভীর শেড",
    pens: [
      ["milking1", "দোহন পেন ১"],
      ["milking2", "দোহন পেন ২"],
      ["dry", "শুকনো গাভী পেন"],
      ["calving", "প্রসব পেন"],
      ["heifers", "বকনা পেন"],
      ["calves", "বাছুর পেন"],
    ],
  },
  {
    name: "মোটাতাজা শেড",
    pens: [
      ["bullsA", "ষাঁড় পেন ক"],
      ["bullsB", "ষাঁড় পেন খ"],
      ["quarantine", "কোয়ারেন্টিন পেন"],
    ],
  },
  { name: "হাসপাতাল শেড", pens: [["isolation", "আইসোলেশন পেন"]] },
];

export type FeedKey = StandardFeedKey;

export interface Farm {
  db: Database;
  farmId: string;
  clock: SeedClock;
  random: Random;
  accounts: Record<PersonKey, Account>;
  as: Record<PersonKey, ApiClient>;
  pens: Record<PenKey, string>;
  feeds: Record<FeedKey, string>;
  drugs: Partial<Record<StandardDrugKey, string>>;
  sops: Record<PlaybookKey, string>;
  /** The Pens each person works, so work goes to somebody whose Pen it is. */
  crews: Partial<Record<PersonKey, Set<string>>>;
  today: string;
  start: string;
}

/** How long the Registration has left today: inside the renewal lead, so the farm is being asked to renew. */
const REGISTRATION_LEFT_DAYS = 40;

/** The people, the farm, what it says about itself, its sheds and who works where. */
export const openTheFarm = async (
  db: Database,
  clock: SeedClock,
  random: Random,
  { today, start }: { today: string; start: string }
): Promise<Farm> => {
  clock.set(onFarm(addDays(start, -12), "10:00"));

  const accounts: Partial<Record<PersonKey, Account>> = {
    owner: await openAccount(db, PEOPLE[0]),
  };
  const ownerAccount = accounts.owner as Account;
  const founder = await clientOf(db, ownerAccount, clock);
  await founder.farm.bootstrap({ name: "সবুজ ছায়া ডেইরি অ্যান্ড ফ্যাটেনিং" });
  const owner = await clientOf(db, ownerAccount, clock);
  const founded = await db.query.farm.findFirst();
  const farmId = founded?.id ?? "";

  for (const person of PEOPLE.slice(1)) {
    const { code } = await owner.people.invite({
      email: person.email,
      name: person.name,
      roles: [person.role],
    });
    const account = await openAccount(db, person);
    // They take the invite up with the code the Owner handed them, as a real newcomer does.
    const newcomer = await clientOf(db, account, clock);
    await newcomer.people.acceptInvite({ code });
    accounts[person.key] = account;
  }

  await owner.farm.setIdentity({
    address: "গ্রাম: বিরুলিয়া, ইউনিয়ন: বিরুলিয়া, উপজেলা: সাভার, জেলা: ঢাকা ১৩৪০",
    phone: "01711-458203",
    registrationNumber: "DLS/DHK/SAV/2023/0187",
    registrationOffice: "উপজেলা প্রাণিসম্পদ অফিস, সাভার, ঢাকা",
    registrationIssuedOn: addDays(today, REGISTRATION_LEFT_DAYS - 3 * 365),
    registrationExpiresOn: addDays(today, REGISTRATION_LEFT_DAYS),
  });
  await owner.farm.setParameters({
    milkTolerancePercent: 5,
    feedTolerancePercent: 10,
    escalationMinutes: 180,
    fatteningTargetWeightKg: 420,
    pregnancyCheckAfterDays: 45,
    registrationRenewalLeadDays: 60,
  });

  const pens = {} as Record<PenKey, string>;
  for (const shed of SHEDS) {
    const made = await owner.herd.createShed({ name: shed.name });
    for (const [key, name] of shed.pens) {
      const pen = await owner.herd.createPen({ shedId: made.id, name });
      pens[key] = pen.id;
    }
  }

  // Who works which Pens: the milker the dairy shed, the feeder every trough, the stockman the fattening
  // shed, the hospital and the cows close to calving.
  const work: [PersonKey, PenKey[]][] = [
    ["milker", ["milking1", "milking2", "dry", "calving", "heifers", "calves"]],
    ["feeder", Object.keys(pens) as PenKey[]],
    [
      "stockman",
      ["bullsA", "bullsB", "quarantine", "isolation", "calving", "dry"],
    ],
  ];
  const crews: Partial<Record<PersonKey, Set<string>>> = {};
  for (const [key, penKeys] of work) {
    crews[key] = new Set(penKeys.map((penKey) => pens[penKey]));
    await db.insert(penAssignment).values(
      penKeys.map((penKey) => ({
        id: uuidv7(clock.now()),
        farmId,
        userId: (accounts[key] as Account).session.user.id,
        penId: pens[penKey],
      }))
    );
  }
  const everyone = accounts as Record<PersonKey, Account>;
  const as: Partial<Record<PersonKey, ApiClient>> = {};
  for (const person of PEOPLE) {
    as[person.key] = await clientOf(db, everyone[person.key], clock);
  }

  return {
    db,
    farmId,
    clock,
    random,
    accounts: everyone,
    as: as as Record<PersonKey, ApiClient>,
    pens,
    feeds: {} as Record<FeedKey, string>,
    drugs: {},
    sops: {} as Record<PlaybookKey, string>,
    crews,
    today,
    start,
  };
};

/** The farm's own Category for what it spends on the animals without naming any of them. */
export const HERD_SUNDRIES = "পালের টুকিটাকি";

/** Which Pens each standard Ration is fed to. */
const FED: [StandardRationKey, PenKey[]][] = [
  ["milking", ["milking1", "milking2"]],
  ["dry", ["dry", "calving"]],
  ["heifer", ["heifers"]],
  ["calf", ["calves"]],
  // By weight: the bulls bought in on the arrival Ration, the lighter pen on the grower's, the heavier on the finisher's.
  ["arrival", ["quarantine"]],
  ["bullGrower", ["bullsB"]],
  ["bullFinisher", ["bullsA"]],
  ["sick", ["isolation"]],
];

/** What the Vet wrote off each label — days for milk, then meat — and what a box of it cost and how many doses came
 *  in it. */
const MEDICINES: [
  StandardDrugKey,
  number,
  number,
  { priceBdt: number; doses: number; quantity: string },
][] = [
  [
    "oxytet",
    7,
    28,
    { priceBdt: 2400, doses: 40, quantity: "৪টি ১০০ মিলি ভায়াল" },
  ],
  ["penstrep", 3, 30, { priceBdt: 1800, doses: 36, quantity: "৬টি ভায়াল" }],
  ["ceftiofur", 0, 8, { priceBdt: 3200, doses: 20, quantity: "২টি ভায়াল" }],
  [
    "meloxicam",
    5,
    15,
    { priceBdt: 1500, doses: 30, quantity: "৩টি ৩০ মিলি ভায়াল" },
  ],
  ["intramammary", 4, 7, { priceBdt: 2100, doses: 24, quantity: "২৪টি টিউব" }],
  ["calcium", 0, 0, { priceBdt: 1600, doses: 16, quantity: "১৬টি বোতল" }],
  ["fmd", 0, 21, { priceBdt: 9000, doses: 120, quantity: "৬টি ২০-ডোজ ভায়াল" }],
  ["lsd", 0, 21, { priceBdt: 7500, doses: 100, quantity: "৫টি ২০-ডোজ ভায়াল" }],
  ["albendazole", 3, 14, { priceBdt: 2800, doses: 90, quantity: "৯০টি বোলাস" }],
];

/** The days the Vet wrote for meat off a medicine's label: what keeps a beast it was given to off the butcher's lorry. */
export const meatDaysOf = (key: StandardDrugKey): number =>
  MEDICINES.find(([drug]) => drug === key)?.[2] ?? 0;

/**
 * The farm starts with the standard lists, as a new Owner is offered at Setup, and then makes them its own: the
 * Rations put on Pens, the store watched, the Vet's withdrawal days written off the labels and the medicines bought.
 */
export const stockTheFarm = async (farm: Farm): Promise<void> => {
  const { as } = farm;
  await as.owner.farm.startWithStandard({
    kinds: ["feed", "rations", "health"],
  });

  const items = await as.manager.feed.items();
  for (const [key, name] of Object.entries(STANDARD_FEED_ITEMS)) {
    farm.feeds[key as FeedKey] =
      items.find((item) => item.nameBn === name.bn)?.id ?? "";
  }

  // What the farm spends on the animals without naming any of them — fly spray, lime, a lab test. The
  // Owner marks it as one the animals of its Side carry, and the month's worth is split by their days.
  const sundries = await as.manager.money.addCategory({
    nameBn: HERD_SUNDRIES,
    nameEn: "Herd sundries",
    direction: "out",
  });
  await as.owner.money.setChargedToAnimals({
    categoryId: sundries.id,
    chargedToAnimals: true,
  });

  const rations = await as.manager.feed.rations();
  for (const [key, penKeys] of FED) {
    const ration = rations.find(
      (one) => one.name.bn === STANDARD_RATIONS[key].name.bn
    );
    for (const penKey of penKeys) {
      await as.manager.feed.assignRation({
        penId: farm.pens[penKey],
        rationId: ration?.id ?? "",
      });
    }
  }
  const lowStock: [FeedKey, number][] = [
    ["concentrate", 600],
    ["mustardCake", 150],
    ["maize", 300],
    ["bran", 300],
    ["minerals", 20],
  ];
  for (const [key, threshold] of lowStock) {
    await as.manager.feed.setLowStock({
      feedItemId: farm.feeds[key],
      threshold,
    });
  }

  // Bought as well as named: a dose nobody has costed charges the animal nothing, and a Venture whose
  // animals carry one will not settle — the farm refuses to close books over medicine nobody priced.
  const products = await as.vet.drugs.list();
  for (const [key, milk, meat, bought] of MEDICINES) {
    const id =
      products.find((one) => one.nameBn === STANDARD_DRUGS[key].bn)?.id ?? "";
    await as.vet.drugs.setWithdrawal({
      id,
      milkWithdrawalDays: milk,
      meatWithdrawalDays: meat,
    });
    await as.manager.drugs.purchase({
      drugProductId: id,
      quantity: bought.quantity,
      doses: bought.doses,
      priceBdt: bought.priceBdt,
      seller: {
        name: "মেডিসিন কর্নার",
        address: "সাভার বাজার, ঢাকা",
        phone: "01712-556677",
      },
      purchasedOn: farmDayOf(farm.clock.now()),
      paymentMethod: "cash",
    });
    farm.drugs[key] = id;
  }
  for (const key of ["fmd", "lsd"] as const) {
    await as.vet.drugs.markVaccine({
      id: farm.drugs[key] ?? "",
      vaccine: true,
    });
  }
};

/** The Owner writes the Playbook down. */
export const writeThePlaybook = async (farm: Farm): Promise<void> => {
  const contents = standardPlaybook({
    calvingPen: farm.pens.calving,
    fmdVaccine: farm.drugs.fmd,
    lsdVaccine: farm.drugs.lsd,
    dewormer: farm.drugs.albendazole,
  });
  for (const [key, content] of Object.entries(contents)) {
    const made = await farm.as.owner.sops.create({
      content,
      note: "খামার চালু করার সময় লেখা",
    });
    farm.sops[key as PlaybookKey] = made.definitionId;
  }
};
