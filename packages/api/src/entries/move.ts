import { and, desc, eq, gt } from "@OpenFarm/db/operators";
import { animalMove } from "@OpenFarm/db/schema/herd";
import { isExitState } from "@OpenFarm/domain";
import { z } from "zod";

import { lateEntry } from "../completion-store";
import {
  assertPenIsTheirs,
  readAnimal,
  recordMove,
  requireAnimal,
  requirePen,
} from "../herd-store";
import type { EntryKind } from "./entry";

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

  trail: (context, input) => {
    let animalId = "";
    const her = async (tx: Parameters<typeof readAnimal>[0]) => {
      if (!animalId) {
        const found = await requireAnimal(
          tx,
          context.farm.id,
          input.tagNumber.toUpperCase()
        );
        animalId = found.id;
      }
      return readAnimal(tx, animalId);
    };
    return {
      entity: "animal",
      entityId: () => animalId,
      action: "update",
      before: her,
      after: her,
      reason: input.reason || undefined,
    };
  },

  apply: async (tx, context, input, { doneAt, receivedAt, id }) => {
    const beast = await requireAnimal(
      tx,
      context.farm.id,
      input.tagNumber.toUpperCase()
    );
    // Both are the world moving under a Move that was true when it was made: she was sold, or somebody walked her
    // somewhere else after it. Neither is the walker's to fix, so a phone's Batch keeps it for the Manager.
    if (isExitState(beast.state)) {
      throw lateEntry(
        `Animal ${beast.tagNumber} has left the farm (${beast.state})`
      );
    }
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
