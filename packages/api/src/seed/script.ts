/* oxlint-disable no-await-in-loop */
/**
 * The three months, as a script: the routine that fills every day and the things that made those months this
 * farm's own. Each builder adds its part to the list of happenings the days are lived through.
 */
import type { StandardDrugKey } from "@OpenFarm/domain";
import { ROUND_WORDS } from "@OpenFarm/domain";

import type { Cow, Herd } from "./herd";
import { takeInBulls } from "./herd";
import type { Happening } from "./history";
import type { ApiClient } from "./runtime";
import { DAY, addDays, onFarm } from "./runtime";
import type { FeedSeller } from "./shared";
import {
  CATTLE_BUYERS,
  FEED_SELLERS,
  MILK_BUYERS,
  calvings,
  daysBetween,
  moveBull,
  moveCow,
  penHolds,
  pickFrom,
  raise,
  see,
  shelfCount,
  shelfReason,
} from "./shared";
import { HERD_SUNDRIES } from "./standing";
import type { Farm, PenKey } from "./standing";
import "./responders";

interface Script {
  farm: Farm;
  herd: Herd;
  days: string[];
  cows: Cow[];
  on: (day: string, time: string, what: string, run: Happening["run"]) => void;
}

type FeedKey = keyof Farm["feeds"];

/** The store: opening stock, napier cut daily, silage from the pit, and the rest bought weekly. */
const keepTheStore = ({ farm, days, on }: Script) => {
  const { start, today, random } = farm;
  // What the farm's own fodder is worth to whoever eats it, said before the first cut comes in: the
  // fields are the farm's, but the grass is not free to the animals standing in front of it.
  //
  // Before the napier at 06:30, and it used to be after. A Harvest keeps the price in force when it was
  // recorded, so that one cut stayed unpriced for good — harmless in the farm's own reports, and enough
  // to stop a Venture ever settling, because a Settlement will not close over feed nobody has priced.
  on(start, "05:30", "what our own fodder is worth", async (f) => {
    for (const [key, price] of [
      ["napier", 3],
      ["silage", 6.5],
    ] as [FeedKey, number][]) {
      await f.as.owner.feed.setFodderPrice({
        feedItemId: f.feeds[key],
        fodderPriceBdt: price,
      });
    }
  });
  on(start, "08:00", "opening stock", async (f) => {
    const opening: [
      FeedKey,
      "purchase" | "harvest",
      number,
      number | undefined,
      FeedSeller | undefined,
    ][] = [
      ["concentrate", "purchase", 3000, 58, FEED_SELLERS.mill],
      ["mustardCake", "purchase", 800, 62, FEED_SELLERS.bazaar],
      ["bran", "purchase", 1500, 48, FEED_SELLERS.bazaar],
      ["maize", "purchase", 1500, 36, FEED_SELLERS.bazaar],
      ["pulseHusk", "purchase", 800, 30, FEED_SELLERS.bazaar],
      ["minerals", "purchase", 100, 140, FEED_SELLERS.mill],
      ["straw", "purchase", 3000, 9, FEED_SELLERS.straw],
      ["silage", "harvest", 12_000, undefined, undefined],
      ["napier", "harvest", 6000, undefined, undefined],
    ];
    for (const [key, kind, quantity, price, seller] of opening) {
      await f.as.manager.stock.receive({
        feedItemId: f.feeds[key],
        kind,
        quantity,
        priceBdt: price ? price * quantity : undefined,
        seller,
        receivedOn: start,
        paymentMethod: "bank",
      });
    }
  });

  for (const [index, day] of days.entries()) {
    on(day, "06:30", "napier harvest", async (f) => {
      await f.as.manager.stock.receive({
        feedItemId: f.feeds.napier,
        kind: "harvest",
        quantity: random.int(1750, 1950),
        receivedOn: day,
      });
    });
    if (index % 10 === 4) {
      on(day, "12:00", "silage", async (f) => {
        await f.as.manager.stock.receive({
          feedItemId: f.feeds.silage,
          kind: "harvest",
          quantity: 3500,
          receivedOn: day,
        });
      });
    }
    if (index % 7 !== 3) {
      continue;
    }
    // What the Rations eat in a week, bought with a margin.
    on(day, "11:00", "weekly feed purchase", async (f) => {
      const weekly: [FeedKey, number, number, FeedSeller][] = [
        ["concentrate", 1500, random.int(57, 61), FEED_SELLERS.mill],
        ["mustardCake", 500, random.int(60, 66), FEED_SELLERS.bazaar],
        ["bran", 950, random.int(46, 51), FEED_SELLERS.bazaar],
        ["maize", 750, random.int(34, 39), FEED_SELLERS.bazaar],
        ["pulseHusk", 380, random.int(28, 33), FEED_SELLERS.bazaar],
        ["straw", 2300, random.int(8, 11), FEED_SELLERS.straw],
      ];
      // The last order of minerals did not come, so the store is running low on them now.
      if (day < addDays(today, -12)) {
        weekly.push(["minerals", 55, 140, FEED_SELLERS.mill]);
      }
      for (const [key, quantity, price, seller] of weekly) {
        await f.as.manager.stock.receive({
          feedItemId: f.feeds[key],
          kind: "purchase",
          quantity,
          priceBdt: price * quantity,
          seller,
          receivedOn: day,
          paymentMethod: random.chance(0.5) ? "cash" : "bkash",
        });
      }
    });
  }
};

