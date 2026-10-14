import { eq } from "@OpenFarm/db/operators";
import { feedIn, feedMaking } from "@OpenFarm/db/schema/feed";
import { roundKg } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import type { MakingInputs } from "../feed-making-store";
import {
  assertInputsMake,
  assertTheStoreHolds,
  makingInputs,
  notToCome,
  venturesFedThrough,
  writeInputs,
} from "../feed-making-store";
import type { LoadedMaking } from "../making-shape";
import { loadMaking } from "../making-shape";
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

/** What putting a making right may change: what went in, the moment it was made, what came out and when, or that it
 *  was never made at all. A moment is shown as the screen was given it, and sent as a moment. */
export const feedMakingCorrectionInput = correctionInput({
  inputs: changeOf(makingInputs, inputShown),
  madeAt: changeOf(z.date(), z.string()),
  quantity: changeOf(quantityInput, z.number().nullable()),
  cameOutAt: changeOf(z.date(), z.string().nullable()),
  /** Written twice, or never made: taken off the store, its inputs back on the shelf — refused only where what it made
   *  was fed or made into other feed and the store would go short without it. */
  voided: changeOf(z.literal(true), z.boolean()),
});

type Changes = z.infer<typeof feedMakingCorrectionInput>["changes"];
type Wanted = {
  [K in keyof Changes]?: NonNullable<Changes[K]>["to"];
};

/** The values only the opening of a pit wrote: what came out, and when. */
const OPENING = new Set(["quantity", "cameOutAt"]);

/**
 * The moment it was made and the moment it came out, as put right: never one to come, never out before it was made. A
 * mix comes out the moment it is made, so moving that moves the moment it came out with it, unless that is put right
 * too. What came out can be put right only once something has.
 */
const momentsPutRight = (
  row: LoadedMaking,
  to: Wanted,
  now: Date
): { madeAt: Date; cameOutAt: Date | null } => {
  const { madeFeed } = row;
  if (!madeFeed && (to.quantity !== undefined || to.cameOutAt !== undefined)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Nothing has come out of it yet",
      data: { refusal: "making_not_out_yet" },
    });
  }
  const madeAt = notToCome(to.madeAt ?? row.madeAt, now, "made_in_the_future");
  const aMix =
    madeFeed !== null && madeFeed.receivedOn.getTime() === row.madeAt.getTime();
  let cameOutAt = madeFeed?.receivedOn ?? null;
  if (to.cameOutAt !== undefined) {
    cameOutAt = notToCome(to.cameOutAt, now, "out_in_the_future");
  } else if (to.madeAt !== undefined && aMix) {
    cameOutAt = madeAt;
  }
  if (cameOutAt !== null && cameOutAt < madeAt) {
    throw new ORPCError("BAD_REQUEST", {
      message: "It cannot come out before it was made",
      data: { refusal: "out_before_it_was_made" },
    });
  }
  return { madeAt, cameOutAt };
};

/** What went in and when, put right: a new feed one the farm keeps. */
const putInputsRight = async (
  tx: Tx,
  row: LoadedMaking,
  to: Wanted,
  madeAt: Date,
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
  if (madeAt.getTime() !== row.madeAt.getTime()) {
    await tx
      .update(feedMaking)
      .set({ madeAt })
      .where(eq(feedMaking.id, row.id));
  }
};

/** What came out and when, put right on the made Feed In. */
const putMadeFeedRight = async (
  tx: Tx,
  madeFeed: NonNullable<LoadedMaking["madeFeed"]>,
  quantity: number | undefined,
  cameOutAt: Date | null
) => {
  const moved =
    cameOutAt !== null && cameOutAt.getTime() !== madeFeed.receivedOn.getTime();
  if (quantity === undefined && !moved) {
    return;
  }
  await tx
    .update(feedIn)
    .set({
      ...(quantity === undefined
        ? {}
        : { quantity: roundKg(quantity).toFixed(1) }),
      ...(moved ? { receivedOn: cameOutAt } : {}),
    })
    .where(eq(feedIn.id, madeFeed.id));
};

/** The earliest of these moments. */
const earliest = (...moments: readonly (Date | null | undefined)[]): Date =>
  new Date(Math.min(...moments.flatMap((one) => (one ? [one.getTime()] : []))));

/** Every feed a Making touches: what it makes, and what went in, before and after. */
const touchedBy = (row: LoadedMaking, to: Wanted) => [
  row.outputFeedItemId,
  ...row.inputs.map((one) => one.feedItemId),
  ...(to.inputs ?? []).map((one) => one.feedItemId),
];

/**
 * A Feed Making put right, or voided — by the Manager in his Correction Window, the Owner at any time, with a reason,
 * as a Feed In is. Its made feed is priced from it, and that price is what every Feeding of the made feed since was
 * charged at — and of feed made from it in turn: so a Venture already settled on those Feedings refuses it, and the
 * Farm's lock is taken first, as for a Feed In put right. Anything else it is judged by is the store, moment by moment:
 * a void, less made, inputs upwards, a moment moved — each refused only where the store goes short for it.
 */
export const feedMakingCorrection: CorrectionKind<LoadedMaking, Changes> = {
  entity: "feed_making",
  table: feedMaking,
  money: true,
  roles: ["owner", "manager"],
  /** Every Feeding of the made feed, of what went into it, and of feed made from either since, from the earlier of the
   *  moment it was made and the moment it would be: each is priced through it. */
  venturesOf: (tx, row, changes) =>
    venturesFedThrough(
      tx,
      row.farmId,
      touchedBy(row, { inputs: changes.inputs?.to }),
      earliest(row.madeAt, changes.madeAt?.to)
    ),
  missing: "No such making",
  load: loadMaking,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  /** What came out of a pit, and when, are put right in the window of the opening that wrote them, not the packing a
   *  month before; what went in keeps the packing's. */
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
      madeAt: row.madeAt.toISOString(),
      quantity: row.madeFeed ? Number(row.madeFeed.quantity) : null,
      cameOutAt: row.madeFeed ? row.madeFeed.receivedOn.toISOString() : null,
      voided: false,
    }),
  shownAs: {
    inputs: (to) => inOrder(to),
    madeAt: (to) => to.toISOString(),
    cameOutAt: (to) => to.toISOString(),
  },
  trail: async (tx, row) => (await loadMaking(tx, row.farmId, row.id)) ?? null,
  apply: async (tx, row, to, { now }) => {
    const before = await feedStoreOf(tx, row.farmId);
    const without = await feedStoreOf(tx, row.farmId, {
      excludingMaking: row.id,
    });
    if (to.voided) {
      if (row.madeFeed) {
        await tx.delete(feedIn).where(eq(feedIn.id, row.madeFeed.id));
      }
      // Its inputs go with it.
      await tx.delete(feedMaking).where(eq(feedMaking.id, row.id));
      // Gone, it leaves short only what ate what it made.
      await assertTheStoreHolds(
        tx,
        row.farmId,
        { before, without },
        touchedBy(row, {}),
        row.madeAt,
        "making_output_used"
      );
      return;
    }
    const { madeAt, cameOutAt } = momentsPutRight(row, to, now);
    await putInputsRight(tx, row, to, madeAt, now);
    if (row.madeFeed) {
      await putMadeFeedRight(tx, row.madeFeed, to.quantity, cameOutAt);
    }
    await assertTheStoreHolds(
      tx,
      row.farmId,
      { before, without },
      touchedBy(row, to),
      earliest(row.madeAt, madeAt, row.madeFeed?.receivedOn, cameOutAt)
    );
  },
};
