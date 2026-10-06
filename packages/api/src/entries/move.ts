import { SIDES } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { pregnancyTimesOf } from "../breeding-store";
import { targetWindowInput } from "../farm-clock";
import { readAnimal, requireAnimal, requirePen, walkTo } from "../herd-store";
import { requirePenInScope } from "../scope";
import type { EntryKind } from "./entry";
import { requireAnimalStillHere } from "./entry";

/** A Move as whoever walked her says it: which animal, to which Pen, and why if they said. */
export const moveInput = z.object({
  tagNumber: z.string().trim().min(1).max(32),
  toPenId: z.string(),
  /** The Side she lands on, when she is crossing: a bull calf walked to Fattening. Her own Side otherwise. */
  toSide: z.enum(SIDES).optional(),
  /** The Target Window a crossing to Fattening puts her on. Absent from a phone that queued the Move before it was
   *  asked, and on any other Move: then the next Eid stands in. */
  targetWindow: targetWindowInput.optional(),
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
    requirePenInScope(context.scope, beast.penId);
    requirePenInScope(context.scope, input.toPenId);
    await requirePen(tx, context.farm.id, input.toPenId);
    // Into the Pen she stands in, on the Side she is on, is no journey: written as one, it split her Pen spell in two.
    const staysPut =
      beast.penId === input.toPenId &&
      (input.toSide ?? beast.side) === beast.side;
    if (staysPut) {
      throw new ORPCError("BAD_REQUEST", {
        message: "She is already in that pen",
        data: { refusal: "already_in_that_pen" },
      });
    }
    await walkTo(tx, {
      farmId: context.farm.id,
      beast,
      toPenId: input.toPenId,
      toSide: input.toSide,
      targetWindow:
        input.toSide === "fattening" ? input.targetWindow : undefined,
      calvingLeadDays: pregnancyTimesOf(context.farm).calvingLeadDays,
      reason: input.reason || null,
      movedBy: context.actor.id,
      movedAt: doneAt,
      id,
      now: receivedAt,
      trail: audited(context).recordEvent,
    });
    return { animalId: beast.id };
  },
};