/** The dairy pens are walked every morning, the rest every third day; heats come from these rounds. */
const walkThePens = ({ days, on }: Script) => {
  for (const [index, day] of days.entries()) {
    const pens: PenKey[] = ["milking1", "milking2", "heifers"];
    if (index % 3 === 0) {
      pens.push("dry", "calves", "bullsA", "bullsB", "quarantine");
    }
    on(day, "08:00", "health rounds", async (f, h) => {
      for (const pen of pens) {
        if (penHolds(h, pen)) {
          await raise(f, "healthRound", pen);
        }
      }
    });
  }
};

/** Milk leaves every morning: the tank to the chilling centre, a can to the sweet shop. */
const sendTheMilk = ({ farm, days, on }: Script) => {
  const { random } = farm;
  for (const day of days) {
    on(day, "08:45", "milk dispatch", async (f) => {
      const since = new Date(onFarm(day, "08:45").getTime() - DAY);
      const records = await f.db.query.milkRecord.findMany({
        where: {
          farmId: f.farmId,
          destination: "bulk",
          recordedAt: { gte: since },
        },
        columns: { litres: true },
      });
      const litres = records.reduce((sum, row) => sum + Number(row.litres), 0);
      if (litres < 20) {
        return;
      }
      const sweets = Math.round(Math.min(40, litres * 0.1));
      const challan = `চালান-${day.replaceAll("-", "").slice(2)}`;
      await f.as.manager.milk.dispatch({
        dispatchedAt: onFarm(day, "08:45"),
        litres: Math.round(litres - sweets),
        buyer: random.chance(0.8) ? MILK_BUYERS.pran : MILK_BUYERS.milkVita,
        challan: `${challan}-${random.int(10, 99)}`,
        pricePerLitreBdt: random.int(56, 60),
        fatPercent: Math.round(random.between(3.8, 4.4) * 10) / 10,
        snfPercent: Math.round(random.between(8.1, 8.6) * 10) / 10,
        paymentMethod: "bank",
      });
      f.clock.set(onFarm(day, "09:10"));
      await f.as.manager.milk.dispatch({
        dispatchedAt: onFarm(day, "09:10"),
        litres: sweets,
        buyer: MILK_BUYERS.sweets,
        challan: `${challan}-মি`,
        pricePerLitreBdt: 70,
        paymentMethod: "cash",
      });
    });
  }
};

