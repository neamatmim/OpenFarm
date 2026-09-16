import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { calving } from "@OpenFarm/db/schema/breeding";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { animal } from "@OpenFarm/db/schema/herd";
import type { CalfOutcome, CalfSex, CalvingEase } from "@OpenFarm/domain";
import { STILLBIRTH, isExitState } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx, Trail } from "./audit";
import type { PregnancyTimes } from "./breeding-store";
import type { CalvingWorkFollowed } from "./calving-work";
import { nothingFollowed } from "./calving-work";
import { calves, insertAnimal, redateCalving } from "./herd-store";
import { recordMortality, redateDeathOf } from "./mortality-store";

export interface Calf {
  sex: CalfSex;
  outcome: CalfOutcome;
}

/** What a Calving did, for the phone and for the trail. */
export type CalvingRecorded = {
  calvingId: string;
  calves: { tagNumber: string; sex: CalfSex; outcome: CalfOutcome }[];
  /** Corrected in a way the farm has already acted on — a calving taken back, a calf added or taken
   *  away, a stillborn calf put back among the living, a calf who has since left found stillborn.
   *  Nothing was changed. */
  actedOn: boolean;
} & CalvingWorkFollowed;

/** One calving as a Step recorded it. */
export interface CalvingEntry {
  farmId: string;
  damId: string;
  completionId: string;
  /** Null when the entry is skipped: she has not calved. */
  calved: { at: Date; ease: CalvingEase; calves: Calf[] } | null;
  recordedBy: string;
  /** The Role the calving was recorded under, which a stillborn calf's death is written under too. */
  recordedByRole: RoleName | null;
  times: PregnancyTimes;
  now: Date;
  /** The trail of the request recording it: the work it calls off is written there. */
  trail: Trail;
}

/**
 * A calf born dead leaves as Died in the act that created her, and her death is on the mortality register like
 * any other: the cause is a stillbirth, and what was done with her waits for the Manager, who is not at every
 * calving (the Owner's decision, 2026-09-13).
 */
const recordStillbirth = async (
  tx: Tx,
  entry: CalvingEntry,
  calfId: string,
  at: Date
): Promise<void> => {
  await recordMortality(
    tx,
    {
      farmId: entry.farmId,
      recordedBy: entry.recordedBy,
      recordedByRole: entry.recordedByRole,
      now: entry.now,
      trail: entry.trail,
    },
    { id: calfId },
    { kind: "died", happenedAt: at, cause: STILLBIRTH, disposal: null }
  );
};

/** Whether a calf was alive when she was born, as her calving recorded it. */
const asRecorded = (calf: { calfOutcome: CalfOutcome | null }): CalfOutcome =>
  calf.calfOutcome ?? "alive";

/** A calving recorded again: what can be put right is, and what cannot changes nothing. */
const putRight = async (
  tx: Tx,
  entry: CalvingEntry,
  standing: {
    id: string;
    damId: string;
    calvedAt: Date;
    lactationNumber: number;
    calves: {
      id: string;
      tagNumber: string;
      sex: CalfSex;
      state: string;
      calfOutcome: CalfOutcome | null;
      /** A Move she has made since she was born, if any: one is enough to say she was alive to make it. */
      moves: { id: string }[];
    }[];
  }
): Promise<CalvingRecorded> => {
  const { calved } = entry;
  // What a correction may not do from here, because the farm has already acted on it: take the
  // calving back, change how many calves there were, bring a stillborn calf back, or find stillborn
  // a calf who has since left the farm another way or been walked to another Pen.
  const cannot =
    !calved ||
    calved.calves.length !== standing.calves.length ||
    standing.calves.some((calf, index) => {
      const now = calved.calves[index];
      const wasStillborn = asRecorded(calf) === "stillborn";
      return (
        (wasStillborn && now?.outcome === "alive") ||
        (!wasStillborn &&
          now?.outcome === "stillborn" &&
          // She has since left, or been walked on: born dead is no longer something the farm can say of her.
          (isExitState(calf.state as never) || calf.moves.length > 0))
      );
    });
  if (cannot) {
    return {
      calvingId: standing.id,
      calves: standing.calves.map((calf) => ({
        tagNumber: calf.tagNumber,
        sex: calf.sex,
        outcome: asRecorded(calf),
      })),
      actedOn: true,
      ...nothingFollowed(),
    };
  }
  await tx
    .update(calving)
    .set({ calvedAt: calved.at, ease: calved.ease })
    .where(eq(calving.id, standing.id));
  // Everything the calving dated moves with its hour: her Lactation and the moment she reached Milking, while this is
  // still the calving she is in milk from, and each calf's birth and arrival.
  await redateCalving(
    tx,
    entry.farmId,
    {
      damId: standing.damId,
      lactationNumber: standing.lactationNumber,
      from: standing.calvedAt,
      to: calved.at,
      calfIds: standing.calves.map((calf) => calf.id),
    },
    entry.now
  );
  for (const [index, calf] of standing.calves.entries()) {
    const now = calved.calves[index];
    if (!now) {
      continue;
    }
    const becomesStillborn =
      now.outcome === "stillborn" && asRecorded(calf) !== "stillborn";
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(animal)
      .set({ sex: now.sex, calfOutcome: now.outcome, updatedAt: entry.now })
      .where(eq(animal.id, calf.id));
    if (becomesStillborn) {
      // oxlint-disable-next-line no-await-in-loop
      await recordStillbirth(tx, entry, calf.id, calved.at);
    } else if (asRecorded(calf) === "stillborn") {
      // A stillborn calf left when she was born, so her death, and her leaving, move with the hour too.
      // oxlint-disable-next-line no-await-in-loop
      await redateDeathOf(tx, entry.farmId, calf, calved.at, entry.now);
    }
  }
  return {
    calvingId: standing.id,
    calves: standing.calves.map((calf, index) => ({
      tagNumber: calf.tagNumber,
      sex: calved.calves[index]?.sex ?? calf.sex,
      outcome: calved.calves[index]?.outcome ?? asRecorded(calf),
    })),
    actedOn: false,
    ...nothingFollowed(),
  };
};

