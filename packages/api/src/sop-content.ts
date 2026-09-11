import { EVIDENCE_TYPES, ROLES } from "@OpenFarm/domain";
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

export const sopContentSchema = z.object({
  name: bilingual,
  purpose: bilingual,
  triggers: z.array(trigger),
  assignedRole: z.enum(ROLES),
  checkerRole: z.enum(ROLES).nullable().default(null),
  graceMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  steps: z.array(step),
});

/** The parsed content, as the domain sees it. */
export const asSopContent = (
  value: z.infer<typeof sopContentSchema>
): SopContent => value as SopContent;
