import type { EntryOutcome } from "@OpenFarm/db/schema/sync";
import { PHOTO_MAX_BYTES } from "@OpenFarm/domain";
import { z } from "zod";

const evidenceValue = z.union([z.boolean(), z.number(), z.string()]);

/** Every entry carries what the phone knew: its own id for the record, where in its own
 *  sequence the entry sits, and when it says the work happened. The server stamps when it
 *  took it, and the phone can never set that (ADR 0002). */
const entryBase = {
  id: z.string().min(1).max(64),
  seq: z.number().int().min(0),
  recordedAt: z.coerce.date(),
};

export const entryInput = z.discriminatedUnion("kind", [
  z.object({
    ...entryBase,
    kind: z.literal("instance_claim"),
    instanceId: z.string().trim().min(1),
  }),
  z.object({
    ...entryBase,
    kind: z.literal("instance_complete"),
    instanceId: z.string().trim().min(1),
  }),
  z.object({
    ...entryBase,
    kind: z.literal("step_completion"),
    instanceId: z.string(),
    stepId: z.string().trim().min(1),
    animalTag: z.string().trim().optional(),
    evidence: z.array(evidenceValue).default([]),
    destination: z.enum(["bulk", "calves", "discard"]).optional(),
    /** What a Step that feeds a Pen actually put out, per Feed Item. */
    feeding: z
      .array(
        z.object({
          feedItemId: z.string(),
          givenKg: z.number().min(0),
          leftoverKg: z.number().min(0).optional(),
        })
      )
      .optional(),
    outOfRange: z.string().trim().max(120).optional(),
    skipReason: z.string().trim().max(120).optional(),
    /** The Evidence slots this entry has photos for. The images themselves follow as their
     *  own entries, so a megabyte of photograph cannot hold up a morning's litres. */
    photoSlots: z.array(z.number().int().min(0)).max(8).optional(),
  }),
  z.object({
    ...entryBase,
    kind: z.literal("completion_photo"),
    /** The Step Completion this answers, by the id the phone gave it. */
    completionId: z.string().trim().min(1),
    /** Which Evidence of the Step it answers. */
    slot: z.number().int().min(0),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    data: z.string().min(1).max(PHOTO_MAX_BYTES),
  }),
  z.object({
    ...entryBase,
    kind: z.literal("animal_move"),
    tagNumber: z.string().trim().min(1).max(32),
    toPenId: z.string(),
    reason: z.string().trim().max(200).optional(),
  }),
  z.object({
    ...entryBase,
    kind: z.literal("observation"),
    tagNumber: z.string().trim().min(1).max(32),
    note: z.string().trim().max(2000),
  }),
]);

export type Entry = z.infer<typeof entryInput>;

export interface EntryResult {
  id: string;
  seq: number;
  outcome: EntryOutcome;
  /** Why it was held or refused, in words the client can show and keep. */
  reason?: string;
  /** True when the refusal was a question rather than a rule: the farm doubts the figure, and
   *  the person standing next to the animal may say it is right after all. */
  mayConfirm?: boolean;
}
