/**
 * Feed made on the farm (CONTEXT.md **Feed Making**, ADR 0031): a home-mixed concentrate made the same day, or silage
 * packed into a pit and opened a month on. Its inputs leave the store the moment it was made, its made feed comes in
 * when it came out, worth what went into it — worked out by the store (`bringMakingsIn`), never kept on a row. A
 * transfer inside the store: no Money Event, no Feed Purchase price to compare, no Feeding to charge.
 */
import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq, sql } from "@OpenFarm/db/operators";
import {
  feedIn,
  feedMaking,
  feedMakingInput,
  feeding,
} from "@OpenFarm/db/schema/feed";
import {
  farmDayOf,
  leastOnHandFrom,
  madeUnitPriceOf,
  makingLossOf,
  roundKg,
  wentShortFrom,
} from "@OpenFarm/domain";
import { expiryWindow } from "@OpenFarm/domain/lots";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import {
  refuseSettledVentures,
  venturesCharged,
} from "./corrections/correction";
import { lockTheFarm } from "./farm-lock";
import {
  MAKING_WITH,
  inputsSaid,
  loadMaking,
  loadMakings,
  makingRead,
} from "./making-shape";
import type { FeedStore } from "./stock-store";
import { feedStoreOf, quantityInput, stockOnHand } from "./stock-store";
import { seenWhenDone } from "./writes-seen";

/** Whoever makes feed, on which farm, under which Role. */
type Maker = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: NonNullable<Context["actor"]>;
};

/** The most inputs one making takes: a concentrate of a dozen things is already a long list. */
const MOST_INPUTS = 20;

/** What a making took out of the store: each Feed Item once, in its own unit. */
export const makingInputs = z
  .array(z.object({ feedItemId: z.string(), quantity: quantityInput }))
  .min(1)
  .max(MOST_INPUTS);

export type MakingInputs = z.infer<typeof makingInputs>;

const refused = (refusal: string, message: string, more: object = {}) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal, ...more } });

/** A moment that has not come yet is refused, as feed coming in on a day to come is. */
export const notToCome = (at: Date, now: Date, refusal: string): Date => {
  if (at > now) {
    throw refused(refusal, "That has not happened yet");
  }
  return at;
};

/**
 * Inputs a making may take: each Feed Item of this farm once, kept on its list rather than retired — a retired one is
 * kept for what it was fed, not for using up — and never the feed it makes.
 */
export const assertInputsMake = async (
  tx: Tx,
  farmId: string,
  outputFeedItemId: string,
  inputs: MakingInputs,
  { newOnly }: { newOnly?: ReadonlySet<string> } = {}
) => {
  const ids = inputs.map((one) => one.feedItemId);
  if (new Set(ids).size !== ids.length) {
    throw refused("input_twice", "Each feed goes into a making once");
  }
  if (ids.includes(outputFeedItemId)) {
    throw refused("made_from_itself", "A feed is not made from itself");
  }
  const found = await tx.query.feedItem.findMany({
    where: { farmId, id: { in: [...ids, outputFeedItemId] } },
    columns: { id: true, nameBn: true, retiredAt: true },
  });
  const byId = new Map(found.map((one) => [one.id, one]));
  if ([...ids, outputFeedItemId].some((id) => !byId.has(id))) {
    throw new ORPCError("NOT_FOUND", { message: "No such feed" });
  }
  const retired = [...ids, outputFeedItemId]
    .filter((id) => newOnly === undefined || newOnly.has(id))
    .map((id) => byId.get(id))
    .find((one) => one?.retiredAt);
  if (retired) {
    throw refused("feed_retired", "That feed is retired", {
      feed: retired.nameBn,
    });
  }
};

/** The store as it stood before a write, and as it would stand without the Making written at all. */
interface StoreBefore {
  before: FeedStore;
  without: FeedStore;
}

/** The words a store taken short is refused with: what was taken, or — for a void — what it made, used. */
type ShortWord = "not_enough_in_the_store" | "making_output_used";

/**
 * Refuses a write that takes the store short: compared moment by moment from `from` on, it holds less than nothing at
 * some moment where it did not, or less than it already did — a Making dated back past the week's Feedings, inputs
 * put right upwards, a made feed voided or made smaller after it was fed out (`wentShortFrom`). Read as the store now
 * stands, inside the write. Every feed that falls short is named, with the most the store could have spared of it
 * without this Making.
 */
