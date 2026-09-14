import { and, desc, eq, gt } from "@OpenFarm/db/operators";
import { animalMove } from "@OpenFarm/db/schema/herd";
import { z } from "zod";

import {
  assertPenIsTheirs,
  readAnimal,
  recordMove,
  requireAnimal,
  requirePen,
} from "../herd-store";
import type { EntryKind } from "./entry";
import { lateEntry, requireAnimalStillHere } from "./entry";

/** A Move as whoever walked her says it: which animal, to which Pen, and why if they said. */
export const moveInput = z.object({
  tagNumber: z.string().trim().min(1).max(32),
  toPenId: z.string(),
  /** Blank is no reason: a phone that queued a space has said nothing, and a Batch is not refused whole for it. */
  reason: z.string().trim().max(200).optional(),
});

export type MoveInput = z.infer<typeof moveInput>;

/**
 * An animal walked to another Pen within her Side — the only way her location changes. Owner's, Manager's and Barn
 * Staff's (roles matrix), and a Staff member's only between their own Pens.
 */
export const moveEntry: EntryKind<MoveInput, { animalId: string }> = {
  roles: ["owner", "manager", "staff"],

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
    // She was sold, or somebody walked her somewhere else after this Move was made: both are the world moving under it,
    // and neither is the walker's to fix, so a phone's Batch keeps it for the Manager.
    const beast = await requireAnimalStillHere(
      tx,
      context.farm.id,
      input.tagNumber
    );
    const [since] = await tx
      .select({ id: animalMove.id })
      .from(animalMove)
      .where(
        and(eq(animalMove.animalId, beast.id), gt(animalMove.movedAt, doneAt))
      )
      .orderBy(desc(animalMove.movedAt))
      .limit(1);
    if (since) {
      throw lateEntry(`Animal ${beast.tagNumber} has been moved since`);
    }
    assertPenIsTheirs(context, beast.penId);
    assertPenIsTheirs(context, input.toPenId);
    await requirePen(tx, context.farm.id, input.toPenId);
    await recordMove(tx, {
      farmId: context.farm.id,
      beast,
      toPenId: input.toPenId,
      reason: input.reason || null,
      movedBy: context.actor.id,
      movedAt: doneAt,
      id,
      now: receivedAt,
    });
    return { animalId: beast.id };
  },
};
