import { eq } from "@OpenFarm/db/operators";
import { animal, animalPhoto } from "@OpenFarm/db/schema/herd";
import { THUMB_MAX_BYTES, tagNumberAsWritten } from "@OpenFarm/domain";
import { z } from "zod";

import { readAnimal, requireAnimal } from "../herd-store";
import { lateEntry } from "../late";
import { photoInput } from "../photo-input";
import { requireAnimalInScope } from "../scope";
import type { EntryKind } from "./entry";
import { requireAnimalStillHere } from "./entry";

/** An animal's own photo: which animal, the picture downscaled on the phone, and the same picture small. */
export const animalPhotoInput = photoInput.extend({
  tagNumber: z.string().trim().min(1).max(32),
  /** The same photo small, a JPEG made on the device; a phone running an older build sends none. */
  thumb: z.string().min(1).max(THUMB_MAX_BYTES).optional(),
});

export type AnimalPhotoInput = z.infer<typeof animalPhotoInput>;

/**
 * The photo on an animal's page, taken by whoever handles her — on the tagging walk, often in a shed with no signal, so
 * it is held on the phone and sent when signal comes back (ADR 0002). Dated when it was taken. The trail says the
 * photo changed and when, never the image itself: a megabyte of base64 in an Audit Event would make the trail
 * unreadable to the people who most need to read it.
 */
export const animalPhotoEntry: EntryKind<
  AnimalPhotoInput,
  { animalId: string; tagNumber: string; photoUpdatedAt: Date }
> = {
  roles: ["owner", "manager", "staff"],
  visitingVet: false,

  trail: (context, input) => ({
    entity: "animal",
    action: "update",
    entityId: ({ animalId }) => animalId,
    before: async (tx) => {
      const her = await requireAnimal(
        tx,
        context.farm.id,
        tagNumberAsWritten(input.tagNumber)
      );
      return readAnimal(tx, her.id);
    },
    after: (tx, { animalId }) => readAnimal(tx, animalId),
  }),

  apply: async (tx, context, input, { doneAt, takenIn }) => {
    const beast = await requireAnimalStillHere(
      tx,
      context.farm.id,
      input.tagNumber
    );
    // Her photo is taken by whoever may handle her: Barn Staff in their own Pens.
    requireAnimalInScope(context.scope, beast);
    const kept = await tx.query.animalPhoto.findFirst({
      where: { animalId: beast.id },
      columns: { updatedAt: true },
    });
    // A photo somebody took after this one, with signal, is the newer picture of her. The older one is not put back
    // over it; it is held for a person, who may still take it in.
    if (!takenIn && kept && kept.updatedAt > doneAt) {
      throw lateEntry("A newer photo of her was taken after this one", {
        refusal: "newer_photo_kept",
      });
    }
    const values = {
      contentType: input.contentType,
      data: input.data,
      // A new photo without its own thumbnail drops the old one's, which would show the old animal.
      thumb: input.thumb ?? null,
      updatedAt: doneAt,
    };
    await tx
      .insert(animalPhoto)
      .values({ animalId: beast.id, farmId: context.farm.id, ...values })
      .onConflictDoUpdate({ target: animalPhoto.animalId, set: values });
    await tx
      .update(animal)
      .set({ photoUpdatedAt: doneAt, updatedAt: doneAt })
      .where(eq(animal.id, beast.id));
    return {
      animalId: beast.id,
      tagNumber: beast.tagNumber,
      photoUpdatedAt: doneAt,
    };
  },
};
