import { eq } from "@OpenFarm/db/operators";
import { mortality, mortalityPhoto } from "@OpenFarm/db/schema/herd";
import { DISPOSALS, MORTALITY_KINDS } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { comesBackFromAVoidedExit } from "../herd-store";
import { receiptInput } from "../money-inputs";
import {
  correctMortality,
  keepDeathPhoto,
  readMortality,
} from "../mortality-store";
import { assertNotSettledUp } from "../venture-act";
import { keepWhatWasPhotographed } from "../voided-photos";
import type { CorrectionKind, Corrector } from "./correction";
import { changeOf, correctionInput, herVenturesAround } from "./correction";

const loadMortality = (tx: Tx, farmId: string, id: string) =>
  tx.query.mortality.findFirst({ where: { id, farmId } });

const kind = z.enum(MORTALITY_KINDS);
const disposal = z.enum(DISPOSALS);

/**
 * A death or a cull written against the wrong animal, voided by the Owner: the record and its photographs are taken off
 * the books, the work raised about her since — her carcass — is called off, and she comes back as she was. A Venture
 * settled on her refuses it, as any Correction of her leaving is refused (`venturesOf`).
 */
const voidTheDeath = async (
  tx: Tx,
  row: NonNullable<Awaited<ReturnType<typeof loadMortality>>>,
  context: Corrector,
  now: Date
) => {
  if (context.roleUsed !== "owner") {
    throw new ORPCError("FORBIDDEN", {
      message: "Only the Owner voids a death",
      data: { refusal: "owner_only" },
    });
  }
  if (!(row.stateBefore && row.stateChangedBefore)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This death was written before a death could be voided",
      data: { refusal: "cannot_be_voided" },
    });
  }
  // Her Venture's Settlement approved, not only settled, already counts her gone (venture-act's `assertNotSettledUp`).
  const hers = await tx.query.animal.findFirst({
    where: { id: row.animalId },
    columns: { ownerVentureId: true },
  });
  if (hers?.ownerVentureId) {
    await assertNotSettledUp(tx, row.farmId, hers.ownerVentureId);
  }
  // Her photographs go with the death no further than the void: kept under her, as a Correction takes none away.
  const photos = await tx.query.mortalityPhoto.findMany({
    where: { mortalityId: row.id },
    columns: { contentType: true, data: true, takenAt: true },
  });
  await keepWhatWasPhotographed(tx, {
    farmId: row.farmId,
    animalId: row.animalId,
    from: "death",
    sourceId: row.id,
    photos,
    by: context.actor.id,
    at: now,
  });
  await tx.delete(mortalityPhoto).where(eq(mortalityPhoto.mortalityId, row.id));
  await tx.delete(mortality).where(eq(mortality.id, row.id));
  await comesBackFromAVoidedExit(
    tx,
    row.farmId,
    { id: row.animalId },
    {
      state: row.stateBefore,
      since: row.stateChangedBefore,
      leftAt: row.happenedAt,
      now,
      trail: audited(context).recordEvent,
      voided: "death",
    }
  );
};

/**
 * What putting a mortality right may change: whether she died or was culled, the cause the farm learned afterwards,
 * the Vet's Diagnosis of what she died of — set to nothing, unlinked — the disposal written down wrong, and the morning it
 * actually happened. Asked about by her Tag Number, as the screen knows her.
 */
export const mortalityCorrectionInput = correctionInput({
  kind: changeOf(kind, kind),
  cause: changeOf(z.string().trim().min(1).max(300), z.string()),
  disposal: changeOf(disposal, disposal.nullable()),
  disposalNote: changeOf(z.string().trim().max(300), z.string().nullable()),
  happenedAt: changeOf(z.coerce.date(), z.coerce.date()),
  diagnosisId: changeOf(z.string().nullable(), z.string().nullable()),
  /** Written against the wrong animal: the Owner voids it, and she comes back as she was (the Owner, 2026-10-06). */
  voided: changeOf(z.literal(true), z.boolean()),
})
  .omit({ id: true })
  .extend({
    tagNumber: z.string().trim().min(1).max(32),
    /** A newer photograph of her: added, never in place of the one kept. */
    photo: receiptInput.optional(),
  });

/**
 * A mortality put right. Whether she died or was culled is her exit State as well as this row, so both move together:
 * a death written up as a cull by somebody in a hurry is a mistake the farm can correct rather than live with.
 */
export const mortalityCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadMortality>>>,
  z.infer<typeof mortalityCorrectionInput>["changes"],
  unknown,
  Pick<z.infer<typeof mortalityCorrectionInput>, "photo">
> = {
  entity: "mortality",
  table: mortality,
  roles: ["owner", "manager"],
  // How she left decides whether her Venture ever sold her, and so what its Settlement counted.
  // How she left, and when — which is what decides whether her Venture ever sold her at all.
  venturesOf: herVenturesAround((row) => row.happenedAt),
  missing: "No such death or cull",
  load: loadMortality,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: (_tx, row) =>
    Promise.resolve({
      kind: row.kind,
      cause: row.cause,
      disposal: row.disposal,
      disposalNote: row.disposalNote,
      happenedAt: row.happenedAt,
      diagnosisId: row.diagnosisId,
      voided: false,
    }),
  // A newer photograph is a change of its own, with nothing else put right beside it.
  changesBeyondValues: ({ photo }) => photo !== undefined,
  trail: (tx, row) => readMortality(tx, row.id),
  apply: async (tx, row, to, { now, context, extra }) => {
    if (to.voided) {
      await voidTheDeath(tx, row, context, now);
      return;
    }
    if (extra.photo) {
      await keepDeathPhoto(
        tx,
        row.farmId,
        row.id,
        extra.photo,
        context.actor.id,
        now
      );
    }
    if (to.happenedAt && to.happenedAt > now) {
      throw new ORPCError("BAD_REQUEST", {
        message: "An animal cannot have died in the future",
      });
    }
    // Only a newer photograph: nothing of the record itself to put right.
    if (Object.keys(to).length === 0) {
      return;
    }
    await correctMortality(
      tx,
      row.farmId,
      row.id,
      { id: row.animalId },
      to,
      now
    );
  },
};
