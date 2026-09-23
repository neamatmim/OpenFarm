import { uuidv7 } from "@OpenFarm/db/ids";
import { feeding } from "@OpenFarm/db/schema/feed";
import type { FeedingLine } from "@OpenFarm/domain";
import { isShortFed, roundKg, shortfallPercent } from "@OpenFarm/domain";

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

/**
 * Records what a Pen was actually given against what its Ration owed it.
 *
 * The target is worked out from the Ration in force when the work was *raised* and the animals
 * standing in the Pen now, and both are written into the record with the figures — so a year
 * later the arithmetic can still be shown rather than re-derived from a farm that has changed.
 *
 * A session appreciably under target is flagged on the farm's own tolerance. That is the
 * first sign of a pen off its feed, a bag that ran out, or a job somebody did not do.
 */
const feedThePen = async (
  tx: Tx,
  input: FeedingFacts
): Promise<EffectResult> => {
  const owed = await feedingTargetForPen(
    tx,
    input.instance.farmId,
    penOf(input),
    // When the work was raised, not when it fell due: an Instance raised this morning for
    // tonight is fed on the Ration the farm had this morning, whatever is published between.
    input.instance.raisedAt,
    input.sessionsPerDay
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
  const given = new Map(input.feeding.map((line) => [line.feedItemId, line]));
  const lines: FeedingLine[] = owed.items.map((line) => ({
    feedItemId: line.feedItemId,
    // A line by weight in a Pen nobody weighed owed no figure, and nothing owed is never short.
    targetKg: line.quantity ?? 0,
    givenKg: roundKg(given.get(line.feedItemId)?.givenKg ?? 0),
    leftoverKg: roundKg(given.get(line.feedItemId)?.leftoverKg ?? 0),
  }));
  const short = shortfallPercent(lines);
  const flagged = isShortFed(lines, input.feedTolerancePercent);

  // Keyed on the Completion: a Correction rewrites what was given rather than feeding the Pen twice.
  await tx
    .insert(feeding)
    .values({
      id: uuidv7(input.now),
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
    })
    .onConflictDoUpdate({
      target: feeding.completionId,
      set: {
        lines,
        animals: owed.animals,
        herdWeightKg: weightColumnOf(owed),
        shortfallPercent: short,
        flaggedAt: flagged ? input.now : null,
        fedAt: input.recordedAt,
      },
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
          feeding: (fed.lines as FeedingLine[]).map((line) => ({
            feedItemId: line.feedItemId,
            givenKg: line.givenKg,
            leftoverKg: line.leftoverKg,
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
              givenKg: roundKg(line.givenKg),
              leftoverKg: roundKg(line.leftoverKg ?? 0),
            }))
            .toSorted((a, b) => a.feedItemId.localeCompare(b.feedItemId)),
        }
      : {},
};
