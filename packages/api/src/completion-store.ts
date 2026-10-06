import type { SopContent, Step } from "@OpenFarm/domain";
import { maySkip, missingEvidence } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { Context } from "./context";
import { isOnTheFarm } from "./instances-store";
import { lateEntry } from "./late";
import { PERSONAL_PHONE_ONLY, forbidden } from "./roles";
import type { Scope } from "./scope";
import { requireWorkInScope } from "./scope";

/** The context a record needs: who is recording, on which Farm, under which Role. */
export type Recorder = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: NonNullable<Context["actor"]>;
};

/** The Step this Version declares, or nothing. */
export const stepOf = (content: SopContent, stepId: string): Step => {
  const step = content.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    throw new ORPCError("NOT_FOUND", {
      message: `No step ${stepId} in this version`,
    });
  }
  return step;
};

/** The animal a per-animal Step is being recorded against — refusing one from another Pen,
 *  one that has left the farm, an animal at all for a Step that runs once, and any but her for work about one animal:
 *  a dose Step recorded against the cow beside her would write the Treatment and its withdrawal on the wrong cow. */
export const resolveStepAnimal = async (
  tx: Tx,
  farmId: string,
  step: Step,
  work: {
    /** Null for work about the whole farm, whose animals stand wherever they stand. */
    penId: string | null;
    /** The animal the work is about, where it is about one. */
    animalId: string | null;
  },
  animalTag: string | undefined
): Promise<string | null> => {
  const instancePenId = work.penId;
  if (!step.repeatPerAnimal) {
    if (animalTag) {
      throw new ORPCError("BAD_REQUEST", {
        message: "This step is recorded once",
      });
    }
    return null;
  }
  if (!animalTag) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step is recorded per animal",
    });
  }
  const beast = await tx.query.animal.findFirst({
    where: { farmId, tagNumber: animalTag.toUpperCase() },
    columns: { id: true, penId: true, state: true },
  });
  // A tag the farm has never had is not a changed world; it is a wrong entry, and whoever
  // wrote it needs it back.
  if (!beast) {
    throw new ORPCError("NOT_FOUND", {
      message: `No animal with tag ${animalTag}`,
    });
  }
  if (work.animalId !== null && beast.id !== work.animalId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This work is about another animal",
      data: { refusal: "work_about_another_animal" },
    });
  }
  // An animal that has left keeps its Pen, so the Pen alone does not prove she is here —
  // and a Step that writes a farm record would otherwise book litres to a sold cow. Both of
  // these are the world moving under an entry that was true when it was written.
  // Work about her takes her whatever she has done since — gone, she is what her death's work is about.
  const aboutHer = work.animalId !== null && beast.id === work.animalId;
  if (
    !aboutHer &&
    ((instancePenId !== null && beast.penId !== instancePenId) ||
      !isOnTheFarm(beast))
  ) {
    throw lateEntry("That animal is not in this pen");
  }
  return beast.id;
};

/** An Instance a person may work: theirs by Pen, and pinned or claimed by nobody else. */
export const assertMayWork = (
  context: {
    scope: Scope;
    actor: { id: string };
    roles: string[];
    device: unknown;
  },
  instance: {
    penId: string | null;
    assignedTo: string | null;
    claimedBy: string | null;
    assignedRole: string;
    animalId: string | null;
  }
) => {
  // Work in their Scope: their Pens, work about an animal on their Cases, and work about the whole farm for anybody but
  // a visitor, who works only on the animals they were called in for.
  requireWorkInScope(context.scope, instance);
  // The Instance says who does this work; holding some other Role is not enough. The Owner
  // and the Manager may always step in — someone has to be able to unstick a shift.
  const runsTheFarm =
    context.roles.includes("owner") || context.roles.includes("manager");
  if (!(runsTheFarm || context.roles.includes(instance.assignedRole))) {
    throw new ORPCError("FORBIDDEN", {
      message: `This work is for ${instance.assignedRole}`,
    });
  }
  // A Vet's clinical work is signed on their own phone, never a shared one (ADR 0003).
  if (instance.assignedRole === "vet" && context.device) {
    throw forbidden(PERSONAL_PHONE_ONLY);
  }
  // Somebody else holding the work is not a question of permission: it is the world having
  // moved, which is exactly what happens to a phone that has been out of range. Marked as
  // such so a batch keeps the entry rather than handing it back.
  if (instance.assignedTo && instance.assignedTo !== context.actor.id) {
    throw lateEntry("This is pinned to someone else");
  }
  if (instance.claimedBy && instance.claimedBy !== context.actor.id) {
    throw lateEntry("Someone else is working on this");
  }
};

/** A Step is either skipped with a reason — only where a reason means something, and only one of the reasons the Step
 *  gives, there being nowhere to type another — or done with everything the Version marks required. Checked per slot,
 *  not by count: a Step with an optional note and a required number is not satisfied by filling only the note. A photo
 *  arrives as a Step photo of its own, so the Step says which slots it answers. */
export const assertEvidenceComplete = (
  step: Step,
  evidence: unknown[],
  /** Why it was skipped, or nothing for a Step done. */
  skipReason: string | null | undefined,
  /** Whether a photo answers that slot. A Step may ask for more than one, and a photo that
   *  could not say which it answered would be a photo nobody can read back. */
  hasPhotoAt: (slot: number) => boolean
): void => {
  if (skipReason) {
    if (!maySkip(step)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Only a per-animal step or a dose can be skipped",
      });
    }
    // A reason the Version never wrote would count her covered and mean nothing the farm acts on.
    const offered =
      step.skipReasons.length === 0 ||
      step.skipReasons.some((reason) => reason.bn === skipReason);
    if (!offered) {
      throw new ORPCError("BAD_REQUEST", {
        message: "That is not one of this step's reasons to skip",
        data: { refusal: "skip_reason_not_offered" },
      });
    }
    return;
  }
  const missing = missingEvidence(step, evidence, hasPhotoAt);
  if (missing.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step needs everything marked required",
      data: { missing },
    });
  }
};