/** Each cow due inside the three months calves within a few days of her date, and goes back to milking. */
const calveTheCows = ({ farm, cows, on }: Script) => {
  const { start, today, random } = farm;
  for (const cow of cows) {
    if (!cow.expectedCalving) {
      continue;
    }
    const day = addDays(cow.expectedCalving, random.int(-4, 3));
    if (day <= start || day > addDays(today, -1)) {
      continue;
    }
    on(day, "05:50", `calving ${cow.tag}`, async (f, h) => {
      const her = h.cows.get(cow.tag);
      if (!her) {
        return;
      }
      if (her.pen !== "calving") {
        await moveCow(f, her, "calving", "প্রসবের সময় হয়েছে");
      }
      const planned = calvings.get(day) ?? new Set<string>();
      planned.add(her.tag);
      calvings.set(day, planned);
      await raise(f, "calvingRecord", "calving");
    });
    on(addDays(day, 2), "10:00", `back to milking ${cow.tag}`, async (f, h) => {
      const her = h.cows.get(cow.tag);
      if (her?.state !== "milking") {
        return;
      }
      const herd = [...h.cows.values()];
      const inOne = herd.filter((one) => one.pen === "milking1").length;
      const inTwo = herd.filter((one) => one.pen === "milking2").length;
      await moveCow(
        f,
        her,
        inOne <= inTwo ? "milking1" : "milking2",
        "প্রসবের পর দোহন পেনে"
      );
      const calves = await f.db.query.animal.findMany({
        where: {
          farmId: f.farmId,
          damId: { isNotNull: true },
          penId: f.pens.calving,
          state: "calf",
        },
        columns: { tagNumber: true },
      });
      for (const calf of calves) {
        await f.as.manager.animals.move({
          tagNumber: calf.tagNumber,
          toPenId: f.pens.calves,
          reason: "মায়ের সাথে দুই দিন রাখার পর বাছুর পেনে",
        });
      }
    });
  }
};

/** Quarantine over: into the fattening state and a fattening pen. */
const outOfQuarantine = async (
  f: Farm,
  h: Herd,
  arrivedOn: (day: string) => boolean,
  pen: PenKey
) => {
  for (const bull of h.bulls.values()) {
    if (bull.state === "quarantine" && arrivedOn(bull.arrivedOn)) {
      await f.as.manager.animals.setState({
        tagNumber: bull.tag,
        state: "fattening",
        reason: "কোয়ারেন্টিন শেষ, সুস্থ",
      });
      bull.state = "fattening";
      await moveBull(f, bull, pen, "কোয়ারেন্টিন শেষে মোটাতাজা পেনে");
    }
  }
};

/** Lorries from the hat, quarantine, and the fortnightly weigh-in. */
const fattenTheBulls = ({ farm, on }: Script) => {
  const { start, today } = farm;
  on(
    addDays(start, 1),
    "10:00",
    "quarantine over for the first lorry",
    (f, h) =>
      outOfQuarantine(
        f,
        h,
        (arrived) => daysBetween(arrived, addDays(start, 1)) >= 7,
        "bullsA"
      )
  );
  const lorries: [number, number, PenKey][] = [
    [18, 12, "bullsB"],
    [52, 10, "bullsB"],
    [daysBetween(start, today) - 4, 8, "bullsA"],
  ];
  for (const [offset, count, after] of lorries) {
    const day = addDays(start, offset);
    // The second lorry is a heavier lot for the Eid market: these reach the target first.
    on(day, "15:30", "a lorry of bulls", async (f, h) => {
      await takeInBulls(f, h, {
        on: day,
        count,
        pen: "quarantine",
        heavier: offset === 18 ? 60 : 0,
      });
    });
    on(addDays(day, 14), "10:00", "quarantine over", (f, h) =>
      outOfQuarantine(f, h, (arrived) => arrived === day, after)
    );
  }
  for (let offset = 2; offset <= daysBetween(start, today); offset += 14) {
    on(
      addDays(start, offset),
      "07:30",
      "fortnightly weigh-in",
      async (f, h) => {
        for (const pen of ["bullsA", "bullsB", "quarantine"] as PenKey[]) {
          if (penHolds(h, pen)) {
            await raise(f, "weighIn", pen);
          }
        }
      }
    );
  }
};

/** FMD before the rains, deworming, and lumpy skin. */
const runTheCampaigns = ({ farm, on }: Script) => {
  const campaigns: [
    number,
    "fmdVaccination" | "lsdVaccination" | "deworming",
    PenKey[],
  ][] = [
    [
      9,
      "fmdVaccination",
      ["milking1", "milking2", "dry", "heifers", "calves", "bullsA"],
    ],
    [24, "deworming", ["heifers", "calves", "bullsA", "bullsB"]],
    [
      40,
      "lsdVaccination",
      ["milking1", "milking2", "dry", "heifers", "bullsA", "bullsB"],
    ],
  ];
  for (const [offset, sop, pens] of campaigns) {
    on(addDays(farm.start, offset), "10:30", sop, async (f, h) => {
      for (const pen of pens) {
        if (penHolds(h, pen)) {
          await raise(f, sop, pen);
        }
      }
    });
  }
};

