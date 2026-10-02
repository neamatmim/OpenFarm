import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { mortality, mortalityPhoto } from "@OpenFarm/db/schema/herd";
import type { Disposal, MortalityKind } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx, Trail } from "./audit";
import { correctHowSheLeft, leaves, requireAnimal } from "./herd-store";

/** The mortality as the trail records it either side of a Correction. */
export const readMortality = async (tx: Tx, id: string) =>
  (await tx.query.mortality.findFirst({
    where: { id },
    columns: {
      kind: true,
      happenedAt: true,
      cause: true,
      diagnosisId: true,
      disposal: true,
      disposalNote: true,
    },
  })) ?? null;

/**
 * Refuses a Diagnosis that is not hers: what she died of, for the register, is only ever her own Vet's conclusion. The
 * Diagnosis is linked, never copied — a Correction the Vet makes to it reaches the register too.
 */
const assertHerDiagnosis = async (
  tx: Tx,
  farmId: string,
  animalId: string,
  diagnosisId: string
): Promise<void> => {
  const hers = await tx.query.diagnosis.findFirst({
    where: { id: diagnosisId, farmId, animalId },
    columns: { id: true },
  });
  if (!hers) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That diagnosis is not hers",
      data: { refusal: "diagnosis_not_hers" },
    });
  }
};

/** An animal and the mortality recorded of her, for putting it right or finishing it; refused when she has none. */
export const mortalityOf = async (
  db: Pick<Database, "query">,
  farmId: string,
  tagNumber: string
) => {
  const her = await requireAnimal(db, farmId, tagNumber);
  const existing = await db.query.mortality.findFirst({
    where: { animalId: her.id, farmId },
    columns: { id: true, recordedBy: true, recordedAt: true },
  });
  if (!existing) {
    throw new ORPCError("NOT_FOUND", {
      message: `${tagNumber} has no death or cull recorded`,
    });
  }
  return { her, existing };
};

/** Who wrote a death down, and when the farm heard of it. */
export interface MortalityRecorder {
  farmId: string;
  recordedBy: string;
  /** The Role it was written under: a stillbirth is written under the Role the calving was. */
  recordedByRole: RoleName | null;
  now: Date;
  /** The trail of the request writing it down: the work her leaving calls off is written there. */
  trail: Trail;
}

/**
 * An animal's death or cull, and her leaving the herd by it, in one act: she reaches her exit State and the mortality
 * is written together, and from that moment she is off the pen boards, out of the day's work and out of the headcounts.
 * A stillborn calf's too, whose calving writes it with the cause stillbirth and leaves the disposal awaiting for the
 * Manager (the Owner's decision, 2026-09-13).
 *
 * Nothing of hers is removed: the farm's mortality register is read from this row, and everything else recorded about
 * her stays exactly where it is. Written once; the same death arriving again — a calving recorded again — changes
 * nothing.
 */
export const recordMortality = async (
  tx: Tx,
  recorder: MortalityRecorder,
  her: { id: string },
  death: {
    id?: string;
    kind: MortalityKind;
    happenedAt: Date;
    /** What the farm knows, not a diagnosis: a Vet's conclusion is a Diagnosis. */
    cause: string;
    diagnosisId?: string | null;
    /** Awaiting when nobody could say yet — a stillborn calf. */
    disposal: Disposal | null;
    disposalNote?: string | null;
  }
): Promise<{ id: string; recorded: boolean; workClosed: number }> => {
  const id = death.id ?? uuidv7(recorder.now);
  if (death.diagnosisId) {
    await assertHerDiagnosis(tx, recorder.farmId, her.id, death.diagnosisId);
  }
  const [written] = await tx
    .insert(mortality)
    .values({
      id,
      farmId: recorder.farmId,
      animalId: her.id,
      kind: death.kind,
      happenedAt: death.happenedAt,
      cause: death.cause,
      diagnosisId: death.diagnosisId ?? null,
      disposal: death.disposal,
      disposalNote: death.disposalNote ?? null,
      recordedBy: recorder.recordedBy,
      recordedByRole: recorder.recordedByRole,
      recordedAt: recorder.now,
    })
    .onConflictDoNothing({ target: mortality.animalId })
    .returning({ id: mortality.id });
  if (!written) {
    return { id, recorded: false, workClosed: 0 };
  }
  const { workClosed } = await leaves(tx, recorder.farmId, her, {
    state: death.kind,
    at: death.happenedAt,
    now: recorder.now,
    trail: recorder.trail,
  });
  return { id, recorded: true, workClosed };
};

