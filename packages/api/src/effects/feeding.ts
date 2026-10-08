import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { feeding } from "@OpenFarm/db/schema/feed";
import type { FeedingLine } from "@OpenFarm/domain";
import { isShortFed, roundFeedKg, shortfallPercent } from "@OpenFarm/domain";

import type { Tx } from "../audit";
import { feedingTargetForPen } from "../feed-store";
import type { EffectInput, EffectResult, EffectKind } from "./effect";
import { penOf } from "./evidence";

/** The Pen's weight as the numeric column keeps it. */
const weightColumnOf = (owed: { herd: { weightKg: number | null } }) =>
  owed.herd.weightKg === null ? null : String(owed.herd.weightKg);

type FeedingFacts = Pick<
  EffectInput,
  | "instance"
  | "completionId"
  | "feeding"
  | "feedTolerancePercent"
  | "sessionsPerDay"
  | "recordedBy"
  | "recordedAt"
  | "now"
>;

/** The lines a Feeding holds: what was owed of each feed, with what this entry gave and found — and a line for any feed
 *  given that was not owed, so feed that went out is never dropped from the store and the costs. */
const linesFrom = (
  owed: readonly { feedItemId: string; targetKg: number; leftoverKg: number }[],
  entered: FeedingFacts["feeding"]
): FeedingLine[] => {
  const given = new Map(entered.map((line) => [line.feedItemId, line]));
  const known = new Set(owed.map((line) => line.feedItemId));
  return [
    ...owed,
    ...entered
      .filter((line) => !known.has(line.feedItemId))
      .map((line) => ({
        feedItemId: line.feedItemId,
        targetKg: 0,
        leftoverKg: 0,
      })),
  ].map((line) => ({
    feedItemId: line.feedItemId,
    targetKg: line.targetKg,
    givenKg: roundFeedKg(given.get(line.feedItemId)?.givenKg ?? 0),
    // This Feeding's own Leftover is the next feed's to find, and stays as that wrote it.
    leftoverKg: line.leftoverKg,
    foundKg: roundFeedKg(given.get(line.feedItemId)?.leftoverKg ?? 0),
  }));
};

/** A Feeding's lines with what was left of them, each never more than was given, and its shortfall and flag again. */
const withLeftovers = (
  lines: readonly FeedingLine[],
  leftOf: (feedItemId: string) => number,
  tolerancePercent: number
) => {
  const next = lines.map((line) => ({
    ...line,
    leftoverKg: Math.min(line.givenKg, roundFeedKg(leftOf(line.feedItemId))),
  }));
  return {
    lines: next,
    shortfallPercent: shortfallPercent(next),
    flagged: isShortFed(next, tolerancePercent),
  };
};

/**
 * What was left in the trough is found at the next feed (the Owner, 2026-10-06): this entry's leftovers are the Pen's
 * feeding before's, written onto it and its shortfall judged again — and the feeding after's, where one landed first,
 * are this one's. Read against the same feeding they were never judged a session late, nor priced at the new Ration's
 * price after a change.
 */
const passTheLeftovers = async (
  tx: Tx,
  input: FeedingFacts,
  self: { id: string; penId: string; fedAt: Date }
) => {
  const neighbors = await tx.query.feeding.findMany({
    where: {
      farmId: input.instance.farmId,
      penId: self.penId,
      id: { ne: self.id },
    },
    columns: { id: true, fedAt: true, lines: true, flaggedAt: true },
    orderBy: { fedAt: "asc", id: "asc" },
  });
  const before = neighbors.findLast((one) => one.fedAt < self.fedAt);
  const after = neighbors.find((one) => one.fedAt > self.fedAt);
  const write = async (
    row: { id: string; flaggedAt: Date | null },
    judged: ReturnType<typeof withLeftovers>
  ) => {
    await tx
      .update(feeding)
      .set({
        lines: judged.lines,
        shortfallPercent: judged.shortfallPercent,
        flaggedAt: judged.flagged ? (row.flaggedAt ?? input.now) : null,
      })
      .where(eq(feeding.id, row.id));
  };
  const mine = await tx.query.feeding.findFirst({
    where: { id: self.id },
    columns: { lines: true, flaggedAt: true },
  });
  const myLines = (mine?.lines ?? []) as FeedingLine[];
  if (before) {
    const found = new Map(
      myLines.map((line) => [line.feedItemId, line.foundKg ?? 0])
    );
    await write(
      before,
      withLeftovers(
        before.lines as FeedingLine[],
        (feedItemId) => found.get(feedItemId) ?? 0,
        input.feedTolerancePercent
      )
    );
  }
  if (after && mine) {
    const found = new Map(
      (after.lines as FeedingLine[]).map((line) => [
        line.feedItemId,
        line.foundKg ?? 0,
      ])
    );
    await write(
      { id: self.id, flaggedAt: mine.flaggedAt },
      withLeftovers(
        myLines,
        (feedItemId) => found.get(feedItemId) ?? 0,
        input.feedTolerancePercent
      )
    );
  }
};