const payTheMonth = async (f: Farm, payday: string, withRepair: boolean) => {
  const { random } = f;
  const categories = await f.as.manager.money.categories();
  const id = (key: string) =>
    categories.find((category) => category.key === key)?.id ?? "";
  const wageMonth = addDays(payday, -20).slice(0, 7);
  const wages: [string, number][] = [
    ["জাহিদ হাসান", 14_000],
    ["মিনারা বেগম", 12_000],
    ["শফিকুল ইসলাম", 13_000],
    ["নাইট গার্ড — আব্দুল মালেক", 9000],
  ];
  for (const [name, amount] of wages) {
    await f.as.manager.money.enter({
      categoryId: id("wages"),
      amountBdt: amount,
      occurredOn: payday,
      counterparty: { name },
      paymentMethod: "bkash",
      wageMonth,
    });
  }
  // Fly spray, lime for the troughs, a lab test: money on the animals that names none of them. The Owner
  // marked the Category, so the month's worth of it is split across the animals standing that month.
  const sundries =
    categories.find((category) => category.nameBn === HERD_SUNDRIES)?.id ?? "";
  if (sundries !== "") {
    await f.as.manager.money.enter({
      categoryId: sundries,
      amountBdt: random.int(2800, 4600),
      occurredOn: payday,
      counterparty: { name: "পশু ওষুধের দোকান — সদর" },
      paymentMethod: "cash",
      side: "fattening",
      note: "মাছি স্প্রে, চুন ও পরীক্ষার খরচ",
    });
  }
  const bills: [string, number, string, "bank" | "cash", string][] = [
    [
      "utilities",
      random.int(17_500, 22_800),
      "ঢাকা পল্লী বিদ্যুৎ সমিতি-১",
      "bank",
      "মিল্কিং মেশিন, ফ্যান ও পাম্পের বিদ্যুৎ বিল",
    ],
    [
      "transport",
      random.int(6000, 9500),
      "পিকআপ ভাড়া — মোঃ রাসেল",
      "cash",
      "খাদ্য ও দুধ পরিবহন",
    ],
  ];
  if (withRepair) {
    bills.push([
      "repairs",
      23_500,
      "মেশিন মিস্ত্রি — আলাউদ্দিন",
      "cash",
      "মিল্কিং মেশিনের ভ্যাকুয়াম পাম্প মেরামত",
    ]);
  }
  for (const [key, amountBdt, name, paymentMethod, note] of bills) {
    await f.as.manager.money.enter({
      categoryId: id(key),
      amountBdt,
      occurredOn: payday,
      counterparty: { name },
      paymentMethod,
      note,
    });
  }
};

/** Counts the store against the book: perishables lose weight and rot, sacks come up a little short. */
const countTheStore = async (f: Farm) => {
  const { random } = f;
  const onHand = await f.as.manager.stock.onHand();
  for (const line of onHand) {
    const book = Number((line as { onHand?: number }).onHand ?? 0);
    const shelf = Math.max(0, book);
    const perishable =
      line.feedItemId === f.feeds.napier || line.feedItemId === f.feeds.silage;
    let loss = 0;
    if (perishable) {
      loss = random.between(0.02, 0.06);
    } else if (random.chance(0.5)) {
      loss = random.between(0.002, 0.015);
    }
    shelfCount.set(
      line.feedItemId,
      loss === 0 ? shelf : Math.round(shelf * (1 - loss) * 10) / 10
    );
    let reason = shelf === book ? "মিলেছে" : "খাতায় কম দেখাচ্ছিল, আগমন লেখা বাকি ছিল";
    if (loss > 0) {
      reason = perishable
        ? "শুকিয়ে ওজন কমেছে ও কিছু পচে নষ্ট হয়েছে"
        : "বস্তা মাপার সময় সামান্য কম পাওয়া গেছে";
    }
    shelfReason.set(line.feedItemId, reason);
  }
  await raise(f, "stockCount", "milking1");
};

