import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { calving } from "@OpenFarm/db/schema/breeding";
import { animal } from "@OpenFarm/db/schema/herd";
import type { BirthOutcome, CalfSex, CalvingEase } from "@OpenFarm/domain";
import { MAY_CALVE_FROM } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { CalvingWorkFollowed, PregnancyTimes } from "./breeding-store";
import { followExpectedCalving } from "./breeding-store";
import { insertAnimal, recordExit } from "./herd-store";

export interface Calf {
  sex: CalfSex;
  outcome: BirthOutcome;
}

/** What a Calving did, for the phone and for the trail. */
export type CalvingRecorded = {
  calvingId: string;
  calves: { tagNumber: string; sex: CalfSex; outcome: BirthOutcome }[];
  /** Corrected in a way the farm cannot undo from here — a calving taken back, a calf added or taken
   *  away, a stillborn calf put back among the living. Nothing was changed, and a person is asked. */
  cannotUndo: boolean;
} & CalvingWorkFollowed;

const NOTHING_FOLLOWED: CalvingWorkFollowed = {
  workMoved: [],
  workClosed: [],
  workReopened: [],
};

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

/** A calving recorded again: what can be put right is, and what cannot changes nothing. */
const putRight = async (
  tx: Tx,
  entry: CalvingEntry,
  standing: {
    id: string;
    damId: string;
    lactationNumber: number;
    calves: { id: string; tagNumber: string; sex: CalfSex; state: string }[];
  }
): Promise<CalvingRecorded> => {
  const asItStands: CalvingRecorded = {
    calvingId: standing.id,
    calves: standing.calves.map((calf) => ({
      tagNumber: calf.tagNumber,
      sex: calf.sex,
      outcome: calf.state === "died" ? "stillborn" : "alive",
    })),
    cannotUndo: true,
    ...NOTHING_FOLLOWED,
  };
  const { calved } = entry;
  const cannot =
    !calved ||
    calved.calves.length !== standing.calves.length ||
    standing.calves.some(
      (calf, index) =>
        calf.state === "died" && calved.calves[index]?.outcome === "alive"
    );
  if (cannot) {
    return asItStands;
  }
  await tx
    .update(calving)
    .set({ calvedAt: calved.at, ease: calved.ease })
    .where(eq(calving.id, standing.id));
  // Her Lactation is dated from this calving while it is still the one she is in.
  const dam = await tx.query.animal.findFirst({
    where: { id: standing.damId },
    columns: { lactationNumber: true },
  });
  if (dam?.lactationNumber === standing.lactationNumber) {
    await tx
      .update(animal)
      .set({ lactationStartedAt: calved.at, updatedAt: entry.now })
      .where(eq(animal.id, standing.damId));
  }
  for (const [index, calf] of standing.calves.entries()) {
    const now = calved.calves[index];
    if (!now) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(animal)
      .set({ sex: now.sex, birthDate: calved.at, updatedAt: entry.now })
      .where(eq(animal.id, calf.id));
    if (now.outcome === "stillborn" && calf.state !== "died") {
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
      outcome: calved.calves[index]?.outcome ?? "alive",
    })),
    cannotUndo: false,
    ...NOTHING_FOLLOWED,
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
        columns: { id: true, tagNumber: true, sex: true, state: true },
        orderBy: { id: "asc" },
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
  for (const calf of calves) {
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
      extra: { damId: dam.id, calvingId },
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
