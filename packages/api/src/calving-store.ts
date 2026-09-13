import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { calving } from "@OpenFarm/db/schema/breeding";
import { animal } from "@OpenFarm/db/schema/herd";
import type { CalfOutcome, CalfSex, CalvingEase } from "@OpenFarm/domain";
import { MAY_CALVE_FROM, isExitState } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { CalvingWorkFollowed, PregnancyTimes } from "./breeding-store";
import { followExpectedCalving, nothingFollowed } from "./breeding-store";
import { insertAnimal, recordExit } from "./herd-store";

export interface Calf {
  sex: CalfSex;
  outcome: CalfOutcome;
}

/** What a Calving did, for the phone and for the trail. */
export type CalvingRecorded = {
  calvingId: string;
  calves: { tagNumber: string; sex: CalfSex; outcome: CalfOutcome }[];
  /** Corrected in a way the farm cannot undo from here — a calving taken back, a calf added or taken
   *  away, a stillborn calf put back among the living, a calf who has since left found stillborn.
   *  Nothing was changed, and a person is asked. */
  cannotUndo: boolean;
} & CalvingWorkFollowed;

/** One calving as a Step recorded it. */
export interface CalvingEntry {
  farmId: string;
  damId: string;
  completionId: string;
  /** Null when the entry is skipped: she has not calved. */
  calved: { at: Date; ease: CalvingEase; calves: Calf[] } | null;
  recordedBy: string;
  times: PregnancyTimes;
  now: Date;
}

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
    }[];
  }
): Promise<CalvingRecorded> => {
  const { calved } = entry;
  // What a correction may not do from here, because the farm has already acted on it: take the
  // calving back, change how many calves there were, bring a stillborn calf back, or find stillborn
  // a calf who has since left the farm another way.
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
          isExitState(calf.state as never))
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
      cannotUndo: true,
      ...nothingFollowed(),
    };
  }
  await tx
    .update(calving)
    .set({ calvedAt: calved.at, ease: calved.ease })
    .where(eq(calving.id, standing.id));
  // Everything the calving dated moves with its hour: her Lactation and the moment she reached
  // Milking, while this is still the calving she is in milk from.
  const dam = await tx.query.animal.findFirst({
    where: { id: standing.damId },
    columns: { lactationNumber: true, state: true, stateChangedAt: true },
  });
  if (dam?.lactationNumber === standing.lactationNumber) {
    const stillFromThisCalving =
      dam.state === "milking" &&
      dam.stateChangedAt.getTime() === standing.calvedAt.getTime();
    await tx
      .update(animal)
      .set({
        lactationStartedAt: calved.at,
        ...(stillFromThisCalving ? { stateChangedAt: calved.at } : {}),
        updatedAt: entry.now,
      })
      .where(eq(animal.id, standing.damId));
  }
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
      .set({
        sex: now.sex,
        birthDate: calved.at,
        calfOutcome: now.outcome,
        // A stillborn calf left when she was born, so her exit moves with the hour too.
        ...(asRecorded(calf) === "stillborn"
          ? { stateChangedAt: calved.at }
          : {}),
        updatedAt: entry.now,
      })
      .where(eq(animal.id, calf.id));
    if (becomesStillborn) {
      // oxlint-disable-next-line no-await-in-loop
      await recordExit(
        tx,
        entry.farmId,
        { id: calf.id },
        {
          state: "died",
          at: calved.at,
          now: entry.now,
        }
      );
    }
  }
  return {
    calvingId: standing.id,
    calves: standing.calves.map((calf, index) => ({
      tagNumber: calf.tagNumber,
      sex: calved.calves[index]?.sex ?? calf.sex,
      outcome: calved.calves[index]?.outcome ?? asRecorded(calf),
    })),
    cannotUndo: false,
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
 * Keyed on the Step Completion. Recorded again — a phone replaying it, or a Correction — it puts right
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
      state: true,
      penId: true,
      lactationNumber: true,
      expectedCalvingServiceId: true,
    },
  });
  if (!dam) {
    throw new ORPCError("NOT_FOUND", { message: "No such animal" });
  }
  if (
    dam.sex !== "female" ||
    !(MAY_CALVE_FROM as readonly string[]).includes(dam.state)
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: `A ${dam.state.replace("_", " ")} does not calve`,
      data: { refusal: "calving_of_a_cow_not_in_calf" },
    });
  }

  const { at, ease, calves } = entry.calved;
  const calvingId = uuidv7(entry.now);
  const lactationNumber = dam.lactationNumber + 1;
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
  await tx
    .update(animal)
    .set({
      state: "milking",
      // When she calved, not when it was written down: days-in-milk and anything a State raises
      // count from here.
      stateChangedAt: at,
      lactationNumber,
      lactationStartedAt: at,
      expectedCalvingAt: null,
      expectedCalvingServiceId: null,
      updatedAt: entry.now,
    })
    .where(eq(animal.id, dam.id));
  const followed = await followExpectedCalving(
    tx,
    {
      id: dam.id,
      farmId: entry.farmId,
      lactationNumber,
      expectedCalvingAt: null,
    },
    entry.times.calvingLeadDays,
    { expectedAgain: false }
  );

  const born: CalvingRecorded["calves"] = [];
  for (const [position, calf] of calves.entries()) {
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
      await recordExit(
        tx,
        entry.farmId,
        { id: calfId },
        {
          state: "died",
          at,
          now: entry.now,
        }
      );
    }
    born.push({ tagNumber, ...calf });
  }
  return { calvingId, calves: born, cannotUndo: false, ...followed };
};
