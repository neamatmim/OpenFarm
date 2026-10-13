import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { treatment } from "@OpenFarm/db/schema/health";
import { daysOfADoseNotPrescribed } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { tellIfItsLotHadExpired } from "./effects/treatment";
import { recomputeWithdrawal } from "./health-store";
import { loadLiveAnimal } from "./herd-store";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";

// A dose not prescribed: one the pharmacy or anybody else advised, given before the Vet saw her. Recorded afterwards by
// the Owner or the Manager, so that her Withdrawal stands on it as on any dose — the milk and sale gates read nothing
// else — and told to the Vet, who answers for every withdrawal day.

type Db = Pick<Database, "query"> | Tx;

/** How far back the sweep looks for a dose the Vet has not yet been told of. */
const TOLD_WITHIN_MS = 2 * 24 * 60 * 60 * 1000;

const refused = (message: string, refusal: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

/**
 * Whether this medicine may be given as a dose not prescribed at this time, and the days it holds her for: refused for a
 * time still to come, a medicine the farm does not have or has retired, and one the Vet has written no days for and the
 * farm no default. Asked once for a whole Pen before anybody is dosed, and again inside each animal's own write.
 */
export const mayBeGivenNotPrescribed = async (
  db: Db,
  farmId: string,
  dose: { productId: string; givenAt: Date },
  now: Date
) => {
  if (dose.givenAt > now) {
    throw refused(
      "A dose cannot have been given at a time that has not come yet",
      "given_in_the_future"
    );
  }
  const product = await db.query.drugProduct.findFirst({
    where: { id: dose.productId, farmId },
    columns: {
      milkWithdrawalDays: true,
      meatWithdrawalDays: true,
      retiredAt: true,
    },
  });
  if (!product) {
    throw new ORPCError("NOT_FOUND", {
      message: "No such product",
      data: { refusal: "no_such_product" },
    });
  }
  if (product.retiredAt) {
    throw refused(
      "That product is retired from the Drug List",
      "product_retired"
    );
  }
  // Read here rather than from the request: the Vet may have written them a moment ago.
  const farm = await db.query.farm.findFirst({
    where: { id: farmId },
    columns: {
      defaultMilkWithdrawalDays: true,
      defaultMeatWithdrawalDays: true,
    },
  });
  const days = daysOfADoseNotPrescribed(product, {
    milkDays: farm?.defaultMilkWithdrawalDays ?? null,
    meatDays: farm?.defaultMeatWithdrawalDays ?? null,
  });
  if (!days) {
    throw refused(
      "The Vet has written no withdrawal days for this product, nor the farm's Default Withdrawal Days; ask the Vet",
      "ask_the_vet_for_days"
    );
  }
  return {
    milkWithdrawalDays: product.milkWithdrawalDays ?? days.milkWithdrawalDays,
    meatWithdrawalDays: product.meatWithdrawalDays ?? days.meatWithdrawalDays,
  };
};

/** Writes the dose, takes it from the store as any dose is, and works her Withdrawal out afresh. */
export const recordDoseNotPrescribed = async (
  tx: Tx,
  farmId: string,
  input: {
    /** The id the screen gave this animal's dose, so one sent again is found and never written twice. */
    id?: string;
    tagNumber: string;
    productId: string;
    givenAt: Date;
    advice: string;
    givenBy: string;
  },
  now: Date
): Promise<{ id: string; animalId: string }> => {
  const holds = await mayBeGivenNotPrescribed(tx, farmId, input, now);
  const her = await loadLiveAnimal(tx, farmId, input.tagNumber);
  const id = input.id ?? uuidv7(now);
  await tx.insert(treatment).values({
    id,
    farmId,
    prescriptionId: null,
    productId: input.productId,
    animalId: her.id,
    instanceId: null,
    number: 1,
    dueAt: input.givenAt,
    givenBy: input.givenBy,
    givenAt: input.givenAt,
    advice: input.advice,
    ...holds,
    learnedAt: now,
    createdAt: now,
  });
  await recomputeWithdrawal(tx, farmId, her.id, now);
  await tellIfItsLotHadExpired(tx, farmId, id, now);
  return { id, animalId: her.id };
};

/** A dose not prescribed the Vet has not been told of. */
export interface DoseToTell {
  id: string;
  tagNumber: string;
  product: string;
  productEn: string | null;
  advice: string;
}

/** Doses not prescribed, recorded lately, that no notice has told the Vet of — oldest first. */
export const dosesToTell = async (
  db: Db,
  farmId: string,
  now: Date
): Promise<DoseToTell[]> => {
  const recent = await db.query.treatment.findMany({
    where: {
      farmId,
      prescriptionId: { isNull: true },
      instanceId: { isNull: true },
      createdAt: { gte: new Date(now.getTime() - TOLD_WITHIN_MS) },
    },
    columns: { id: true, advice: true },
    with: {
      animal: { columns: { tagNumber: true } },
      product: { columns: { nameBn: true, nameEn: true } },
    },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  if (recent.length === 0) {
    return [];
  }
  const told = await db.query.alert.findMany({
    where: {
      farmId,
      kind: "dose_not_prescribed",
      entityId: { in: recent.map((one) => one.id) },
    },
    columns: { entityId: true },
  });
  const said = new Set(told.map((one) => one.entityId));
  return recent
    .filter((one) => !said.has(one.id))
    .map((one) => ({
      id: one.id,
      tagNumber: one.animal.tagNumber,
      product: one.product.nameBn,
      productEn: one.product.nameEn,
      advice: one.advice ?? "",
    }));
};

/** Tells the Vet of each dose not prescribed. */
export const tellOfDoses = async (
  tx: Tx,
  farmId: string,
  untold: readonly DoseToTell[],
  now: Date
): Promise<Raised[]> => {
  const raised: Raised[] = [];
  const remembering = rememberingPeople();
  for (const one of untold) {
    // Sequential against one unique index, as the other notices are.
    // oxlint-disable-next-line no-await-in-loop
    const rows = await tell(
      tx,
      farmId,
      {
        kind: "dose_not_prescribed",
        about: { id: one.id },
        facts: {
          tag: one.tagNumber,
          product: one.product,
          productEn: one.productEn,
          advice: one.advice,
        },
      },
      now,
      remembering
    );
    raised.push(...rows);
  }
  return raised;
};