export const assertTheStoreHolds = async (
  tx: Tx,
  farmId: string,
  { before, without }: StoreBefore,
  items: Iterable<string>,
  from: Date,
  word: ShortWord = "not_enough_in_the_store"
) => {
  const after = await feedStoreOf(tx, farmId);
  const short = [...new Set(items)].flatMap((feedItemId) => {
    const went = wentShortFrom(
      before.movements.get(feedItemId) ?? [],
      after.movements.get(feedItemId) ?? [],
      from
    );
    if (!went) {
      return [];
    }
    const spare = leastOnHandFrom(
      without.movements.get(feedItemId) ?? [],
      from
    );
    return [{ feedItemId, onHand: Math.max(0, spare) }];
  });
  if (short.length > 0) {
    throw refused(
      word,
      word === "making_output_used"
        ? "What it made has been fed or made into other feed since"
        : "A making takes no more than the store held, then or since",
      { short }
    );
  }
};

/**
 * The Feed Items whose price a change to these, from a moment, moves: themselves, and every feed made from them since,
 * and what was made from that in its turn, down the chain — concentrate mixed from bran is priced through the bran.
 */
export const pricedThrough = async (
  db: Tx,
  farmId: string,
  items: Iterable<string>,
  from: Date
): Promise<Set<string>> => {
  const loaded = await loadMakings(db, farmId);
  const makings = loaded.map(makingRead);
  const reached = new Set(items);
  let grew = true;
  while (grew) {
    grew = false;
    for (const one of makings) {
      if (
        one.madeAt >= from &&
        !reached.has(one.outputFeedItemId) &&
        one.inputs.some((input) => reached.has(input.feedItemId))
      ) {
        reached.add(one.outputFeedItemId);
        grew = true;
      }
    }
  }
  return reached;
};

/** The Ventures whose Animals were fed any of these feeds, or feed made from them, from a moment on. */
export const venturesFedThrough = async (
  tx: Tx,
  farmId: string,
  items: Iterable<string>,
  from: Date
): Promise<readonly string[]> => {
  const reached = await pricedThrough(tx, farmId, items, from);
  return venturesCharged(tx, farmId, (costs) =>
    costs.charges.filter(
      (one) => one.kind === "feed" && reached.has(one.fromId) && one.at >= from
    )
  );
};

/**
 * Refuses a Making made, or a pit opened, that would move the price of Feedings a settled Venture's Animals were
 * charged — of its inputs, whose average a later lorry is struck over what it left, of its made feed, and of feed made
 * from either — as a Feed In put right is refused. Asked only where it could: a farm with a settled Venture, and a
 * Feeding of any of them at or after the moment.
 */
const refuseSettledFeedings = async (
  tx: Tx,
  farmId: string,
  feedItemIds: readonly string[],
  from: Date
) => {
  const settled = await tx.query.venture.findFirst({
    where: { farmId, state: "settled" },
    columns: { id: true },
  });
  if (!settled) {
    return;
  }
  const reached = [...(await pricedThrough(tx, farmId, feedItemIds, from))];
  const fedSince = await tx.execute(
    sql`select 1 from ${feeding}, jsonb_array_elements(${feeding.lines}) as line
         where ${feeding.farmId} = ${farmId} and ${feeding.fedAt} >= ${from}
           and line->>'feedItemId' in (${sql.join(
             reached.map((id) => sql`${id}`),
             sql`, `
           )})
         limit 1`
  );
  if (fedSince.rows.length === 0) {
    return;
  }
  await refuseSettledVentures(
    tx,
    farmId,
    await venturesFedThrough(tx, farmId, feedItemIds, from)
  );
};

/** Writes a making's inputs, in place of any it had. */
export const writeInputs = async (
  tx: Tx,
  making: { id: string; farmId: string },
  inputs: MakingInputs,
  now: Date
) => {
  await tx
    .delete(feedMakingInput)
    .where(eq(feedMakingInput.feedMakingId, making.id));
  await tx.insert(feedMakingInput).values(
    inputs.map((one) => ({
      id: newId(now),
      farmId: making.farmId,
      feedMakingId: making.id,
      feedItemId: one.feedItemId,
      quantity: roundKg(one.quantity).toFixed(1),
    }))
  );
};

/**
 * Writes the Feed In a Making's made feed comes into the store as — of kind `made`, the only way one is written — at the
 * moment it came out, which the store reads as it is.
 */
