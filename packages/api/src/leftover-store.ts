import type { Database } from "@OpenFarm/db";
import type { FeedingLine, LeftoverStanding } from "@OpenFarm/domain";
import {
  leftoverPercent,
  leftoverStanding,
  priceHistory,
  roundKg,
  roundTaka,
} from "@OpenFarm/domain";

import { movementsByItem } from "./stock-store";

/** What is worth looking at first: feed thrown away, then troughs never left with a scrap. */
const STANDING_ORDER: Record<LeftoverStanding, number> = {
  wasting: 0,
  all_eaten: 1,
  fine: 2,
  too_few: 3,
};

/** One Pen's Leftovers of one Feed Item over the period, and where they stand. */
export interface PenLeftovers {
  penId: string;
  /** The Shed and the Pen, as the farm says them. */
  penName: string;
  /** The Ration it was last fed on in the period — what to change, where it is wasting. */
  rationName: string | null;
  feedItemId: string;
  itemName: string;
  unit: string;
  givenKg: number;
  leftoverKg: number;
  leftoverPercent: number;
  sessions: number;
  sessionsWithLeftover: number;
  /** What was left behind cost, at the price each session was charged at; null for feed never priced. */
  worthBdt: number | null;
  standing: LeftoverStanding;
}

interface Tally {
  penId: string;
  feedItemId: string;
  givenKg: number;
  leftoverKg: number;
  sessions: number;
  sessionsWithLeftover: number;
  /** Each session's leftover and when it was fed, to be priced at that moment. */
  left: { at: Date; kg: number }[];
  rationVersionId: string;
}

/** The price of each Feed Item at any moment, from one replay of its store each. */
const pricesOf = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string,
  tallies: readonly Tally[]
) => {
  const anythingLeft = tallies.some((one) => one.left.length > 0);
  // A store replayed for feed nobody left behind is a replay for nothing.
  const movements = anythingLeft
    ? await movementsByItem(db, farmId)
    : new Map<string, never[]>();
  const lookups = new Map<string, (at: Date) => number | null>();
  return (feedItemId: string, at: Date): number | null => {
    let priceAt = lookups.get(feedItemId);
    if (!priceAt) {
      priceAt = priceHistory(movements.get(feedItemId) ?? []);
      lookups.set(feedItemId, priceAt);
    }
    return priceAt(at);
  };
};

/** Nothing left is worth nothing; something left of feed never bought or priced is worth a figure nobody knows. */
const worthOf = (
  tally: Tally,
  priced: readonly (number | null)[],
  worth: number
): number | null => {
  if (tally.left.length === 0) {
    return 0;
  }
  return priced.some((one) => one !== null) ? roundTaka(worth) : null;
};

/** Every session's lines, added up by Pen and Feed Item — in the order fed, so the Ration kept is the latest. */
const tallied = (
  feedings: readonly {
    penId: string;
    fedAt: Date;
    lines: unknown;
    rationVersionId: string;
  }[]
): Tally[] => {
  const tallies = new Map<string, Tally>();
  for (const one of feedings) {
    for (const line of one.lines as FeedingLine[]) {
      const key = `${one.penId}:${line.feedItemId}`;
      const tally = tallies.get(key) ?? {
        penId: one.penId,
        feedItemId: line.feedItemId,
        givenKg: 0,
        leftoverKg: 0,
        sessions: 0,
        sessionsWithLeftover: 0,
        left: [],
        rationVersionId: one.rationVersionId,
      };
      tally.givenKg += line.givenKg;
      tally.leftoverKg += line.leftoverKg;
      tally.sessions += 1;
      if (line.leftoverKg > 0) {
        tally.sessionsWithLeftover += 1;
        tally.left.push({ at: one.fedAt, kg: line.leftoverKg });
      }
      tally.rationVersionId = one.rationVersionId;
      tallies.set(key, tally);
    }
  }
  return [...tallies.values()];
};

/**
 * Every Pen's Leftovers over a period, one line per Feed Item it was fed.
 *
 * Per Feed Item rather than per Pen, because each is in its own unit — straw may come in bales — and because the
 * answer is item by item: a Pen that leaves its straw and clears its concentrate is given too much straw. Priced the
 * way the Feeding was charged, so the taka left in the trough is taka the animals were charged for and did not eat.
 */
export const leftoversOf = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string,
  { since, until }: { since: Date; until: Date }
): Promise<PenLeftovers[]> => {
  const feedings = await db.query.feeding.findMany({
    where: { farmId, fedAt: { gte: since, lte: until } },
    columns: { penId: true, fedAt: true, lines: true, rationVersionId: true },
    orderBy: { fedAt: "asc", id: "asc" },
  });
  const tallies = tallied(feedings);
  if (tallies.length === 0) {
    return [];
  }
  // Callers may hand this a transaction, whose one client runs one query at a time.
  const pens = await db.query.pen.findMany({
    where: {
      farmId,
      id: { in: [...new Set(tallies.map((one) => one.penId))] },
    },
    columns: { id: true, name: true },
    with: { shed: { columns: { name: true } } },
  });
  const items = await db.query.feedItem.findMany({
    where: {
      farmId,
      id: { in: [...new Set(tallies.map((one) => one.feedItemId))] },
    },
    columns: { id: true, nameBn: true, unit: true },
  });
  const versions = await db.query.rationVersion.findMany({
    where: {
      id: { in: [...new Set(tallies.map((one) => one.rationVersionId))] },
    },
    columns: { id: true },
    with: { ration: { columns: { nameBn: true } } },
  });
  const priceOf = await pricesOf(db, farmId, tallies);
  const penOf = new Map(pens.map((one) => [one.id, one]));
  const itemOf = new Map(items.map((one) => [one.id, one]));
  const rationOf = new Map(
    versions.map((one) => [one.id, one.ration.nameBn] as const)
  );

  // The trough as a whole: a Pen that left anything of anything is a Pen fed enough, whatever it cleared.
  const pensThatLeft = new Set(
    tallies.flatMap((one) => (one.left.length > 0 ? [one.penId] : []))
  );
  const rows = tallies.map((tally): PenLeftovers => {
    const pen = penOf.get(tally.penId);
    const item = itemOf.get(tally.feedItemId);
    const priced = tally.left.map((one) => priceOf(tally.feedItemId, one.at));
    const worth = tally.left.reduce(
      (sum, one, index) => sum + one.kg * (priced[index] ?? 0),
      0
    );
    const givenKg = roundKg(tally.givenKg);
    const leftoverKg = roundKg(tally.leftoverKg);
    return {
      penId: tally.penId,
      penName: pen ? `${pen.shed.name} / ${pen.name}` : "",
      rationName: rationOf.get(tally.rationVersionId) ?? null,
      feedItemId: tally.feedItemId,
      itemName: item?.nameBn ?? "",
      unit: item?.unit ?? "kg",
      givenKg,
      leftoverKg,
      leftoverPercent: leftoverPercent({ givenKg, leftoverKg }),
      sessions: tally.sessions,
      sessionsWithLeftover: tally.sessionsWithLeftover,
      worthBdt: worthOf(tally, priced, worth),
      standing: leftoverStanding(tally, {
        penLeftAnything: pensThatLeft.has(tally.penId),
      }),
    };
  });
  return rows.toSorted(
    (a, b) =>
      STANDING_ORDER[a.standing] - STANDING_ORDER[b.standing] ||
      (b.worthBdt ?? 0) - (a.worthBdt ?? 0) ||
      a.penName.localeCompare(b.penName) ||
      a.itemName.localeCompare(b.itemName)
  );
};
