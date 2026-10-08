import { eq } from "@OpenFarm/db/operators";
import { SEXES, animal } from "@OpenFarm/db/schema/herd";
import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { requireBreed } from "../breed-store";
import { farmDay } from "../farm-clock";
import { readAnimal } from "../herd-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const refuse = (message: string, refusal: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

const loadAnimal = async (tx: Tx, farmId: string, id: string) => {
  const her = await tx.query.animal.findFirst({ where: { id, farmId } });
  if (!her) {
    return her;
  }
  const dam = her.damId
    ? await tx.query.animal.findFirst({
        where: { id: her.damId },
        columns: { tagNumber: true },
      })
    : undefined;
  return { ...her, damTag: dam?.tagNumber ?? null };
};

/** What putting an animal's own facts right may change — what she is, as the farm wrote her down — asked about by her
 *  Tag Number, as the screen knows her. Her dam named by her tag, or nobody. */
export const animalFactsCorrectionInput = correctionInput({
  sex: changeOf(z.enum(SEXES), z.string()),
  breedId: changeOf(z.string().nullable(), z.string().nullable()),
  birthDate: changeOf(farmDay.nullable(), z.string().nullable()),
  damTag: changeOf(
    z.string().trim().min(1).max(32).nullable(),
    z.string().nullable()
  ),
})
  .omit({ id: true })
  .extend({ tagNumber: z.string().trim().min(1).max(32) });

/** Her sex is what her breeding, her calvings and her calves rest on: once any is written, she is what they say. */
const assertNothingRestsOnHerSex = async (tx: Tx, animalId: string) => {
  const [served, checked, calved, mothered] = await Promise.all([
    tx.query.service.findFirst({ where: { animalId }, columns: { id: true } }),
    tx.query.pregnancyCheck.findFirst({
      where: { animalId },
      columns: { id: true },
    }),
    tx.query.calving.findFirst({
      where: { damId: animalId },
      columns: { id: true },
    }),
    tx.query.animal.findFirst({
      where: { damId: animalId },
      columns: { id: true },
    }),
  ]);
  if (served || checked || calved || mothered) {
    throw refuse(
      "Her breeding, a calving or a calf of hers rests on what she is",
      "sex_rests_on_breeding"
    );
  }
};

/**
 * What an animal is, put right by the Owner or the Manager with a reason: her sex, her breed, her birth date, her dam.
 * Only her tag and her State could be changed: a breed left out at the gate could never be added, though it decides her
 * Expected Gain, the deshi judgment and a heifer's first service; and a sex typed wrong gave her the other Side's
 * routines for good.
 */
export const animalFactsCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadAnimal>>>,
  z.infer<typeof animalFactsCorrectionInput>["changes"]
> = {
  entity: "animal",
  supersedes: false,
  table: animal,
  roles: ["owner", "manager"],
  missing: "No such animal",
  load: loadAnimal,
  // A fact about her, not an entry: no window, only the Roles that may correct it.
  entry: null,
  shown: (_tx, her) =>
    Promise.resolve({
      sex: her.sex,
      breedId: her.breedId,
      birthDate: her.birthDate ? farmDayOf(her.birthDate) : null,
      damTag: her.damTag,
    }),
  trail: (tx, her) => readAnimal(tx, her.id),
  apply: async (tx, her, to, { now }) => {
    if (to.sex !== undefined) {
      await assertNothingRestsOnHerSex(tx, her.id);
    }
    if (to.breedId) {
      await requireBreed(tx, her.farmId, to.breedId);
    }
    if (to.birthDate && startOfFarmDay(to.birthDate) > now) {
      throw refuse(
        "She cannot have been born on a day that has not come yet",
        "born_in_the_future"
      );
    }
    let damId: string | null | undefined;
    if (to.damTag !== undefined) {
      damId = null;
      if (to.damTag !== null) {
        const dam = await tx.query.animal.findFirst({
          where: { farmId: her.farmId, tagNumber: to.damTag.toUpperCase() },
          columns: { id: true, sex: true },
        });
        if (!dam || dam.id === her.id || dam.sex !== "female") {
          throw refuse("Her dam is a cow of this farm's", "not_her_dam");
        }
        damId = dam.id;
      }
    }
    const putRight = {
      ...(to.sex === undefined ? {} : { sex: to.sex }),
      ...(to.breedId === undefined ? {} : { breedId: to.breedId }),
      ...(to.birthDate === undefined
        ? {}
        : {
            birthDate: to.birthDate ? startOfFarmDay(to.birthDate) : null,
          }),
      ...(damId === undefined ? {} : { damId }),
    };
    if (somethingChanged(putRight)) {
      await tx
        .update(animal)
        .set({ ...putRight, updatedAt: now })
        .where(eq(animal.id, her.id));
    }
  },
};