const writeMadeFeedIn = async (
  tx: Tx,
  maker: Maker,
  making: { id: string; outputFeedItemId: string },
  quantity: number,
  cameOutAt: Date,
  now: Date
) => {
  await tx.insert(feedIn).values({
    id: newId(now),
    farmId: maker.farm.id,
    feedItemId: making.outputFeedItemId,
    kind: "made",
    feedMakingId: making.id,
    quantity: roundKg(quantity).toFixed(1),
    priceMoney: null,
    receivedOn: cameOutAt,
    recordedBy: maker.actor.id,
    recordedByRole: maker.roleUsed ?? "manager",
    recordedAt: now,
  });
};

/** What a making is asked to be. */
export interface MakingSaid {
  id: string;
  outputFeedItemId: string;
  /** The moment it was mixed or packed. */
  madeAt: Date;
  inputs: MakingInputs;
  /** What came out, for a mix made and in the store the same moment; nothing for silage still in the pit. */
  cameOut?: { quantity: number };
  readyOn?: string;
  note?: string;
}

/** A ready day is silage's, and after it was packed. */
const assertReadyDay = (said: MakingSaid) => {
  if (!said.readyOn) {
    return;
  }
  if (said.cameOut) {
    throw refused(
      "ready_day_is_for_a_pit",
      "Only silage still to come out has a day it should be ready"
    );
  }
  if (said.readyOn < farmDayOf(said.madeAt)) {
    throw refused(
      "ready_before_it_was_made",
      "Silage is ready after it was packed"
    );
  }
};

/**
 * Makes feed: its inputs out of the store, and — for a mix — its made feed in, the same moment. Behind the Farm's one
 * lock, which every write of the store's feed takes, so two makings never both take the last sack of bran. The same id
 * again is the same making, however often a tap sends it.
 */
export const makeFeed = async (maker: Maker, said: MakingSaid) => {
  const now = maker.clock.now();
  const recordedByRole = maker.roleUsed;
  if (!recordedByRole) {
    throw new ORPCError("FORBIDDEN");
  }
  const { madeAt } = said;
  notToCome(madeAt, now, "made_in_the_future");
  assertReadyDay(said);
  await seenWhenDone(
    maker.db.transaction(async (tx) => {
      await lockTheFarm(tx, maker.farm.id);
      const existing = await tx.query.feedMaking.findFirst({
        where: { id: said.id, farmId: maker.farm.id },
        columns: { id: true },
      });
      if (existing) {
        return;
      }
      await assertInputsMake(
        tx,
        maker.farm.id,
        said.outputFeedItemId,
        said.inputs
      );
      const before = await feedStoreOf(tx, maker.farm.id);
      await tx.insert(feedMaking).values({
        id: said.id,
        farmId: maker.farm.id,
        outputFeedItemId: said.outputFeedItemId,
        madeAt,
        readyOn: said.readyOn ?? null,
        note: said.note?.trim() || null,
        recordedBy: maker.actor.id,
        recordedByRole,
        recordedAt: now,
      });
      await writeInputs(
        tx,
        { id: said.id, farmId: maker.farm.id },
        said.inputs,
        now
      );
      if (said.cameOut) {
        await writeMadeFeedIn(
          tx,
          maker,
          { id: said.id, outputFeedItemId: said.outputFeedItemId },
          said.cameOut.quantity,
          madeAt,
          now
        );
      }
      const touched = [
        said.outputFeedItemId,
        ...said.inputs.map((one) => one.feedItemId),
      ];
      await assertTheStoreHolds(
        tx,
        maker.farm.id,
        { before, without: before },
        touched,
        madeAt
      );
      await refuseSettledFeedings(tx, maker.farm.id, touched, madeAt);
      await audited(maker).recordEvent(tx, {
        entity: "feed_making",
        entityId: said.id,
        action: "create",
        after: (await loadMaking(tx, maker.farm.id, said.id)) ?? null,
      });
    })
  );
  return { id: said.id };
};

/**
 * Silage opened: what came out of the pit comes into the store the moment it was opened. Once: a pit opened twice is a
 * Correction of what came out the first time. The same amount at the same moment again is the same opening.
 */
