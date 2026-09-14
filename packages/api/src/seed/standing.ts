/* oxlint-disable no-await-in-loop */
import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { penAssignment } from "@OpenFarm/db/schema/herd";

import type { PlaybookKey } from "./playbook";
import { playbook } from "./playbook";
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

export const FEEDS = {
  napier: { bn: "নেপিয়ার ঘাস", en: "Napier grass" },
  straw: { bn: "ধানের খড়", en: "Rice straw" },
  silage: { bn: "ভুট্টার সাইলেজ", en: "Maize silage" },
  bran: { bn: "গমের ভুসি", en: "Wheat bran" },
  mustardCake: { bn: "সরিষার খৈল", en: "Mustard oil cake" },
  maize: { bn: "ভাঙা ভুট্টা", en: "Crushed maize" },
  pulseHusk: { bn: "ডালের ভুসি", en: "Pulse husk" },
  concentrate: { bn: "ডেইরি কনসেনট্রেট", en: "Dairy concentrate" },
  minerals: { bn: "মিনারেল মিক্সচার", en: "Mineral mixture" },
} as const;
export type FeedKey = keyof typeof FEEDS;

export interface Farm {
  db: Database;
  farmId: string;
  clock: SeedClock;
  random: Random;
  accounts: Record<PersonKey, Account>;
  as: Record<PersonKey, ApiClient>;
  pens: Record<PenKey, string>;
  feeds: Record<FeedKey, string>;
  drugs: Record<string, string>;
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

/** The store's items, the Rations each Pen is fed, the medicine chest and the farm's notifiable list. */
export const stockTheFarm = async (farm: Farm): Promise<void> => {
  const { as } = farm;
  for (const [key, name] of Object.entries(FEEDS)) {
    const item = await as.manager.feed.addItem({ name, unit: "kg" });
    farm.feeds[key as FeedKey] = item.id;
  }

  const rations: [PenKey[], { bn: string; en: string }, [FeedKey, number][]][] =
    [
      [
        ["milking1", "milking2"],
        { bn: "দোহনকালীন গাভীর রেশন", en: "Milking cow ration" },
        [
          ["napier", 25],
          ["straw", 4],
          ["silage", 8],
          ["concentrate", 6],
          ["mustardCake", 1],
          ["minerals", 0.1],
        ],
      ],
      [
        ["dry", "calving"],
        { bn: "শুকনো ও গর্ভবতী গাভীর রেশন", en: "Dry and close-up cow ration" },
        [
          ["napier", 20],
          ["straw", 5],
          ["bran", 2],
          ["mustardCake", 0.5],
          ["minerals", 0.1],
        ],
      ],
      [
        ["heifers"],
        { bn: "বকনার রেশন", en: "Heifer ration" },
        [
          ["napier", 15],
          ["straw", 3],
          ["bran", 1.5],
          ["minerals", 0.05],
        ],
      ],
      [
        ["calves"],
        { bn: "বাছুরের রেশন", en: "Calf ration" },
        [
          ["napier", 3],
          ["bran", 0.8],
          ["concentrate", 0.5],
        ],
      ],
      [
        ["bullsA", "bullsB", "quarantine"],
        { bn: "মোটাতাজাকরণ রেশন", en: "Fattening ration" },
        [
          ["napier", 12],
          ["straw", 3],
          ["maize", 3],
          ["bran", 2],
          ["mustardCake", 1],
          ["pulseHusk", 1.5],
          ["minerals", 0.08],
        ],
      ],
      [
        ["isolation"],
        { bn: "অসুস্থ পশুর নরম রেশন", en: "Sick animal soft ration" },
        [
          ["napier", 10],
          ["bran", 1],
          ["minerals", 0.05],
        ],
      ],
    ];
  for (const [penKeys, name, lines] of rations) {
    const ration = await as.manager.feed.saveRation({
      name,
      items: lines.map(([key, kg]) => ({
        feedItemId: farm.feeds[key],
        kgPerAnimalPerDay: kg,
      })),
    });
    for (const penKey of penKeys) {
      await as.manager.feed.assignRation({
        penId: farm.pens[penKey],
        rationId: ration.rationId,
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

  const medicines: [string, { bn: string; en: string }, number, number][] = [
    [
      "oxytet",
      {
        bn: "অক্সিটেট্রাসাইক্লিন ২০% ইনজেকশন",
        en: "Oxytetracycline 20% LA injection",
      },
      7,
      28,
    ],
    [
      "penstrep",
      { bn: "পেনিসিলিন-স্ট্রেপটোমাইসিন", en: "Penicillin-Streptomycin" },
      3,
      30,
    ],
    ["ceftiofur", { bn: "সেফটিওফার ইনজেকশন", en: "Ceftiofur injection" }, 0, 8],
    [
      "meloxicam",
      { bn: "মেলোক্সিক্যাম ইনজেকশন", en: "Meloxicam injection" },
      5,
      15,
    ],
    [
      "intramammary",
      { bn: "ওলানের টিউব (ক্লক্সাসিলিন)", en: "Intramammary tube (Cloxacillin)" },
      4,
      7,
    ],
    [
      "calcium",
      { bn: "ক্যালসিয়াম বোরোগ্লুকোনেট", en: "Calcium borogluconate" },
      0,
      0,
    ],
    [
      "fmd",
      { bn: "এফএমডি টিকা (ট্রাইভ্যালেন্ট)", en: "FMD vaccine (trivalent)" },
      0,
      21,
    ],
    ["lsd", { bn: "লাম্পি স্কিন টিকা", en: "Lumpy skin disease vaccine" }, 0, 21],
    [
      "albendazole",
      { bn: "অ্যালবেনডাজল কৃমিনাশক", en: "Albendazole drench" },
      3,
      14,
    ],
  ];
  for (const [key, name, milk, meat] of medicines) {
    const product = await as.vet.drugs.add({
      name,
      milkWithdrawalDays: milk,
      meatWithdrawalDays: meat,
    });
    farm.drugs[key] = product.id;
  }
  for (const key of ["fmd", "lsd"]) {
    await as.vet.drugs.markVaccine({
      id: farm.drugs[key] ?? "",
      vaccine: true,
    });
  }

  const notifiable: [string, string][] = [
    ["ক্ষুরা রোগ", "Foot-and-mouth disease"],
    ["তড়কা", "Anthrax"],
    ["লাম্পি স্কিন ডিজিজ", "Lumpy skin disease"],
    ["গলাফোলা", "Haemorrhagic septicaemia"],
    ["বাদলা", "Black quarter"],
    ["ব্রুসেলোসিস", "Brucellosis"],
  ];
  for (const [bn, en] of notifiable) {
    await as.vet.notifiable.add({ name: { bn, en } });
  }
};

/** The Owner writes the Playbook down. */
export const writeThePlaybook = async (farm: Farm): Promise<void> => {
  const contents = playbook({
    calvingPenId: farm.pens.calving,
    fmdVaccineId: farm.drugs.fmd ?? "",
    lsdVaccineId: farm.drugs.lsd ?? "",
    dewormerId: farm.drugs.albendazole ?? "",
  });
  for (const [key, content] of Object.entries(contents)) {
    const made = await farm.as.owner.sops.create({
      content,
      note: "খামার চালু করার সময় লেখা",
    });
    farm.sops[key as PlaybookKey] = made.definitionId;
  }
};
