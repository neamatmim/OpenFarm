import { observation } from "@OpenFarm/db/schema/observation";
import {
  GIVING_LESS,
  MILK_USUAL_DAYS,
  OBSERVATION_WORD_NEEDING_A_NOTE,
  addDays,
  farmDayOf,
  observationWordOf,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { requireAnimalInScope } from "../scope";
import type { EntryKind } from "./entry";
import { requireAnimalStillHere } from "./entry";

/** What somebody reports seeing, with no round asking: which animal, what, and in their own words if they add any. */
export const observationInput = z.object({
  tagNumber: z.string().trim().min(1).max(32),
  saw: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional(),
});

export type ObservationInput = z.infer<typeof observationInput>;

/**
 * "Giving less milk" asked of a cow, as the farm allows it: only of a cow in milk, and once while it stands — a second
 * request about the same cow, the first not withdrawn nor answered by the Vet, within the days her drop is read over, is
 * the same request again.
 */
const askedOnce = async (
  tx: Tx,
  farm: { id: string; milkDropDays: number },
  beast: { id: string; state: string },
  now: Date
) => {
  if (beast.state !== "milking") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only a cow in milk can be giving less milk",
      data: { refusal: "not_in_milk" },
    });
  }
  const since = startOfFarmDay(
    addDays(farmDayOf(now), -(farm.milkDropDays + MILK_USUAL_DAYS))
  );
  const standing = await tx.query.observation.findMany({
    where: {
      farmId: farm.id,
      animalId: beast.id,
      saw: GIVING_LESS,
      seenAt: { gte: since },
      withdrawnAt: { isNull: true },
    },
    columns: { id: true },
  });
  if (standing.length === 0) {
    return;
  }
  const answered = await tx.query.diagnosis.findMany({
    where: {
      farmId: farm.id,
      observationId: { in: standing.map((one) => one.id) },
    },
    columns: { observationId: true },
  });
  if (answered.length < standing.length) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The vet has already been asked about her",
      data: { refusal: "vet_asked_already" },
    });
  }
};

/**
 * An Observation nobody's round asked for. Anybody who handles the animals may make one — Barn Staff on the animals in
 * their own Pens, a visiting Vet on the animals on their cases — and what is seen goes to the Vet's inbox and, for a
 * heat, begins the breeding work, exactly as an Observation on the round does.
 */
export const observationEntry: EntryKind<
  ObservationInput,
  { id: string; animalId: string }
> = {
  roles: ["owner", "manager", "staff", "vet"],
  visitingVet: true,

  trail: () => ({
    entity: "observation",
    action: "create",
    entityId: ({ id }) => id,
    // What the farm now holds of it — the word as the farm keeps it, whose it is and when it was seen — rather than what
    // the phone typed.
    after: async (tx, { id }) =>
      (await tx.query.observation.findFirst({
        where: { id },
        columns: {
          animalId: true,
          saw: true,
          sawLabel: true,
          note: true,
          seenBy: true,
          seenAt: true,
        },
      })) ?? null,
  }),

  apply: async (tx, context, input, { id, doneAt, receivedAt }) => {
    const seen = observationWordOf(input.saw);
    if (!seen) {
      throw new ORPCError("BAD_REQUEST", {
        message: `"${input.saw}" is not something the farm records seeing`,
        data: { refusal: "not_a_sighting_word" },
      });
    }
    const note = input.note?.trim() || null;
    if (seen.value === OBSERVATION_WORD_NEEDING_A_NOTE && !note) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Say what was seen",
        data: { refusal: "say_what_was_seen" },
      });
    }
    const beast = await requireAnimalStillHere(
      tx,
      context.farm.id,
      input.tagNumber
    );
    // What they see of an animal is theirs to write down when she is in their Pens or on their Cases.
    requireAnimalInScope(context.scope, beast);
    if (seen.value === GIVING_LESS) {
      await askedOnce(tx, context.farm, beast, receivedAt);
    }
    await tx.insert(observation).values({
      id,
      farmId: context.farm.id,
      animalId: beast.id,
      completionId: null,
      saw: seen.value,
      sawLabel: seen.bn,
      note,
      seenBy: context.actor.id,
      // When it was seen is when it was written down; when the farm heard of it is kept beside.
      seenAt: doneAt,
      recordedAt: receivedAt,
    });
    return { id, animalId: beast.id };
  },
};
