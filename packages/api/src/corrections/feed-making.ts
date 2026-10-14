import { eq } from "@OpenFarm/db/operators";
import { feedIn, feedMaking } from "@OpenFarm/db/schema/feed";
import { farmDayOf, roundKg, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { farmDay } from "../farm-clock";
import type { MakingInputs } from "../feed-making-store";
import {
  assertInputsMake,
  assertTheStoreHolds,
  dayGone,
  madeFeedInAt,
  madeFeedUsed,
  madeFeedUsedRefusal,
  makingInputs,
  venturesFedThrough,
  writeInputs,
} from "../feed-making-store";
import type { LoadedMaking } from "../making-shape";
import { loadMaking, madeAtOf } from "../making-shape";
import { feedStoreOf, quantityInput } from "../stock-store";
import type { CorrectionKind, EntryFacts } from "./correction";
import { changeOf, correctionInput } from "./correction";

/** Inputs in one order, so what the screen showed and what the farm holds are compared as lists. */
const inOrder = (inputs: readonly { feedItemId: string; quantity: number }[]) =>
  inputs
    .map((one) => ({
      feedItemId: one.feedItemId,
      quantity: roundKg(one.quantity),
    }))
    .toSorted((a, b) => a.feedItemId.localeCompare(b.feedItemId));

const inputsOf = (row: LoadedMaking) =>
  inOrder(
    row.inputs.map((one) => ({
      feedItemId: one.feedItemId,
      quantity: Number(one.quantity),
    }))
  );

const inputShown = z.array(
  z.object({ feedItemId: z.string(), quantity: z.number() })
);

/** What putting a making right may change: what went in, the day it was made, what came out and when, or that it was
 *  never made at all. */
export const feedMakingCorrectionInput = correctionInput({
  inputs: changeOf(makingInputs, inputShown),
  madeOn: changeOf(farmDay, z.string()),
  quantity: changeOf(quantityInput, z.number().nullable()),
  cameOutOn: changeOf(farmDay, z.string().nullable()),
  /** Written twice, or never made: taken off the store, its inputs back on the shelf — only while none of what it
   *  made has been used. */
  voided: changeOf(z.literal(true), z.boolean()),
});

type Changes = z.infer<typeof feedMakingCorrectionInput>["changes"];
type Wanted = {
  [K in keyof Changes]?: NonNullable<Changes[K]>["to"];
};

/** The values only the opening of a pit wrote: what came out, and the day. */
const OPENING = new Set(["quantity", "cameOutOn"]);

/**
 * The day it was made and the day it came out, as put right: never a day to come, never out before it was made. A mix
 * comes out the day it is made, so moving the day it was made moves the day it came out with it, unless that is put
 * right too. What came out can be put right only once something has.
 */
const daysPutRight = (
  row: LoadedMaking,
  to: Wanted,
  now: Date
): { madeOn: string; cameOutOn: Date | null } => {
  const { madeFeed } = row;
  if (!madeFeed && (to.quantity !== undefined || to.cameOutOn !== undefined)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Nothing has come out of it yet",
      data: { refusal: "making_not_out_yet" },
    });
  }
  const madeOn = to.madeOn ?? row.madeOn;
  dayGone(madeOn, now, "made_in_the_future");
  const outTheSameDay =
    madeFeed !== null && farmDayOf(madeFeed.receivedOn) === row.madeOn;
  let cameOutOn = madeFeed?.receivedOn ?? null;
  if (to.cameOutOn !== undefined) {
    cameOutOn = dayGone(to.cameOutOn, now, "out_in_the_future");
  } else if (to.madeOn !== undefined && outTheSameDay) {
    cameOutOn = startOfFarmDay(madeOn);
  }
  if (cameOutOn !== null && farmDayOf(cameOutOn) < madeOn) {
    throw new ORPCError("BAD_REQUEST", {
      message: "It cannot come out before it was made",
      data: { refusal: "out_before_it_was_made" },
    });
  }
  return { madeOn, cameOutOn };
};

/** Never made, or written twice: off the store with what it made, its inputs back on the shelf — while none of what it
 *  made has been used. */
const voidMaking = async (tx: Tx, row: LoadedMaking) => {
  if (row.madeFeed) {
    await tx.delete(feedIn).where(eq(feedIn.id, row.madeFeed.id));
  }
  // Its inputs go with it.
  await tx.delete(feedMaking).where(eq(feedMaking.id, row.id));
};

/** What went in and the day, put right: a new feed one the farm keeps. */
const putInputsRight = async (
  tx: Tx,
  row: LoadedMaking,
  to: Wanted,
  madeOn: string,
  now: Date
) => {
  if (to.inputs) {
    const had = new Set(row.inputs.map((one) => one.feedItemId));
    await assertInputsMake(tx, row.farmId, row.outputFeedItemId, to.inputs, {
      newOnly: new Set(
        to.inputs.map((one) => one.feedItemId).filter((id) => !had.has(id))
      ),
    });
    await writeInputs(tx, row, to.inputs as MakingInputs, now);
  }
  if (madeOn !== row.madeOn) {
    await tx
      .update(feedMaking)
      .set({ madeOn })
      .where(eq(feedMaking.id, row.id));
  }
};

