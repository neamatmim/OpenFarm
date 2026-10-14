/**
 * Feed made on the farm (CONTEXT.md **Feed Making**, ADR 0030): a home-mixed concentrate made the same day, or silage
 * packed into a pit and opened a month on. Its inputs leave the store the moment it was made, its made feed comes in
 * when it came out, worth what went into it — worked out by the store (`bringMakingsIn`), never kept on a row. A
 * transfer inside the store: no Money Event, no Feed Purchase price to compare, no Feeding to charge.
 */
import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { feedIn, feedMaking, feedMakingInput } from "@OpenFarm/db/schema/feed";
import type { MakingWorth } from "@OpenFarm/domain";
import {
  farmDayOf,
  makingLossOf,
  roundKg,
  startOfFarmDay,
  stockLedger,
} from "@OpenFarm/domain";
import { cameInAt, expiryWindow } from "@OpenFarm/domain/lots";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { lockTheFarm } from "./farm-lock";
import { quantityInput, feedStoreOf, stockOnHand } from "./stock-store";
import { seenWhenDone } from "./writes-seen";

/** Who makes feed, on which farm, under which Role. */
type Making = Context & {
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

/** A day that has not come yet is refused, as feed coming in on one is. */
export const dayGone = (day: string, now: Date, refusal: string): Date => {
  const at = startOfFarmDay(day);
  if (at > now) {
    throw refused(refusal, "That day has not come yet");
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

/**
 * Refuses inputs the store did not hold the moment they were taken out — read as it stood without this making, so one
 * put right is judged against the store as if it had never been written. Every feed that falls short is named, with
 * what the store held of it.
 */
export const assertTheStoreHeld = async (
  tx: Tx,
  farmId: string,
  inputs: MakingInputs,
  madeAt: Date,
  excludingMaking?: string
) => {
  const { movements } = await feedStoreOf(tx, farmId, { excludingMaking });
  const short = inputs.flatMap((one) => {
    const { onHand } = stockLedger(movements.get(one.feedItemId) ?? [], madeAt);
    return roundKg(one.quantity) > onHand
      ? [{ feedItemId: one.feedItemId, onHand: Math.max(0, onHand) }]
      : [];
  });
  if (short.length > 0) {
    throw refused(
      "not_enough_in_the_store",
      "A making takes no more than the store held",
      { short }
    );
  }
};

/** What of a making's made feed has already gone from the store — fed, or found short at a count. */
export const goneOfMadeFeed = async (
  tx: Tx,
  farm: { id: string; expiryWarnDays: number },
  madeFeed: { id: string; feedItemId: string; quantity: string },
  now: Date
): Promise<number> => {
  const lines = await stockOnHand(
    tx,
    farm.id,
    expiryWindow(now, farm.expiryWarnDays)
  );
  const lot = lines
    .find((one) => one.feedItemId === madeFeed.feedItemId)
    ?.lots.find((one) => one.arrivalId === madeFeed.id);
  return roundKg(Number(madeFeed.quantity) - (lot?.left ?? 0));
};

/** A making as the trail keeps it: what it made, when, what went in, and what came out. */
export const readMaking = async (tx: Tx, id: string) => {
  const row = await tx.query.feedMaking.findFirst({
    where: { id },
    with: {
      inputs: {
        columns: { feedItemId: true, quantity: true },
        orderBy: { feedItemId: "asc" },
      },
      madeFeed: {
        columns: { id: true, quantity: true, receivedOn: true },
      },
    },
  });
  return row ?? null;
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

/** Brings a making's made feed into the store: a Feed In of kind `made`, the only way one is written. */
export const bringOut = async (
  tx: Tx,
  context: Making,
  making: { id: string; outputFeedItemId: string },
  quantity: number,
  cameOutOn: Date,
  now: Date
) => {
  await tx.insert(feedIn).values({
    id: newId(now),
    farmId: context.farm.id,
    feedItemId: making.outputFeedItemId,
    kind: "made",
    feedMakingId: making.id,
    quantity: roundKg(quantity).toFixed(1),
    priceMoney: null,
    receivedOn: cameOutOn,
    recordedBy: context.actor.id,
    recordedByRole: context.roleUsed ?? "manager",
    recordedAt: now,
  });
};

/** What a making is asked to be. */
export interface MakingSaid {
  id: string;
  outputFeedItemId: string;
  madeOn: string;
  inputs: MakingInputs;
  /** What came out, for a mix made and in the store the same day; nothing for silage still in the pit. */
  cameOut?: { quantity: number };
  readyOn?: string;
  note?: string;
}

/**
 * Makes feed: its inputs out of the store, and — for a mix — its made feed in, the same moment. Behind the Farm's one
 * lock, which every write of the store's feed takes, so two makings never both take the last sack of bran. The same id
 * again is the same making, however often a tap sends it.
 */
export const makeFeed = async (context: Making, said: MakingSaid) => {
  const now = context.clock.now();
  const recordedByRole = context.roleUsed;
  if (!recordedByRole) {
    throw new ORPCError("FORBIDDEN");
  }
  const madeOn = dayGone(said.madeOn, now, "made_in_the_future");
  if (said.readyOn && (said.cameOut || said.readyOn < said.madeOn)) {
    throw refused(
      "ready_before_it_was_made",
      "Silage is ready after it was packed"
    );
  }
  await seenWhenDone(
    context.db.transaction(async (tx) => {
      await lockTheFarm(tx, context.farm.id);
      const existing = await tx.query.feedMaking.findFirst({
        where: { id: said.id, farmId: context.farm.id },
        columns: { id: true },
      });
      if (existing) {
        return;
      }
      await assertInputsMake(
        tx,
        context.farm.id,
        said.outputFeedItemId,
        said.inputs
      );
      // Written on its own day, it was made the moment it was written down: the store is read then.
      await assertTheStoreHeld(
        tx,
        context.farm.id,
        said.inputs,
        cameInAt(madeOn, now)
      );
      await tx.insert(feedMaking).values({
        id: said.id,
        farmId: context.farm.id,
        outputFeedItemId: said.outputFeedItemId,
        madeOn,
        readyOn: said.readyOn ?? null,
        note: said.note?.trim() || null,
        recordedBy: context.actor.id,
        recordedByRole,
        recordedAt: now,
      });
      await writeInputs(
        tx,
        { id: said.id, farmId: context.farm.id },
        said.inputs,
        now
      );
      if (said.cameOut) {
        await bringOut(
          tx,
          context,
          { id: said.id, outputFeedItemId: said.outputFeedItemId },
          said.cameOut.quantity,
          madeOn,
          now
        );
      }
      await audited(context).recordEvent(tx, {
        entity: "feed_making",
        entityId: said.id,
        action: "create",
        after: await readMaking(tx, said.id),
      });
    })
  );
  return { id: said.id };
};

/**
 * Silage opened: what came out of the pit comes into the store on the day it was opened. Once: a pit opened twice is a
 * Correction of what came out the first time. The same amount on the same day again is the same opening.
 */
export const takeOutOfThePit = async (
  context: Making,
  said: { id: string; quantity: number; cameOutOn: string }
) => {
  const now = context.clock.now();
  const cameOutOn = dayGone(said.cameOutOn, now, "out_in_the_future");
  await seenWhenDone(
    context.db.transaction(async (tx) => {
      await lockTheFarm(tx, context.farm.id);
      const making = await tx.query.feedMaking.findFirst({
        where: { id: said.id, farmId: context.farm.id },
        with: { madeFeed: { columns: { quantity: true, receivedOn: true } } },
      });
      if (!making) {
        throw new ORPCError("NOT_FOUND", {
          message: "No such making",
          data: { refusal: "not_on_the_farm" },
        });
      }
      if (making.madeFeed) {
        const same =
          Number(making.madeFeed.quantity) === roundKg(said.quantity) &&
          farmDayOf(making.madeFeed.receivedOn) === said.cameOutOn;
        if (same) {
          return;
        }
        throw refused(
          "making_already_out",
          "It has already come out; put what came out right instead"
        );
      }
      if (cameOutOn < making.madeOn) {
        throw refused(
          "out_before_it_was_made",
          "It cannot come out before it was made"
        );
      }
      const before = await readMaking(tx, making.id);
      await bringOut(tx, context, making, said.quantity, cameOutOn, now);
      await audited(context).recordEvent(tx, {
        entity: "feed_making",
        entityId: making.id,
        action: "update",
        before,
        after: await readMaking(tx, making.id),
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
      output: { columns: { nameBn: true, nameEn: true, unit: true } },
      inputs: {
        columns: { feedItemId: true, quantity: true },
        with: {
          feedItem: { columns: { nameBn: true, nameEn: true, unit: true } },
        },
        orderBy: { id: "asc" },
      },
      madeFeed: { columns: { id: true, quantity: true, receivedOn: true } },
      recorder: { columns: { name: true } },
    },
    orderBy: { madeOn: "desc", recordedAt: "desc", id: "desc" },
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
    const worth: MakingWorth | undefined = store.makings.get(row.id);
    const priceOf = new Map(
      (worth?.inputs ?? []).map((one) => [one.feedItemId, one.unitPriceMoney])
    );
    const madeQuantity = row.madeFeed ? Number(row.madeFeed.quantity) : null;
    const worthMoney = worth?.worthMoney ?? null;
    return {
      id: row.id,
      outputFeedItemId: row.outputFeedItemId,
      nameBn: row.output.nameBn,
      nameEn: row.output.nameEn,
      unit: row.output.unit,
      madeOn: row.madeOn,
      readyOn: row.readyOn,
      note: row.note,
      recordedByName: row.recorder?.name ?? null,
      inputs: row.inputs.map((one) => ({
        feedItemId: one.feedItemId,
        nameBn: one.feedItem.nameBn,
        nameEn: one.feedItem.nameEn,
        unit: one.feedItem.unit,
        quantity: Number(one.quantity),
        /** What a unit of it was taken out at: the store's price then; nothing where it had none. */
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
              cameOutOn: row.madeFeed.receivedOn,
              left: leftOf.get(row.madeFeed.id) ?? 0,
            }
          : null,
      /** What a unit of the made feed came to: what went in over what came out. */
      unitPriceMoney:
        worthMoney !== null && madeQuantity !== null && madeQuantity > 0
          ? worthMoney / madeQuantity
          : null,
      /** What was lost between what went in and what came out, where every input is in the made feed's unit. */
      loss:
        madeQuantity === null
          ? null
          : makingLossOf({
              inputs: row.inputs.map((one) => ({
                quantity: Number(one.quantity),
                unit: one.feedItem.unit,
              })),
              output: { quantity: madeQuantity, unit: row.output.unit },
            }),
    };
  });
};
