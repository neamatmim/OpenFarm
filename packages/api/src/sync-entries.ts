import type { EntryOutcome } from "@OpenFarm/db/schema/sync";
import { z } from "zod";

const evidenceValue = z.union([z.boolean(), z.number(), z.string()]);

/** 1.5 MB of image becomes 2,000,000 base64 characters. */
const PHOTO_MAX_BYTES = 2_000_000;

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
    instanceId: z.string(),
  }),
  z.object({
    ...entryBase,
    kind: z.literal("instance_complete"),
    instanceId: z.string(),
  }),
  z.object({
    ...entryBase,
    kind: z.literal("step_completion"),
    instanceId: z.string(),
    stepId: z.string().trim().min(1),
    animalTag: z.string().trim().optional(),
    evidence: z.array(evidenceValue).default([]),
    destination: z.enum(["bulk", "calves", "discard"]).optional(),
    outOfRange: z.string().trim().max(120).optional(),
    skipReason: z.string().trim().max(120).optional(),
    /** A photo taken in the shed, carried in the entry it is evidence for: it was recorded
     *  with no signal, and it has to travel with what it proves. */
    photo: z
      .object({
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        data: z.string().min(1).max(PHOTO_MAX_BYTES),
      })
      .optional(),
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
}
