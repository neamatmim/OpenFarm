import {
  ANIMAL_STATES,
  EVIDENCE_TYPES,
  MAX_GRACE_MINUTES,
  ROLES,
  SIDES,
  STEP_EFFECT_KINDS,
} from "@OpenFarm/domain";
import type { SopContent } from "@OpenFarm/domain";
import { z } from "zod";

/** What a Version says, read back out of the column it is stored in. The database column is
 *  jsonb, so every reader needs this one cast; having it in one place is what keeps the cast
 *  from being made differently in three of them. */
export const contentOf = (version: { content: unknown }): SopContent =>
  version.content as SopContent;

/**
 * What a Definition currently says, or nothing when it has published nothing yet.
 *
 * A Definition with no Version is a real row — the column is nullable, and the farm can hold one
 * — and `contentOf` is a cast, so reading through it lands on `undefined.triggers`. That has now
 * crashed two publish paths, so asking the question this way is the only way worth asking it.
 */
export const publishedContent = (definition: {
  currentVersion?: { content: unknown } | null;
}): SopContent | null =>
  definition.currentVersion ? contentOf(definition.currentVersion) : null;

/** Zod mirror of the domain's SopContent, so the wire is validated before the domain's
 *  publish rules run. Shape lives in @OpenFarm/domain; this is the boundary check. */
const bilingual = z.object({
  bn: z.string().trim().max(400),
  en: z.string().trim().max(400).optional(),
});

const evidence = z.object({
  type: z.enum(EVIDENCE_TYPES),
  required: z.boolean().default(true),
  unit: bilingual.optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  choices: z
    .array(
      z.object({ value: z.string().trim().min(1).max(40), label: bilingual })
    )
    .optional(),
});

const step = z.object({
  id: z.string().trim().min(1).max(60),
  text: bilingual,
  repeatPerAnimal: z.boolean().default(false),
  evidence: z.array(evidence),
  skipReasons: z.array(bilingual).default([]),
  /** What completing the Step writes into the farm's records beyond the Evidence itself. */
  effect: z
    .object({
      kind: z.enum(STEP_EFFECT_KINDS),
      /** Which product a campaign gives every animal in the Pen. */
      productId: z.string().trim().min(1).max(64).optional(),
    })
    .optional(),
});

const trigger = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("schedule"),
    times: z.array(z.string().trim()),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    everyOtherWeek: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("event"),
    event: z.string().trim().min(1).max(60),
    offsetDays: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal("state"),
    state: z.string().trim().min(1).max(60),
    offsetDays: z.number().int().optional(),
  }),
  z.object({ kind: z.literal("prescription") }),
  z.object({ kind: z.literal("notifiable_disease") }),
  z.object({
    kind: z.literal("before_calving"),
    lead: z.string().trim().min(1).max(40),
  }),
  z.object({ kind: z.literal("registration_renewal") }),
]);

/** Which animals the SOP concerns; absent means the whole herd. */
const appliesTo = z.object({
  side: z.enum(SIDES).optional(),
  states: z.array(z.enum(ANIMAL_STATES)).optional(),
});

export const sopContentSchema = z.object({
  name: bilingual,
  purpose: bilingual,
  triggers: z.array(trigger),
  appliesTo: appliesTo.optional(),
  assignedRole: z.enum(ROLES),
  checkerRole: z.enum(ROLES).nullable().default(null),
  graceMinutes: z.number().int().min(0).max(MAX_GRACE_MINUTES),
  steps: z.array(step),
});

/** The parsed content, as the domain sees it. */
export const asSopContent = (
  value: z.infer<typeof sopContentSchema>
): SopContent => value as SopContent;
