import { PHOTO_MAX_BYTES } from "@OpenFarm/domain";
import { z } from "zod";

/** A photograph as a phone sends it: downscaled on the device, base64, in a format a browser shows. */
export const photoInput = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(1).max(PHOTO_MAX_BYTES),
});

export type PhotoInput = z.infer<typeof photoInput>;
