import { onFarm } from "./runtime";
import type { Farm } from "./standing";

/** The month `back` months before a farm day's own, "YYYY-MM". */
const monthsBefore = (day: string, back: number): string => {
  const [year = 0, month = 1] = day.split("-").map(Number);
  const at = new Date(Date.UTC(year, month - 1 - back, 1));
  return at.toISOString().slice(0, 7);
};

/**
 * The Owner reads the office bKash number's statements: the first, three months back, is what it held; the next agrees
 * with the books; last month's is ৳1,500 short — a cash-in the Manager wrote that never reached the number — and she
 * writes down what she found out. It stays named on her home until it agrees.
 */
export const readTheStatements = async (farm: Farm) => {
  farm.clock.set(onFarm(farm.today, "08:30"));
  const { owner } = farm.as;
  const id = farm.farmAccounts.bkash;
  await owner.farmAccounts.check({
    id,
    month: monthsBefore(farm.today, 3),
    readBdt: 38_600,
  });
  const agreeing = monthsBefore(farm.today, 2);
  const believed = await owner.farmAccounts.expectedAtMonthEnd({
    id,
    month: agreeing,
  });
  await owner.farmAccounts.check({
    id,
    month: agreeing,
    readBdt: believed.expectedBdt ?? 0,
  });
  const short = monthsBefore(farm.today, 1);
  const books = await owner.farmAccounts.expectedAtMonthEnd({
    id,
    month: short,
  });
  await owner.farmAccounts.check({
    id,
    month: short,
    readBdt: (books.expectedBdt ?? 0) - 1500,
    note: "স্টেটমেন্টে একটি দেড় হাজার টাকার জমা নেই — ম্যানেজারকে জিজ্ঞেস করেছি, এজেন্টের রসিদ খুঁজছে",
  });
};
