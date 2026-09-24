import type { Bull, Cow, Herd } from "./herd";
import { DAY, onFarm } from "./runtime";
import type { Farm, PenKey } from "./standing";

export const MINUTE = 60_000;

/** Days from one farm day to another. */
export const daysBetween = (from: string, to: string) =>
  Math.round((onFarm(to).getTime() - onFarm(from).getTime()) / DAY);

/** The item at a position in a list, going round when the list is short. */
export const pickFrom = <T>(items: T[], index: number): T | undefined =>
  items[index % Math.max(1, items.length)];

/** What the rounds are to see, and when: a cow gone lame, an udder gone hard, a bull coughing. */
export const sightings = new Map<string, Map<string, string>>();
export const see = (day: string, tag: string, sighting: string) => {
  const onDay = sightings.get(day) ?? new Map<string, string>();
  onDay.set(tag, sighting);
  sightings.set(day, onDay);
};

/** Who calves on which day, set when the calving is planned. */
export const calvings = new Map<string, Set<string>>();

/** What the store count finds of each Feed Item, and why it differs from the book, set just before counting. */
export const shelfCount = new Map<string, number>();
export const shelfReason = new Map<string, string>();

/** The Manager raises a piece of the Playbook for a Pen, by hand. */
export const raise = async (
  farm: Farm,
  sop: keyof Farm["sops"],
  pen: PenKey
) => {
  await farm.as.manager.instances.raiseNow({
    definitionId: farm.sops[sop],
    penId: farm.pens[pen],
  });
};

/** Whether any animal still on the farm stands in the Pen. */
export const penHolds = (herd: Herd, pen: PenKey) =>
  [...herd.cows.values()].some((cow) => cow.pen === pen) ||
  [...herd.bulls.values()].some(
    (bull) => bull.pen === pen && bull.state !== "sold" && bull.state !== "died"
  );

export const moveCow = async (
  farm: Farm,
  cow: Cow,
  pen: PenKey,
  reason: string
) => {
  await farm.as.manager.animals.move({
    tagNumber: cow.tag,
    toPenId: farm.pens[pen],
    reason,
  });
  cow.pen = pen;
};

export const moveBull = async (
  farm: Farm,
  bull: Bull,
  pen: PenKey,
  reason: string
) => {
  await farm.as.manager.animals.move({
    tagNumber: bull.tag,
    toPenId: farm.pens[pen],
    reason,
  });
  bull.pen = pen;
};

export const MILK_BUYERS = {
  pran: {
    name: "প্রাণ ডেইরি — বিরুলিয়া চিলিং সেন্টার",
    address: "বিরুলিয়া, সাভার",
    phone: "01730-091245",
  },
  milkVita: {
    name: "মিল্ক ভিটা সংগ্রহ কেন্দ্র",
    address: "টঙ্গী, গাজীপুর",
    phone: "01913-455120",
  },
  sweets: { name: "মা মিষ্টান্ন ভাণ্ডার", address: "সাভার বাজার", phone: "01552-318907" },
};

export const CATTLE_BUYERS = [
  {
    name: "মোঃ জসিম উদ্দিন (ব্যাপারী)",
    address: "কাপ্তান বাজার, ঢাকা",
    phone: "01711-620934",
  },
  { name: "হাজী সিরাজুল ইসলাম", address: "মোহাম্মদপুর, ঢাকা", phone: "01819-775310" },
  { name: "রহমান মিট প্রসেসিং", address: "গাজীপুর", phone: "01720-446811" },
];

export const FEED_SELLERS = {
  mill: { name: "এসিআই অ্যানিমেল হেলথ — ডিলার, সাভার", phone: "01713-004521" },
  bazaar: {
    name: "হাজী আব্দুর রশিদ ট্রেডার্স",
    address: "সাভার বাজার",
    phone: "01711-338904",
  },
  straw: { name: "খড় ব্যবসায়ী মোঃ কামাল", address: "ধামরাই", phone: "01934-110287" },
};
export type FeedSeller = (typeof FEED_SELLERS)[keyof typeof FEED_SELLERS];

/** The breed on the farm's list a seeded animal is written down under, by the Bangla name the seed gives her. The
 *  seed names only standard breeds, so a name the list does not have is the seed's mistake, and stops the run. */
export const breedIdNamed = async (
  manager: {
    breeds: { list: () => Promise<readonly { id: string; nameBn: string }[]> };
  },
  name: string
): Promise<string> => {
  const breeds = await manager.breeds.list();
  const found = breeds.find((one) => one.nameBn === name);
  if (!found) {
    throw new Error(`The seed names a breed the list does not have: ${name}`);
  }
  return found.id;
};
