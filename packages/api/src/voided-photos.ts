import { uuidv7 } from "@OpenFarm/db/ids";
import type { VOIDED_PHOTO_FROM } from "@OpenFarm/db/schema/herd";
import { voidedPhoto } from "@OpenFarm/db/schema/herd";

import type { Tx } from "./audit";

/**
 * Keeps the photographs a record held before the Owner voids it: a Correction never takes a photograph away, and a
 * death's shows the tag of the animal that really died. Each kept under the animal it was taken of and the record it
 * came from, on the void's own transaction.
 */
export const keepWhatWasPhotographed = async (
  tx: Tx,
  {
    farmId,
    animalId,
    from,
    sourceId,
    photos,
    by,
    at,
  }: {
    farmId: string;
    animalId: string;
    from: (typeof VOIDED_PHOTO_FROM)[number];
    sourceId: string;
    photos: readonly { contentType: string; data: string; takenAt: Date }[];
    by: string;
    at: Date;
  }
): Promise<void> => {
  if (photos.length === 0) {
    return;
  }
  await tx.insert(voidedPhoto).values(
    photos.map((photo) => ({
      id: uuidv7(at),
      farmId,
      animalId,
      from,
      sourceId,
      contentType: photo.contentType,
      data: photo.data,
      takenAt: photo.takenAt,
      voidedBy: by,
      voidedAt: at,
    }))
  );
};
