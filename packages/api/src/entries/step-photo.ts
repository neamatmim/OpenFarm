import { completionPhoto } from "@OpenFarm/db/schema/instance";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { assertMayWork } from "../completion-store";
import { lateEntry } from "../late";
import { photoInput } from "../photo-input";
import type { EntryKind } from "./entry";

/** One photograph against the Evidence slot of the Step Completion it answers. */
export const stepPhotoInput = photoInput.extend({
  /** The Step Completion it answers, by the id it was recorded under. */
  completionId: z.string().trim().min(1),
  /** Which Evidence of the Step it answers. */
  slot: z.number().int().min(0),
});

export type StepPhotoInput = z.infer<typeof stepPhotoInput>;

/** Which slots of a Step Completion have a photograph, as the trail records it: never the image itself — a megabyte of
 *  base64 in an Audit Event would make the trail unreadable to the people who most need to read it. */
const readPhotos = async (tx: Tx, completionId: string) => {
  const rows = await tx.query.completionPhoto.findMany({
    where: { completionId },
    columns: { slot: true, contentType: true },
    orderBy: { slot: "asc" },
  });
  return { photos: rows };
};

/**
 * A photograph the Step asked for, arriving on its own after the Step it answers — so a morning's litres are never held
 * up behind a picture. The same slot sent again is the same picture, not a second one.
 */
export const stepPhotoEntry: EntryKind<
  StepPhotoInput,
  { completionId: string }
> = {
  roles: ["owner", "manager", "staff", "vet"],
  visitingVet: true,

  trail: (_context, input) => ({
    entity: "step_completion",
    action: "update",
    entityId: () => input.completionId,
    before: (tx) => readPhotos(tx, input.completionId),
    after: (tx) => readPhotos(tx, input.completionId),
  }),

  apply: async (tx, context, input, { receivedAt }) => {
    const completion = await tx.query.stepCompletion.findFirst({
      where: { id: input.completionId, farmId: context.farm.id },
      columns: { id: true, instanceId: true },
      with: {
        instance: {
          columns: {
            penId: true,
            assignedTo: true,
            claimedBy: true,
            assignedRole: true,
            animalId: true,
          },
        },
      },
    });
    if (!completion) {
      // The Step it belongs to has not arrived, or never will. The photo is not wrong; it is early or orphaned, and
      // either way somebody should see it rather than lose it.
      throw lateEntry("The entry this photo belongs to is not here");
    }
    if (!completion.instance) {
      throw new ORPCError("NOT_FOUND");
    }
    // A picture is part of the work, and answers to the same people the work does.
    assertMayWork(context, completion.instance);
    const values = {
      farmId: context.farm.id,
      contentType: input.contentType,
      data: input.data,
      createdAt: receivedAt,
    };
    await tx
      .insert(completionPhoto)
      .values({ completionId: input.completionId, slot: input.slot, ...values })
      .onConflictDoUpdate({
        target: [completionPhoto.completionId, completionPhoto.slot],
        set: values,
      });
    return { completionId: input.completionId };
  },
};