/**
 * Records that she calved, and does what a calving does.
 *
 * She reaches Milking and her next Lactation begins, dated from the calving; the calving she was
 * expected to have is behind her, and the work that was pulled towards it closes. Each calf becomes an
 * animal of her own — the next dairy Tag Number, in her mother's Pen, born on this farm, with no ear
 * tag yet — and a calf born dead is created all the same and leaves as Died in the same act, because a
 * calving history with a gap in it is not a calving history.
 *
 * Keyed on the Step Completion. Recorded again by a Correction, it puts right
 * what can be put right: the hour, how it went, a calf's sex, a calf found to have been born dead.
 * What cannot be — the calving itself, or how many calves there were, or a dead calf brought back —
 * changes nothing and says so, because a Tag Number once given is never given again.
 */
export const recordCalving = async (
  tx: Tx,
  entry: CalvingEntry
): Promise<CalvingRecorded | null> => {
  const standing = await tx.query.calving.findFirst({
    where: { completionId: entry.completionId },
    with: {
      calves: {
        columns: {
          id: true,
          tagNumber: true,
          sex: true,
          state: true,
          calfOutcome: true,
        },
        with: {
          moves: {
            where: { fromPenId: { isNotNull: true } },
            columns: { id: true },
            limit: 1,
          },
        },
        orderBy: { calfPosition: "asc", id: "asc" },
      },
    },
  });
  if (standing) {
    return await putRight(tx, entry, standing);
  }
  if (!entry.calved) {
    return null;
  }
  const dam = await tx.query.animal.findFirst({
    where: { id: entry.damId, farmId: entry.farmId },
    columns: {
      id: true,
      sex: true,
      side: true,
      state: true,
      penId: true,
      lactationNumber: true,
      expectedCalvingServiceId: true,
    },
  });
  if (!dam) {
    throw new ORPCError("NOT_FOUND", { message: "No such animal" });
  }
  if (dam.sex !== "female") {
    throw new ORPCError("BAD_REQUEST", {
      message: "A bull does not calve",
      data: { refusal: "calving_of_a_male" },
    });
  }

  const { at, ease, calves: calvesBorn } = entry.calved;
  const calvingId = uuidv7(entry.now);
  // Her State first: whether she may calve at all is the herd's to say, and her Lactation's number is what it begins.
  const { lactationNumber, calvingWork: followed } = await calves(
    tx,
    entry.farmId,
    dam,
    {
      at,
      now: entry.now,
      calvingLeadDays: entry.times.calvingLeadDays,
      trail: entry.trail,
    }
  );
  await tx.insert(calving).values({
    id: calvingId,
    farmId: entry.farmId,
    damId: dam.id,
    completionId: entry.completionId,
    calvedAt: at,
    ease,
    serviceId: dam.expectedCalvingServiceId,
    lactationNumber,
    recordedBy: entry.recordedBy,
    createdAt: entry.now,
  });

  const born: CalvingRecorded["calves"] = [];
  for (const [position, calf] of calvesBorn.entries()) {
    const calfId = uuidv7(entry.now);
    // Sequential: each calf takes the next Tag Number, twins in the order they were written.
    // oxlint-disable-next-line no-await-in-loop
    const { tagNumber } = await insertAnimal(tx, {
      id: calfId,
      farmId: entry.farmId,
      actorId: entry.recordedBy,
      input: {
        sex: calf.sex,
        side: "dairy",
        state: "calf",
        penId: dam.penId,
        source: "born",
        birthDate: at,
        aliases: [],
      },
      now: entry.now,
      arrivedAt: at,
      reason: "born",
      extra: {
        damId: dam.id,
        calvingId,
        calfPosition: position + 1,
        calfOutcome: calf.outcome,
      },
    });
    if (calf.outcome === "stillborn") {
      // oxlint-disable-next-line no-await-in-loop
      await recordStillbirth(tx, entry, calfId, at);
    }
    born.push({ tagNumber, ...calf });
  }
  return { calvingId, calves: born, actedOn: false, ...followed };
};