/** What came out and the day, put right on the made Feed In. */
const putMadeFeedRight = async (
  tx: Tx,
  madeFeed: NonNullable<LoadedMaking["madeFeed"]>,
  quantity: number | undefined,
  cameOutOn: Date | null
) => {
  const moved =
    cameOutOn !== null && cameOutOn.getTime() !== madeFeed.receivedOn.getTime();
  if (quantity === undefined && !moved) {
    return;
  }
  await tx
    .update(feedIn)
    .set({
      ...(quantity === undefined
        ? {}
        : { quantity: roundKg(quantity).toFixed(1) }),
      ...(moved ? { receivedOn: cameOutOn } : {}),
    })
    .where(eq(feedIn.id, madeFeed.id));
};

/** The earliest of these moments. */
const earliest = (...moments: readonly (Date | null | undefined)[]): Date =>
  new Date(Math.min(...moments.flatMap((one) => (one ? [one.getTime()] : []))));

/**
 * A Feed Making put right, or voided — by the Manager in his Correction Window, the Owner at any time, with a reason,
 * as a Feed In is. Its made feed is priced from it, and that price is what every Feeding of the made feed since was
 * charged at — and of feed made from it in turn: so a Venture already settled on those Feedings refuses it, and the
 * Farm's lock is taken first, as for a Feed In put right.
 */
export const feedMakingCorrection: CorrectionKind<LoadedMaking, Changes> = {
  entity: "feed_making",
  table: feedMaking,
  money: true,
  roles: ["owner", "manager"],
  /** Every Feeding of the made feed, of what went into it, and of feed made from either since, from the earlier of the
   *  day it was made and the day it would be: each is priced through it. */
  venturesOf: (tx, row, changes) => {
    const moved = changes.madeOn && startOfFarmDay(changes.madeOn.to);
    const made = startOfFarmDay(row.madeOn);
    return venturesFedThrough(
      tx,
      row.farmId,
      [
        row.outputFeedItemId,
        ...row.inputs.map((one) => one.feedItemId),
        ...(changes.inputs?.to ?? []).map((one) => one.feedItemId),
      ],
      moved && moved < made ? moved : made
    );
  },
  missing: "No such making",
  load: loadMaking,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  /** What came out of a pit, and the day, are put right in the window of the opening that wrote them, not the packing
   *  a month before; what went in keeps the packing's. */
  entryFor: (row, changes): EntryFacts | undefined => {
    const named = Object.entries(changes).flatMap(([field, change]) =>
      change ? [field] : []
    );
    return row.madeFeed &&
      named.length > 0 &&
      named.every((field) => OPENING.has(field))
      ? {
          enteredAt: row.madeFeed.recordedAt,
          enteredBy: row.madeFeed.recordedBy,
        }
      : undefined;
  },
  shown: (_tx, row) =>
    Promise.resolve({
      inputs: inputsOf(row),
      madeOn: row.madeOn,
      quantity: row.madeFeed ? Number(row.madeFeed.quantity) : null,
      cameOutOn: row.madeFeed ? farmDayOf(row.madeFeed.receivedOn) : null,
      voided: false,
    }),
  shownAs: { inputs: (to) => inOrder(to) },
  trail: async (tx, row) => (await loadMaking(tx, row.farmId, row.id)) ?? null,
  apply: async (tx, row, to, { now }) => {
    const before = await feedStoreOf(tx, row.farmId);
    if (to.voided) {
      if (madeFeedUsed(before, row)) {
        throw madeFeedUsedRefusal();
      }
      await voidMaking(tx, row);
      return;
    }
    const { madeOn, cameOutOn } = daysPutRight(row, to, now);
    const madeAt = madeAtOf({ madeOn, recordedAt: row.recordedAt });
    const wasIn = before.makings.get(row.id)?.cameInAt ?? null;
    const comesIn =
      row.madeFeed && cameOutOn
        ? madeFeedInAt(cameOutOn, row.madeFeed.recordedAt, madeAt)
        : null;
    // Moved later past a Feeding of it — or a Making from it — and those were fed feed that had not come in yet.
    if (
      wasIn &&
      comesIn &&
      comesIn > wasIn &&
      madeFeedUsed(before, row, comesIn)
    ) {
      throw madeFeedUsedRefusal();
    }
    const without = await feedStoreOf(tx, row.farmId, {
      excludingMaking: row.id,
    });
    await putInputsRight(tx, row, to, madeOn, now);
    if (row.madeFeed) {
      await putMadeFeedRight(tx, row.madeFeed, to.quantity, cameOutOn);
    }
    await assertTheStoreHolds(
      tx,
      row.farmId,
      { before, without },
      [
        row.outputFeedItemId,
        ...row.inputs.map((one) => one.feedItemId),
        ...(to.inputs ?? []).map((one) => one.feedItemId),
      ],
      earliest(madeAtOf(row), madeAt, wasIn, comesIn)
    );
  },
};
