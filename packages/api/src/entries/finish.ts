import { isFinished } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { assertMayWork } from "../completion-store";
import { animalsForInstance } from "../instances-store";
import { lateEntry } from "../late";
import { contentOf } from "../sop-content";
import {
  readWork,
  requireMayTransition,
  requireTransition,
} from "../work-transitions";
import type { WorkInput } from "./claim";
import type { EntryKind } from "./entry";

/**
 * Finishes a piece of work, dated when it was finished. Refused while any Step — or any animal within a per-animal Step
 * — is neither done nor skipped, which is a thing a phone can be wrong about: it finished on what it could see, and a
 * cow may have joined the Pen since. Work already finished, by this phone's earlier send or by somebody else, is left as
 * it is and nothing is written down.
 */
export const finishEntry: EntryKind<WorkInput, { changed: boolean }> = {
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
      with: { version: { columns: { content: true } }, completions: true },
    });
    if (!instance) {
      throw new ORPCError("NOT_FOUND");
    }
    assertMayWork(context, instance);
    if (isFinished(instance.state)) {
      return { changed: false };
    }
    requireMayTransition(instance, "finish");
    const content = contentOf(instance.version);
    const animals = await animalsForInstance(
      tx,
      context.farm.id,
      instance.penId,
      content,
      instance.animalId
    );
    const outstanding: string[] = [];
    for (const step of content.steps) {
      const done = instance.completions.filter(
        (completion) => completion.stepId === step.id
      );
      if (step.repeatPerAnimal) {
        const covered = new Set(done.map((completion) => completion.animalId));
        const missing = animals.filter((beast) => !covered.has(beast.id));
        if (missing.length > 0) {
          outstanding.push(
            `${step.id}: ${missing.map((beast) => beast.tagNumber).join(", ")}`
          );
        }
      } else if (done.length === 0) {
        outstanding.push(step.id);
      }
    }
    if (outstanding.length > 0) {
      // A phone finishing on what it could see is not a phone in the wrong; the Pen has changed under it, and somebody
      // should look.
      throw lateEntry(`Not finished yet — ${outstanding.join("; ")}`, {
        outstanding,
      });
    }
    await requireTransition(tx, instance, "finish", {
      set: { completedAt: doneAt },
    });
    return { changed: true };
  },

  unchanged: (result) => !result.changed,
};
