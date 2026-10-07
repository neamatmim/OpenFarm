import { and, eq, inArray } from "@OpenFarm/db/operators";
import { intake } from "@OpenFarm/db/schema/fattening";
import { animal, animalMove } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { ventureMovement } from "@OpenFarm/db/schema/venture-account";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { readAnimal } from "../herd-store";
import { forgetTheMoneyOf } from "../money-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

const builtOn = (message: string) =>
  new ORPCError("BAD_REQUEST", {
    message,
    data: { refusal: "she_is_built_on" },
  });

/** A foreign key refused: somebody wrote something about her since, which keeps her. */
const isWrittenAbout = (error: unknown): boolean => {
  const said = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return said?.code === "23503" || said?.cause?.code === "23503";
};

/**
 * An animal written down who never came — registered twice, an Intake typed twice — taken back: everything writing her
 * down made (her Intake, its money, the bank payment for her from a Venture's account, the Move that put her in her Pen,
 * work raised for her alone and not begun) and her. Refused, by the database itself, the moment anything else stands on
 * her: a weigh-in, a dose, a Move, a Sale, an Internal Sale. Then she is a real animal, and her way out is the farm's
 * ordinary one. A ghost on the pen board made every evening's count one short and opened a Missing; her only ways out
 * were false — a death, a Sale at nothing, a Lost write-off.
 */
export const voidTheAnimal = async (
  tx: Tx,
  farmId: string,
  animalId: string
): Promise<void> => {
  const moves = await tx.query.animalMove.findMany({
    where: { farmId, animalId },
    columns: { id: true },
  });
  if (moves.length > 1) {
    throw builtOn("She has been moved since she was written down");
  }
  const work = await tx.query.sopInstance.findMany({
    where: { farmId, animalId },
    columns: { id: true },
    with: { completions: { columns: { id: true } } },
  });
  if (work.some((one) => one.completions.length > 0)) {
    throw builtOn("Work has been done on her since she was written down");
  }
  if (work.length > 0) {
    await tx.delete(sopInstance).where(
      inArray(
        sopInstance.id,
        work.map((one) => one.id)
      )
    );
  }
  const came = await tx.query.intake.findFirst({
    where: { farmId, animalId },
    columns: { id: true },
  });
  if (came) {
    await tx
      .delete(ventureMovement)
      .where(
        and(
          eq(ventureMovement.farmId, farmId),
          eq(ventureMovement.intakeId, came.id)
        )
      );
    await forgetTheMoneyOf(tx, "intake", came.id);
    await tx.delete(intake).where(eq(intake.id, came.id));
  }
  try {
    await tx.delete(animalMove).where(eq(animalMove.animalId, animalId));
    await tx.delete(animal).where(eq(animal.id, animalId));
  } catch (error) {
    if (isWrittenAbout(error)) {
      throw builtOn(
        "Something has been written about her since she was written down"
      );
    }
    throw error;
  }
};

const loadRegistered = async (tx: Tx, farmId: string, id: string) => {
  const her = await tx.query.animal.findFirst({ where: { id, farmId } });
  if (!her) {
    return her;
  }
  const first = await tx.query.animalMove.findFirst({
    where: { farmId, animalId: id },
    orderBy: { movedAt: "asc", id: "asc" },
    columns: { movedBy: true },
  });
  return { ...her, writtenBy: first?.movedBy ?? null };
};

/** A registration put right is only ever taken back: what she is — her sex, breed, birth date — has its own Corrections. */
export const registrationCorrectionInput = correctionInput({
  /** Registered twice, or a calf written down who was never born: voided by whoever registered her within their window,
   *  the Owner at any time (the Owner, 2026-10-07). */
  voided: changeOf(z.literal(true), z.boolean()),
})
  .omit({ id: true })
  .extend({ tagNumber: z.string().trim().min(1).max(32) });

/** An animal registered — born on the farm, or written down at the start — taken back. One bought in is taken back by
 *  her Intake's Correction, which voids her the same way. */
export const registrationCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadRegistered>>>,
  z.infer<typeof registrationCorrectionInput>["changes"]
> = {
  entity: "animal",
  table: animal,
  roles: ["owner", "manager"],
  missing: "No such animal",
  load: loadRegistered,
  entry: (her) => ({ enteredAt: her.createdAt, enteredBy: her.writtenBy }),
  shown: () => Promise.resolve({ voided: false }),
  trail: (tx, her) => readAnimal(tx, her.id),
  apply: async (tx, her, to) => {
    if (to.voided) {
      const bought = await tx.query.intake.findFirst({
        where: { farmId: her.farmId, animalId: her.id },
        columns: { id: true },
      });
      if (bought) {
        throw new ORPCError("BAD_REQUEST", {
          message: "She was bought in: void her Intake",
          data: { refusal: "void_her_intake" },
        });
      }
      await voidTheAnimal(tx, her.farmId, her.id);
    }
  },
};