export const takeOutOfThePit = async (
  maker: Maker,
  said: { id: string; quantity: number; cameOutAt: Date }
) => {
  const now = maker.clock.now();
  const { cameOutAt } = said;
  notToCome(cameOutAt, now, "out_in_the_future");
  await seenWhenDone(
    maker.db.transaction(async (tx) => {
      await lockTheFarm(tx, maker.farm.id);
      const making = await loadMaking(tx, maker.farm.id, said.id);
      if (!making) {
        throw new ORPCError("NOT_FOUND", {
          message: "No such making",
          data: { refusal: "not_on_the_farm" },
        });
      }
      if (making.madeFeed) {
        const same =
          Number(making.madeFeed.quantity) === roundKg(said.quantity) &&
          making.madeFeed.receivedOn.getTime() === cameOutAt.getTime();
        if (same) {
          return;
        }
        throw refused(
          "making_already_out",
          "It has already come out; put what came out right instead"
        );
      }
      if (cameOutAt < making.madeAt) {
        throw refused(
          "out_before_it_was_made",
          "It cannot come out before it was made"
        );
      }
      await writeMadeFeedIn(tx, maker, making, said.quantity, cameOutAt, now);
      await refuseSettledFeedings(
        tx,
        maker.farm.id,
        [making.outputFeedItemId],
        cameOutAt
      );
      await audited(maker).recordEvent(tx, {
        entity: "feed_making",
        entityId: making.id,
        action: "update",
        before: making,
        after: (await loadMaking(tx, maker.farm.id, making.id)) ?? null,
      });
    })
  );
  return { id: said.id };
};

/** How many makings the list reads, newest first. */
export const MAKINGS_SHOWN = 200;

/**
 * Every making, newest first: what it made and what went in — each input at what a unit of it was taken out at — what
 * it was worth, what came out and what is left of it, what a unit of the made feed came to, and what was lost where
 * that can be said. Silage still in the pit says when it should be ready.
 */
export const makingsOf = async (
  db: Context["db"],
  farm: { id: string; expiryWarnDays: number },
  now: Date
) => {
  const rows = await db.query.feedMaking.findMany({
    where: { farmId: farm.id },
    with: {
      ...MAKING_WITH,
      output: { columns: { nameBn: true, nameEn: true, unit: true } },
      recorder: { columns: { name: true } },
    },
    orderBy: { madeAt: "desc", id: "desc" },
    limit: MAKINGS_SHOWN,
  });
  const [store, lines] = await Promise.all([
    feedStoreOf(db, farm.id),
    stockOnHand(db, farm.id, expiryWindow(now, farm.expiryWarnDays)),
  ]);
  const leftOf = new Map(
    lines.flatMap((line) =>
      line.lots.map((one) => [one.arrivalId, one.left] as const)
    )
  );
  return rows.map((row) => {
    const worth = store.makings.get(row.id);
    const priceOf = new Map(
      (worth?.inputs ?? []).map((one) => [one.feedItemId, one.unitPriceMoney])
    );
    const madeQuantity = row.madeFeed ? Number(row.madeFeed.quantity) : null;
    const worthMoney = worth?.worthMoney ?? null;
    const inputs = inputsSaid(row.inputs);
    return {
      id: row.id,
      outputFeedItemId: row.outputFeedItemId,
      nameBn: row.output.nameBn,
      nameEn: row.output.nameEn,
      unit: row.output.unit,
      /** The moment it was mixed or packed. */
      madeAt: row.madeAt,
      readyOn: row.readyOn,
      note: row.note,
      recordedByName: row.recorder?.name ?? null,
      /** What went in, each at what a unit of it was taken out at: the store's price then; nothing where it had none. */
      inputs: inputs.map((one) => ({
        ...one,
        unitPriceMoney: priceOf.get(one.feedItemId) ?? null,
      })),
      /** What went in was worth, in taka; nothing while an input has no price. */
      worthMoney,
      /** What came out, and what is left of it in the store; nothing while it is in the pit. */
      madeFeed:
        row.madeFeed && madeQuantity !== null
          ? {
              arrivalId: row.madeFeed.id,
              quantity: madeQuantity,
              cameOutAt: row.madeFeed.receivedOn,
              left: leftOf.get(row.madeFeed.id) ?? 0,
            }
          : null,
      /** What a unit of the made feed came to: what went in over what came out. */
      unitPriceMoney:
        madeQuantity === null
          ? null
          : madeUnitPriceOf(worthMoney, madeQuantity),
      /** What was lost between what went in and what came out, where every input is in the made feed's unit. */
      loss:
        madeQuantity === null
          ? null
          : makingLossOf({
              inputs,
              output: { quantity: madeQuantity, unit: row.output.unit },
            }),
    };
  });
};
