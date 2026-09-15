import { isNull } from "@OpenFarm/db/operators";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { assertMayWork } from "../completion-store";
import { lateEntry } from "../late";
import { applyMove, readWork } from "../work-moves";
import type { EntryKind } from "./entry";

/** Which piece of work. */
export const workInput = z.object({ instanceId: z.string().trim().min(1) });

export type WorkInput = z.infer<typeof workInput>;

/**
 * Takes a piece of work for the person recording. Exclusive: only an unclaimed one can be claimed, so two phones cannot
 * both hold a shift — and who got it is settled by which claim reached the farm first, whatever either phone's clock
 * says. A phone that claimed with no signal and arrives to find someone else holding it has done nothing wrong: the
 * world moved while it was out of range, so it is late rather than refused.
 */
export const claimEntry: EntryKind<WorkInput, { changed: boolean }> = {
  roles: ["owner", "manager", "staff", "vet"],
  visitingVet: true,

  trail: (_context, input) => ({
    entity: "sop_instance",
    action: "update",
    entityId: () => input.instanceId,
    before: (tx) => readWork(tx, input.instanceId),
    after: (tx) => readWork(tx, input.instanceId),
  }),

  apply: async (tx, context, input, { doneAt }) => {
    const instance = await tx.query.sopInstance.findFirst({
      where: { id: input.instanceId, farmId: context.farm.id },
      columns: {
        penId: true,
        assignedTo: true,
        claimedBy: true,
        state: true,
        assignedRole: true,
        animalId: true,
      },
    });
    if (!instance) {
      throw new ORPCError("NOT_FOUND");
    }
    assertMayWork(context, instance);
    // Theirs already, by an earlier send: nothing to write down, whatever has happened to the work since.
    if (instance.claimedBy === context.actor.id) {
      return { changed: false };
    }
    const taken = await applyMove(
      tx,
      { id: input.instanceId, state: instance.state },
      "claim",
      {
        set: { claimedBy: context.actor.id, claimedAt: doneAt },
        onlyIf: isNull(sopInstance.claimedBy),
      }
    );
    if (!taken) {
      throw lateEntry("Someone else took this first");
    }
    return { changed: true };
  },

  unchanged: (result) => !result.changed,
};