/**
 * Records what a Pen was actually given against what its Ration owed it.
 *
 * The target is worked out from the Ration the Pen was on when the work was *raised*, and the animals standing in the
 * Pen when it was fed, and both are written into the record with the figures — so a year later the arithmetic can
 * still be shown rather than re-derived from a farm that has changed. A Correction puts right what was given, against
 * the target the Feeding already holds: it was once worked out afresh from the Pen as it stood when corrected, and a
 * meal given on a Ration since changed dropped out of the store and the costs, or a Pen fed for four was judged
 * against eight.
 *
 * A session appreciably under target is flagged on the farm's own tolerance. That is the
 * first sign of a pen off its feed, a bag that ran out, or a job somebody did not do.
 */
const feedThePen = async (
  tx: Tx,
  input: FeedingFacts
): Promise<EffectResult> => {
  const recorded = await tx.query.feeding.findFirst({
    where: { completionId: input.completionId },
    columns: { id: true, lines: true, penId: true },
  });
  if (recorded) {
    const lines = linesFrom(recorded.lines as FeedingLine[], input.feeding);
    const short = shortfallPercent(lines);
    const flagged = isShortFed(lines, input.feedTolerancePercent);
    await tx
      .update(feeding)
      .set({
        lines,
        shortfallPercent: short,
        flaggedAt: flagged ? input.now : null,
        fedAt: input.recordedAt,
      })
      .where(eq(feeding.id, recorded.id));
    await passTheLeftovers(tx, input, {
      id: recorded.id,
      penId: recorded.penId,
      fedAt: input.recordedAt,
    });
    return {
      kind: "feeding",
      shortfallPercent: short,
      flagged,
      standsAside: null,
    };
  }
  const owed = await feedingTargetForPen(
    tx,
    input.instance.farmId,
    penOf(input),
    // When the work was raised, not when it fell due: an Instance raised this morning for
    // tonight is fed on the Ration the farm had this morning, whatever is published between.
    input.instance.raisedAt,
    input.sessionsPerDay,
    // The animals standing when it was fed, however late the entry reaches the farm.
    input.recordedAt
  );
  if (!owed) {
    // The phone had a Ration when it recorded this; the farm does not now. That is the world moving under an entry, not
    // an entry that was ever wrong (ADR 0002).
    return {
      kind: "feeding",
      shortfallPercent: 0,
      flagged: false,
      standsAside: { because: "no_ration" },
    };
  }
  const lines = linesFrom(
    owed.items.map((line) => ({
      feedItemId: line.feedItemId,
      // A line by weight in a Pen nobody weighed owed no figure, and nothing owed is never short.
      targetKg: line.quantity ?? 0,
      leftoverKg: 0,
    })),
    input.feeding
  );
  const short = shortfallPercent(lines);
  const flagged = isShortFed(lines, input.feedTolerancePercent);
  const id = uuidv7(input.now);
  await tx.insert(feeding).values({
    id,
    farmId: input.instance.farmId,
    instanceId: input.instance.id,
    completionId: input.completionId,
    penId: penOf(input),
    rationVersionId: owed.rationVersionId,
    animals: owed.animals,
    herdWeightKg: weightColumnOf(owed),
    sessionsPerDay: owed.sessionsPerDay,
    lines,
    shortfallPercent: short,
    flaggedAt: flagged ? input.now : null,
    fedBy: input.recordedBy,
    fedAt: input.recordedAt,
    recordedAt: input.now,
  });
  await passTheLeftovers(tx, input, {
    id,
    penId: penOf(input),
    fedAt: input.recordedAt,
  });
  return {
    kind: "feeding",
    shortfallPercent: short,
    flagged,
    standsAside: null,
  };
};

/** A Step that feeds a Pen. */
export const feedingEffect: EffectKind<FeedingFacts> = {
  kind: "feeding",
  apply: feedThePen,
  recorded: async (db, completionId) => {
    const fed = await db.query.feeding.findFirst({
      where: { completionId },
      columns: { lines: true },
    });
    return fed
      ? {
          // What this entry said it found in the trough; a Feeding from before then said its own leftover.
          feeding: (fed.lines as FeedingLine[]).map((line) => ({
            feedItemId: line.feedItemId,
            givenKg: line.givenKg,
            leftoverKg: line.foundKg ?? line.leftoverKg,
          })),
        }
      : {};
  },
  // Leftovers left out are none, and the lines are in the farm's order and rounding.
  asShown: ({ feeding: lines }) =>
    lines
      ? {
          feeding: lines
            .map((line) => ({
              feedItemId: line.feedItemId,
              givenKg: roundFeedKg(line.givenKg),
              leftoverKg: roundFeedKg(line.leftoverKg ?? 0),
            }))
            .toSorted((a, b) => a.feedItemId.localeCompare(b.feedItemId)),
        }
      : {},
};