/** Every month: wages and bills, the store counted, the Vet's visit billed; the Owner approves as she goes. */
const keepTheBooks = ({ farm, on }: Script) => {
  const { start, today } = farm;
  for (let month = 0; month < 3; month += 1) {
    const payday = addDays(start, 14 + month * 30);
    on(payday, "17:00", "wages and bills", (f) =>
      payTheMonth(f, payday, month === 1)
    );
    on(addDays(start, 29 + month * 30), "16:00", "stock count", countTheStore);
    const visit = addDays(start, 12 + month * 30);
    on(visit, "18:00", "vet visit fee", async (f) => {
      await f.as.vet.money.vetFee({
        amountBdt: 3000,
        visitedOn: visit,
        note: "মাসিক খামার পরিদর্শন ও গর্ভ পরীক্ষা",
        paymentMethod: "bkash",
      });
    });
  }
  // The Owner goes through what is waiting every few days; the last week's is still waiting for her.
  for (let offset = 5; offset < daysBetween(start, today) - 6; offset += 4) {
    on(addDays(start, offset), "21:00", "owner approvals", async (f) => {
      const waiting = await f.db.query.moneyEvent.findMany({
        where: { farmId: f.farmId, approval: "awaiting" },
        columns: { id: true, amountBdt: true },
      });
      for (const row of waiting) {
        await f.as.owner.money.approve({
          id: row.id,
          amountBdt: row.amountBdt,
        });
      }
    });
  }
};

/** A phone for the dairy shed, the staff's PINs and training; lately a newcomer and a proposed change. */
const organiseThePeople = ({ farm, on }: Script) => {
  const { start, today } = farm;
  on(start, "07:00", "shed phone, PINs and training", async (f) => {
    await f.as.owner.devices.enrol({ name: "গাভীর শেডের ফোন" });
    const staff: [keyof Farm["accounts"], string, (keyof Farm["sops"])[]][] = [
      [
        "milker",
        "1357",
        [
          "morningMilking",
          "eveningMilking",
          "healthRound",
          "calvingRecord",
          "dryOff",
        ],
      ],
      ["feeder", "2468", ["feeding"]],
      [
        "stockman",
        "3690",
        [
          "weighIn",
          "treatmentDose",
          "fmdVaccination",
          "lsdVaccination",
          "deworming",
          "burial",
          "healthRound",
        ],
      ],
    ];
    for (const [key, pin, sops] of staff) {
      const userId = f.accounts[key].session.user.id;
      await f.as.owner.people.setPin({ userId, pin });
      for (const sop of sops) {
        const definition = await f.db.query.sopDefinition.findFirst({
          where: { id: f.sops[sop] },
          columns: { currentVersionId: true },
        });
        await f.as.manager.sops.recordTraining({
          userId,
          versionId: definition?.currentVersionId ?? "",
        });
      }
    }
  });
  on(addDays(today, -3), "19:00", "a newcomer invited", async (f) => {
    await f.as.manager.people.invite({
      email: "rakib@openfarm.test",
      name: "মোঃ রাকিব হোসেন",
      roles: ["staff"],
    });
  });
  on(
    addDays(today, -2),
    "20:00",
    "a change to the Playbook proposed",
    async (f) => {
      const definition = await f.db.query.sopDefinition.findFirst({
        where: { id: f.sops.feeding },
        with: { currentVersion: true },
      });
      const content = definition?.currentVersion?.content as Parameters<
        ApiClient["sops"]["propose"]
      >[0]["content"];
      await f.as.manager.sops.propose({
        definitionId: f.sops.feeding,
        content: {
          ...content,
          triggers: [{ kind: "schedule", times: ["06:30", "12:30", "18:00"] }],
          purpose: {
            bn: "গরমের মাসে তিন বেলা ভাগ করে রেশন দিন, আর আগের বেলার বেঁচে যাওয়া খাবার লিখুন",
            en: "In the hot months split the ration over three feeds, and record what was left from the last feed",
          },
        },
        note: "গরমে গাভী দুপুরে কম খাচ্ছে — তিন বেলা ভাগ করে দিলে অপচয় কমবে",
      });
    }
  );
};