/**
 * What was done with a carcass whose death was written before anybody could say. Only while it is still awaited, asked
 * inside the transaction: two phones writing it at once write it once, and the second is told it is there. A disposal
 * already written is put right by a Correction.
 */
export const writeDisposal = async (
  tx: Tx,
  mortalityId: string,
  disposed: { disposal: Disposal; disposalNote?: string | null }
): Promise<void> => {
  const [written] = await tx
    .update(mortality)
    .set({
      disposal: disposed.disposal,
      disposalNote: disposed.disposalNote ?? null,
    })
    .where(and(eq(mortality.id, mortalityId), isNull(mortality.disposal)))
    .returning({ id: mortality.id });
  if (!written) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Her disposal is already written down; put it right with a Correction",
      data: { refusal: "disposal_already_recorded" },
    });
  }
};

/**
 * Puts a mortality right: the cause the farm learned afterwards, the disposal written down wrong, the morning it
 * actually happened — and whether she died or was culled, which is her exit State as well as this row, so both move
 * together. Only the applying: whether it may be put right, and why, is the Correction's to settle first.
 */
export const correctMortality = async (
  tx: Tx,
  farmId: string,
  mortalityId: string,
  her: { id: string },
  corrected: {
    kind?: MortalityKind;
    cause?: string;
    disposal?: Disposal;
    disposalNote?: string;
    happenedAt?: Date;
    /** The Diagnosis she died of, or nothing to unlink one linked by mistake. */
    diagnosisId?: string | null;
  },
  now: Date
): Promise<void> => {
  if (corrected.diagnosisId) {
    await assertHerDiagnosis(tx, farmId, her.id, corrected.diagnosisId);
  }
  await tx
    .update(mortality)
    .set({
      ...(corrected.diagnosisId === undefined
        ? {}
        : { diagnosisId: corrected.diagnosisId }),
      ...(corrected.kind ? { kind: corrected.kind } : {}),
      ...(corrected.cause ? { cause: corrected.cause } : {}),
      ...(corrected.disposal ? { disposal: corrected.disposal } : {}),
      ...(corrected.disposalNote === undefined
        ? {}
        : { disposalNote: corrected.disposalNote }),
      ...(corrected.happenedAt ? { happenedAt: corrected.happenedAt } : {}),
    })
    .where(eq(mortality.id, mortalityId));
  await correctHowSheLeft(tx, farmId, her, {
    state: corrected.kind,
    at: corrected.happenedAt,
    now,
  });
};

/** Moves a death to the hour it now happened in — a stillborn calf's, when her calving's hour is put right — whatever
 *  cause the farm has since written for it. Nothing, for an animal with no death recorded. */
export const redateDeathOf = async (
  tx: Tx,
  farmId: string,
  her: { id: string },
  happenedAt: Date,
  now: Date
): Promise<void> => {
  const death = await tx.query.mortality.findFirst({
    where: { animalId: her.id, farmId },
    columns: { id: true },
  });
  if (death) {
    await correctMortality(tx, farmId, death.id, her, { happenedAt }, now);
  }
};

/** A photograph of a dead animal, as a phone sends it: downscaled and base64. */
export interface DeathPhoto {
  contentType: string;
  data: string;
}

/** Refused: a death or a cull is not taken without a photograph of her showing her tag. */
export const deathNeedsAPhoto = () =>
  new ORPCError("BAD_REQUEST", {
    message:
      "A death or a cull is written with a photograph of her showing her tag",
    data: { refusal: "death_needs_a_photo" },
  });

/**
 * Keeps a photograph of her with her Mortality. One kept before stays, marked replaced: a Correction may add a newer
 * photograph and never takes one away.
 */
export const keepDeathPhoto = async (
  tx: Tx,
  farmId: string,
  mortalityId: string,
  photo: DeathPhoto,
  by: string,
  now: Date
): Promise<void> => {
  await tx
    .update(mortalityPhoto)
    .set({ replacedAt: now })
    .where(
      and(
        eq(mortalityPhoto.mortalityId, mortalityId),
        eq(mortalityPhoto.farmId, farmId),
        isNull(mortalityPhoto.replacedAt)
      )
    );
  await tx.insert(mortalityPhoto).values({
    id: uuidv7(now),
    farmId,
    mortalityId,
    contentType: photo.contentType,
    data: photo.data,
    takenBy: by,
    takenAt: now,
  });
};
