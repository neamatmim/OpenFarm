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
  effect: z.object({ kind: z.enum(STEP_EFFECT_KINDS) }).optional(),
});

const trigger = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("schedule"), times: z.array(z.string().trim()) }),
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