/** The round's Observation of this animal on this day, which the Vet's Diagnosis answers. */
const observationsOf = async (f: Farm, tag: string, day: string) => {
  const seen = await f.db.query.observation.findMany({
    where: {
      farmId: f.farmId,
      seenAt: {
        gte: onFarm(day, "00:00"),
        lt: onFarm(addDays(day, 1), "00:00"),
      },
    },
    columns: { id: true },
    with: { animal: { columns: { tagNumber: true } } },
  });
  return seen.find((row) => row.animal.tagNumber === tag)?.id;
};

interface Case {
  offset: number;
  tag: () => string | undefined;
  sighting: string;
  disease: { bn: string; en: string };
  note: string;
  course: {
    drug: StandardDrugKey;
    dose: string;
    route: "intramammary" | "intramuscular" | "intravenous" | "subcutaneous";
    times: string[];
    days: number;
  }[];
  isolate?: boolean;
}

/** What the rounds saw, what the Vet concluded, and what she prescribed. */
const nurseTheSick = ({ farm, herd, cows, on }: Script) => {
  const { start, today } = farm;
  const milkingIn = (pen: PenKey) =>
    cows.filter(
      (cow) =>
        cow.state === "milking" && cow.pen === pen && !cow.expectedCalving
    );
  const mastitis = {
    bn: "ক্লিনিক্যাল ম্যাস্টাইটিস (ওলান প্রদাহ)",
    en: "Clinical mastitis",
  };
  const tube = {
    drug: "intramammary",
    dose: "আক্রান্ত বাঁটে ১ টিউব",
    route: "intramammary",
    times: ["07:00", "19:00"],
    days: 3,
  } as const;
  const lumpyLorry = addDays(start, 52);
  const cases: Case[] = [
    {
      offset: 6,
      tag: () => pickFrom(milkingIn("milking1"), 2)?.tag,
      sighting: ROUND_WORDS.mastitis,
      disease: mastitis,
      note: "সামনের ডান বাঁট শক্ত ও গরম, দুধে ছানা। সিএমটি +++",
      course: [
        { ...tube, times: [...tube.times] },
        {
          drug: "meloxicam",
          dose: "১৫ মিলি",
          route: "intramuscular",
          times: ["09:00"],
          days: 1,
        },
      ],
    },
    {
      offset: 19,
      tag: () => pickFrom(milkingIn("milking2"), 4)?.tag,
      sighting: ROUND_WORDS.lame,
      disease: { bn: "খুরের পচা ঘা (ফুট রট)", en: "Foot rot" },
      note: "পেছনের বাম পায়ের খুরের ফাঁকে দুর্গন্ধযুক্ত ঘা। খুর পরিষ্কার করে কপার সালফেট দেওয়া হয়েছে",
      course: [
        {
          drug: "oxytet",
          dose: "২০ মিলি",
          route: "intramuscular",
          times: ["09:30"],
          days: 3,
        },
      ],
    },
    {
      offset: 33,
      tag: () =>
        [...herd.bulls.values()].find((bull) => bull.pen === "bullsA")?.tag,
      sighting: ROUND_WORDS.cough,
      disease: { bn: "নিউমোনিয়া", en: "Pneumonia" },
      note: "জ্বর ১০৪.৫°F, দ্রুত শ্বাস, নাক দিয়ে পানি। আলাদা করে রাখুন",
      course: [
        {
          drug: "ceftiofur",
          dose: "১২ মিলি",
          route: "intramuscular",
          times: ["10:00"],
          days: 3,
        },
      ],
      isolate: true,
    },
    {
      offset: 61,
      tag: () =>
        [...herd.bulls.values()].find((bull) => bull.arrivedOn === lumpyLorry)
          ?.tag,
      sighting: ROUND_WORDS.offFeed,
      disease: { bn: "লাম্পি স্কিন ডিজিজ", en: "Lumpy skin disease" },
      note: "সারা গায়ে শক্ত গুটি, জ্বর ১০৫°F, খাবারে অরুচি। আলাদা পেনে রাখুন, মশা-মাছি নিয়ন্ত্রণ করুন। উপজেলা অফিসে জানানো হবে",
      course: [
        {
          drug: "meloxicam",
          dose: "১৫ মিলি",
          route: "intramuscular",
          times: ["09:00"],
          days: 3,
        },
      ],
      isolate: true,
    },
    {
      offset: daysBetween(start, today) - 2,
      tag: () => pickFrom(milkingIn("milking2"), 7)?.tag,
      sighting: ROUND_WORDS.mastitis,
      disease: mastitis,
      note: "পেছনের বাম বাঁট ফোলা, দুধ পানির মতো। সিএমটি ++",
      course: [{ ...tube, times: [...tube.times] }],
    },
  ];

  for (const sick of cases) {
    const day = addDays(start, sick.offset);
    let tag: string | undefined;
    on(day, "07:55", "something to see", () => {
      tag = sick.tag();
      if (tag) {
        see(day, tag, sick.sighting);
      }
      return Promise.resolve();
    });
    on(day, "11:00", `the Vet sees ${sick.disease.en}`, async (f, h) => {
      if (!tag) {
        return;
      }
      const bull = sick.isolate ? h.bulls.get(tag) : undefined;
      if (bull) {
        const home = bull.pen;
        await moveBull(f, bull, "isolation", "অসুস্থ — আলাদা করে রাখা");
        on(addDays(day, 10), "10:00", "back from isolation", async (g) => {
          if (bull.pen === "isolation") {
            await moveBull(g, bull, home, "সুস্থ হয়ে পেনে ফেরত");
          }
        });
      }
      const diagnosis = await f.as.vet.diagnoses.record({
        animalTag: tag,
        answers: await observationsOf(f, tag, day),
        disease: sick.disease,
        note: sick.note,
      });
      for (const course of sick.course) {
        await f.as.vet.prescriptions.prescribe({
          animalTag: tag,
          diagnosisId: diagnosis.id,
          productId: f.drugs[course.drug] ?? "",
          dose: course.dose,
          route: course.route,
          times: course.times,
          days: course.days,
        });
      }
    });
  }
};

