import { and, eq, isNull } from "@OpenFarm/db/operators";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { assertMayWork } from "../completion-store";
import { lateEntry } from "../late";
import type { EntryKind } from "./entry";

/** Which piece of work. */
export const workInput = z.object({ instanceId: z.string().trim().min(1) });

export type WorkInput = z.infer<typeof workInput>;

/** A piece of work as the trail records it either side of a claim or a finish: where it stands and whose it is. */
export const readWork = async (tx: Tx, instanceId: string) =>
  (await tx.query.sopInstance.findFirst({
    where: { id: instanceId },
    columns: {
      state: true,
      assignedTo: true,
      claimedBy: true,
      claimedAt: true,
      completedAt: true,
    },
  })) ?? null;

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
    const [taken] = await tx
      .update(sopInstance)
      .set({
        claimedBy: context.actor.id,
        claimedAt: doneAt,
        state: "in_progress",
      })
      .where(
        and(eq(sopInstance.id, input.instanceId), isNull(sopInstance.claimedBy))
      )
      .returning({ id: sopInstance.id });
    if (taken) {
      return { changed: true };
    }
    if (instance.claimedBy !== context.actor.id) {
      throw lateEntry("Someone else took this first");
    }
    // Theirs already, by an earlier send: nothing to write down.
    return { changed: false };
  },

  unchanged: (result) => !result.changed,
};
