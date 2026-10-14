import { eq } from "@OpenFarm/db/operators";
import { feedIn, feedMaking } from "@OpenFarm/db/schema/feed";
import { farmDayOf, roundKg, startOfFarmDay } from "@OpenFarm/domain";
import { cameInAt } from "@OpenFarm/domain/lots";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { farmDay } from "../farm-clock";
import type { MakingInputs } from "../feed-making-store";
import {
  assertInputsMake,
  assertTheStoreHeld,
  dayGone,
  goneOfMadeFeed,
  makingInputs,
  readMaking,
  writeInputs,
} from "../feed-making-store";
import { quantityInput } from "../stock-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, venturesCharged } from "./correction";

const loadMaking = (tx: Tx, farmId: string, id: string) =>
  tx.query.feedMaking.findFirst({
    where: { id, farmId },
    with: {
      inputs: { columns: { feedItemId: true, quantity: true } },
      madeFeed: {
        columns: {
          id: true,
          feedItemId: true,
          quantity: true,
          receivedOn: true,
        },
      },
    },
  });

type MakingRow = NonNullable<Awaited<ReturnType<typeof loadMaking>>>;

/** Inputs in one order, so what the screen showed and what the farm holds are compared as lists. */
const inOrder = (inputs: readonly { feedItemId: string; quantity: number }[]) =>
  inputs
    .map((one) => ({
      feedItemId: one.feedItemId,
      quantity: roundKg(one.quantity),
    }))
    .toSorted((a, b) => a.feedItemId.localeCompare(b.feedItemId));

const inputsOf = (row: MakingRow) =>
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
   *  made has gone from the store. */
  voided: changeOf(z.literal(true), z.boolean()),
});

/** Refused: some of what it made has gone from the store, so it cannot have made less than that, or nothing. */
const madeFeedGone = (gone: number) =>
  new ORPCError("BAD_REQUEST", {
    message:
      "Some of what it made has gone from the store; put the amount right, or count the store",
    data: { refusal: "making_output_used", gone },
  });

/** Never made, or written twice: off the store with what it made, its inputs back on the shelf — while none of what it
 *  made has gone. */
const voidMaking = async (tx: Tx, row: MakingRow, gone: number) => {
  if (gone > 0) {
    throw madeFeedGone(gone);
  }
  if (row.madeFeed) {
    await tx.delete(feedIn).where(eq(feedIn.id, row.madeFeed.id));
  }
  // Its inputs go with it.
  await tx.delete(feedMaking).where(eq(feedMaking.id, row.id));
};

/**
 * The day it was made and the day it came out, as put right: never a day to come, never out before it was made. A mix
 * comes out the day it is made, so moving the day it was made moves the day it came out with it, unless that is put
 * right too. What came out can be put right only once something has.
 */
const daysPutRight = (
  row: MakingRow,
  to: { madeOn?: string; quantity?: number; cameOutOn?: string },
  now: Date
): { madeOn: Date; cameOutOn: Date | null } => {
  const { madeFeed } = row;
  if (!madeFeed && (to.quantity !== undefined || to.cameOutOn !== undefined)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Nothing has come out of it yet",
      data: { refusal: "making_not_out_yet" },
    });
  }
  const madeOn =
    to.madeOn === undefined
      ? row.madeOn
      : dayGone(to.madeOn, now, "made_in_the_future");
  const outTheSameDay =
    madeFeed !== null &&
    farmDayOf(madeFeed.receivedOn) === farmDayOf(row.madeOn);
  let cameOutOn = madeFeed?.receivedOn ?? null;
  if (to.cameOutOn !== undefined) {
    cameOutOn = dayGone(to.cameOutOn, now, "out_in_the_future");
  } else if (to.madeOn !== undefined && outTheSameDay) {
    cameOutOn = madeOn;
  }
  if (cameOutOn !== null && cameOutOn < madeOn) {
    throw new ORPCError("BAD_REQUEST", {
      message: "It cannot come out before it was made",
      data: { refusal: "out_before_it_was_made" },
    });
  }
  return { madeOn, cameOutOn };
};