/** A calf that did not make it: seen off her feed, treated, dead three days later and buried. */
const loseACalf = ({ farm, cows, on }: Script) => {
  const dies = addDays(farm.start, 50);
  const sick = addDays(dies, -3);
  let calfTag: string | undefined;
  on(sick, "07:55", "a calf off her feed", () => {
    calfTag = cows.find(
      (cow) => cow.state === "calf" && cow.pen === "calves"
    )?.tag;
    if (calfTag) {
      see(sick, calfTag, ROUND_WORDS.offFeed);
    }
    return Promise.resolve();
  });
  on(sick, "11:30", "the Vet sees the calf", async (f) => {
    if (!calfTag) {
      return;
    }
    const diagnosis = await f.as.vet.diagnoses.record({
      animalTag: calfTag,
      answers: await observationsOf(f, calfTag, sick),
      disease: { bn: "বাছুরের ডায়রিয়া", en: "Calf scours" },
      note: "পাতলা পায়খানা, পানিশূন্যতা। স্যালাইন খাওয়াতে থাকুন",
    });
    await f.as.vet.prescriptions.prescribe({
      animalTag: calfTag,
      diagnosisId: diagnosis.id,
      productId: f.drugs.oxytet ?? "",
      dose: "৩ মিলি",
      route: "intramuscular",
      times: ["09:00"],
      days: 3,
    });
  });
  on(dies, "06:40", "the calf died", async (f, h) => {
    if (!calfTag) {
      return;
    }
    await f.as.manager.animals.recordMortality({
      tagNumber: calfTag,
      kind: "died",
      cause: "ডায়রিয়া ও পানিশূন্যতা, চিকিৎসায় সাড়া দেয়নি",
      disposal: "buried",
      disposalNote: "খামারের পূর্ব কোণে ছয় ফুট গভীরে চুন দিয়ে",
      happenedAt: onFarm(dies, "04:30"),
    });
    h.cows.delete(calfTag);
  });
};

/** What a bull will weigh three months after he came. */
const projected = (bull: { weightKg: number; dailyGainKg: number }) =>
  bull.weightKg + bull.dailyGainKg * 90;

