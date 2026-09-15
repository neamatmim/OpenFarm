import { SIDES } from "@OpenFarm/domain";
import { z } from "zod";

import { pregnancyTimesOf } from "../breeding-store";
import {
  assertPenIsTheirs,
  readAnimal,
  requireAnimal,
  requirePen,
  walkTo,
} from "../herd-store";
import type { EntryKind } from "./entry";
import { requireAnimalStillHere } from "./entry";

/** A Move as whoever walked her says it: which animal, to which Pen, and why if they said. */
export const moveInput = z.object({
  tagNumber: z.string().trim().min(1).max(32),
  toPenId: z.string(),
  /** The Side she lands on, when she is crossing: a bull calf walked to Fattening. Her own Side otherwise. */
  toSide: z.enum(SIDES).optional(),
  /** Blank is no reason: a phone that queued a space has said nothing, and a Batch is not refused whole for it. */
  reason: z.string().trim().max(200).optional(),
});

export type MoveInput = z.infer<typeof moveInput>;

/**
 * An animal walked to another Pen — the only way her location changes, across to the other Side included. Owner's,
 * Manager's and Barn Staff's (roles matrix, "Move (pen / side)"), and a Staff member's only between their own Pens.
 */
export const moveEntry: EntryKind<MoveInput, { animalId: string }> = {
  roles: ["owner", "manager", "staff"],
  visitingVet: false,

  trail: (context, input) => ({
    entity: "animal",
    action: "update",
    reason: input.reason || undefined,
    entityId: ({ animalId }) => animalId,
    before: async (tx) => {
      const her = await requireAnimal(
        tx,
        context.farm.id,
        input.tagNumber.toUpperCase()
      );
      return readAnimal(tx, her.id);
    },
    after: (tx, { animalId }) => readAnimal(tx, animalId),
  }),

  apply: async (tx, context, input, { doneAt, receivedAt, id }) => {
    // She was sold, or somebody walked her somewhere else after this Move was made (which the herd itself refuses): both
    // are the world moving under it, and neither is the walker's to fix, so a phone's Batch keeps it for the Manager.
    const beast = await requireAnimalStillHere(
      tx,
      context.farm.id,
      input.tagNumber
    );
    assertPenIsTheirs(context, beast.penId);
    assertPenIsTheirs(context, input.toPenId);
    await requirePen(tx, context.farm.id, input.toPenId);
    await walkTo(tx, {
      farmId: context.farm.id,
      beast,
      toPenId: input.toPenId,
      toSide: input.toSide,
      calvingLeadDays: pregnancyTimesOf(context.farm).calvingLeadDays,
      reason: input.reason || null,
      movedBy: context.actor.id,
      movedAt: doneAt,
      id,
      now: receivedAt,
    });
    return { animalId: beast.id };
  },
};
