import { eq } from "@OpenFarm/db/operators";
import { animal } from "@OpenFarm/db/schema/herd";
import { farmDayOf, isExitState } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import {
  expectedCalvingWithinReach,
  pregnancyTimesOf,
} from "../breeding-store";
import type { CalvingWorkFollowed } from "../calving-work";
import { followExpectedCalving } from "../calving-work";
import { farmDay } from "../farm-clock";
import { readAnimal } from "../herd-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

/** A cow on the farm whose Expected Calving somebody gave, and only that: one worked out from a Pregnancy Check is put
 *  right by correcting the service or the check it came from, never typed over. */
const loadCarrying = async (tx: Tx, farmId: string, id: string) => {
  const her = await tx.query.animal.findFirst({ where: { id, farmId } });
  if (!her) {
    return her;
  }
  if (isExitState(her.state)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Animal ${her.tagNumber} has left the farm (${her.state}) and cannot be changed`,
    });
  }
  if (!her.expectedCalvingAt) {
    throw new ORPCError("BAD_REQUEST", {
      message: `${her.tagNumber} is not expected to calve`,
      data: { refusal: "no_calving_expected" },
    });
  }
  if (her.expectedCalvingServiceId) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Her Expected Calving is worked out from her service; correct the service or the check instead",
      data: { refusal: "calving_is_derived" },
    });
  }
  return { ...her, expectedCalvingAt: her.expectedCalvingAt };
};

/** What putting her Expected Calving right changes: the farm day. Asked about by her Tag Number, as the screen knows
 *  her. */
export const expectedCalvingCorrectionInput = correctionInput({
  expectedCalvingOn: changeOf(farmDay, z.string()),
})
  .omit({ id: true })
  .extend({ tagNumber: z.string().trim().min(1).max(32) });

/**
 * The Expected Calving somebody gave for a cow bought in carrying, put right, and her open calving work taken to the new
 * day. A fact that was never an entry: it has no Correction Window, only the Roles that may correct it — the Manager
 * corrects it when a later check says she is further along, however long after she arrived.
 */
export const expectedCalvingCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadCarrying>>>,
  z.infer<typeof expectedCalvingCorrectionInput>["changes"],
  CalvingWorkFollowed | null
> = {
  entity: "animal",
  supersedes: false,
  table: animal,
  roles: ["owner", "manager"],
  missing: "No such animal",
  load: loadCarrying,
  entry: null,
  shown: (_tx, her) =>
    Promise.resolve({
      expectedCalvingOn: farmDayOf(her.expectedCalvingAt),
    }),
  // What the day decided, with the day: a corrected day that moved the calving work has to say which work went where.
  trail: async (tx, her, followed) => ({
    ...(await readAnimal(tx, her.id)),
    ...followed,
  }),
  apply: async (tx, her, to, { context, now }) => {
    if (!to.expectedCalvingOn) {
      return null;
    }
    const expectedCalvingAt = expectedCalvingWithinReach(
      to.expectedCalvingOn,
      now,
      context.farm.gestationDays
    );
    await tx
      .update(animal)
      .set({ expectedCalvingAt, updatedAt: now })
      .where(eq(animal.id, her.id));
    return followExpectedCalving(
      tx,
      { ...her, expectedCalvingAt },
      pregnancyTimesOf(context.farm).calvingLeadDays,
      { expectedAgain: false }
    );
  },
};