/** The heaviest of the first lorry go to the Eid buyers, two still waiting; an old cow goes to the butcher. */
const sellTheReady = ({ farm, on }: Script) => {
  const { start, today, random } = farm;
  on(addDays(today, -14), "12:00", "bulls confirmed ready", async (f, h) => {
    const first = [...h.bulls.values()]
      .filter(
        (bull) =>
          bull.state === "fattening" &&
          bull.arrivedOn === addDays(start, -6) &&
          bull.pen !== "isolation"
      )
      .toSorted((a, b) => projected(b) - projected(a))
      .slice(0, 6);
    for (const bull of first) {
      await f.as.manager.ready.confirm({ tagNumber: bull.tag });
      bull.state = "ready_for_sale";
    }
  });
  // The day at the haat: four bulls went, and what the day cost is split across all of them — the two
  // that came home again took a place on the lorry too.
  on(addDays(today, -9), "05:30", "off to the haat", async (f, h) => {
    const going = [...h.bulls.values()]
      .filter((bull) => bull.state === "ready_for_sale")
      .slice(0, 6)
      .map((bull) => bull.tag);
    if (going.length === 0) {
      return;
    }
    await f.as.manager.sellingTrips.record({
      wentTo: "গাবতলী পশুর হাট, ঢাকা",
      transportBdt: random.int(7000, 9000),
      keepBdt: random.int(1200, 2200),
      animals: going,
      wentOn: onFarm(addDays(today, -9), "05:30"),
      paymentMethod: "cash",
    });
  });
  for (const [index, offset] of [-9, -9, -6, -4].entries()) {
    const day = addDays(today, offset);
    on(day, `${10 + index}:30`, "a bull sold", async (f, h) => {
      const bull = [...h.bulls.values()].find(
        (one) => one.state === "ready_for_sale"
      );
      if (!bull) {
        return;
      }
      const weightKg = Math.round(
        bull.weightKg + bull.dailyGainKg * daysBetween(bull.arrivedOn, day)
      );
      const buyer = random.pick(CATTLE_BUYERS);
      await f.as.manager.sale.record({
        tagNumber: bull.tag,
        buyer,
        priceBdt:
          Math.round((weightKg * random.between(560, 620)) / 1000) * 1000,
        weightKg,
        destination: buyer.address,
        vehicle: `ঢাকা মেট্রো-ন ${random.int(11, 19)}-${random.int(1000, 9999)}`,
        driver: random.pick(["মোঃ হাবিব", "সোহেল রানা", "আব্দুর রহিম"]),
        paymentMethod: random.chance(0.5) ? "bank" : "cash",
      });
      bull.state = "sold";
    });
  }
  on(addDays(start, 70), "11:00", "a cull", async (f, h) => {
    const old = [...h.cows.values()].find(
      (cow) => cow.state === "milking" && !cow.expectedCalving && cow.peak < 8
    );
    const [butcher] = CATTLE_BUYERS;
    if (!(old && butcher)) {
      return;
    }
    await f.as.manager.sale.record({
      tagNumber: old.tag,
      buyer: butcher,
      priceBdt: 78_000,
      weightKg: 285,
      destination: butcher.address,
      vehicle: "ঢাকা মেট্রো-ন ১৫-৪৪১৮",
      driver: "মোঃ হাবিব",
      note: "দুধ কমে গেছে, তিনবার প্রজনন করেও গর্ভধারণ করেনি — বাছাই করে বিক্রি",
      paymentMethod: "cash",
    });
    h.cows.delete(old.tag);
  });
};

/** The script of the three months. */
export const scriptTheDays = (farm: Farm, herd: Herd): Happening[] => {
  const happenings: Happening[] = [];
  const days: string[] = [];
  for (let day = farm.start; day <= farm.today; day = addDays(day, 1)) {
    days.push(day);
  }
  const script: Script = {
    farm,
    herd,
    days,
    cows: [...herd.cows.values()],
    on: (day, time, what, run) => {
      if (day >= farm.start && day <= farm.today) {
        happenings.push({ day, time, what, run });
      }
    },
  };
  for (const part of [
    keepTheStore,
    walkThePens,
    sendTheMilk,
    calveTheCows,
    fattenTheBulls,
    runTheCampaigns,
    keepTheBooks,
    organiseThePeople,
    nurseTheSick,
    loseACalf,
    sellTheReady,
  ]) {
    part(script);
  }
  return happenings;
};