/** What went in and the day, put right: a new feed one the farm keeps, and the store judged again without it. */
const putInputsRight = async (
  tx: Tx,
  row: MakingRow,
  to: { inputs?: MakingInputs; madeOn?: string },
  madeOn: Date,
  now: Date
) => {
  if (!to.inputs && to.madeOn === undefined) {
    return;
  }
  const inputs: MakingInputs = to.inputs ?? inputsOf(row);
  if (to.inputs) {
    const had = new Set(row.inputs.map((one) => one.feedItemId));
    await assertInputsMake(tx, row.farmId, row.outputFeedItemId, inputs, {
      newOnly: new Set(
        inputs.map((one) => one.feedItemId).filter((id) => !had.has(id))
      ),
    });
  }
  await assertTheStoreHeld(
    tx,
    row.farmId,
    inputs,
    cameInAt(madeOn, row.recordedAt),
    row.id
  );
  if (to.madeOn !== undefined) {
    await tx
      .update(feedMaking)
      .set({ madeOn })
      .where(eq(feedMaking.id, row.id));
  }
  if (to.inputs) {
    await writeInputs(tx, row, inputs, now);
  }
};

/** What came out and the day, put right on the made Feed In. */
const putMadeFeedRight = async (
  tx: Tx,
  madeFeed: NonNullable<MakingRow["madeFeed"]>,
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

/**
 * A Feed Making put right, or voided — by the Manager in his Correction Window, the Owner at any time, with a reason,
 * as a Feed In is. Its made feed is priced from it, and that price is what every Feeding of the made feed since was
 * charged at: so a Venture already settled on those Feedings refuses it, and the Farm's lock is taken first, as for a
 * Feed In put right.
 */
export const feedMakingCorrection: CorrectionKind<
  MakingRow,
  z.infer<typeof feedMakingCorrectionInput>["changes"]
> = {
  entity: "feed_making",
  table: feedMaking,
  money: true,
  roles: ["owner", "manager"],
  /** Every Feeding of the made feed, and of what went into it, since the earlier of the day it was made and the day
   *  it would be: each is priced through it. */
  venturesOf: (tx, row, changes) => {
    const moved = changes.madeOn && startOfFarmDay(changes.madeOn.to);
    const from = moved && moved < row.madeOn ? moved : row.madeOn;
    const touched = new Set([
      row.outputFeedItemId,
      ...row.inputs.map((one) => one.feedItemId),
      ...(changes.inputs?.to ?? []).map((one) => one.feedItemId),
    ]);
    return venturesCharged(tx, row.farmId, (costs) =>
      costs.charges.filter(
        (one) =>
          one.kind === "feed" && touched.has(one.fromId) && one.at >= from
      )
    );
  },
  missing: "No such making",
  load: loadMaking,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: (_tx, row) =>
    Promise.resolve({
      inputs: inputsOf(row),
      madeOn: farmDayOf(row.madeOn),
      quantity: row.madeFeed ? Number(row.madeFeed.quantity) : null,
      cameOutOn: row.madeFeed ? farmDayOf(row.madeFeed.receivedOn) : null,
      voided: false,
    }),
  shownAs: { inputs: (to) => inOrder(to) },
  trail: (tx, row) => readMaking(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    const gone = row.madeFeed
      ? await goneOfMadeFeed(tx, context.farm, row.madeFeed, now)
      : 0;
    if (to.voided) {
      await voidMaking(tx, row, gone);
      return;
    }
    if (to.quantity !== undefined && roundKg(to.quantity) < gone) {
      throw madeFeedGone(gone);
    }
    const { madeOn, cameOutOn } = daysPutRight(row, to, now);
    await putInputsRight(tx, row, to, madeOn, now);
    if (row.madeFeed) {
      await putMadeFeedRight(tx, row.madeFeed, to.quantity, cameOutOn);
    }
  },
};
