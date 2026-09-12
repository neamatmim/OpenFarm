import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    /** The farm's own push keys. Absent in development and in tests, where nothing is sent
     *  and the in-app Alert is the whole of it. */
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    /** Who the push service should complain to. */
    VAPID_SUBJECT: z.string().optional(),
    /** The farm's own SMS gateway, configured at go-live. Absent until then, and the farm
     *  sends no text messages — the in-app Alert is the record either way. The credentials are
     *  the Owner's, and the bill is the farm's. */
    SMS_GATEWAY_URL: z.string().optional(),
    SMS_GATEWAY_KEY: z.string().optional(),
    /** The sender id the provider registered for this farm, where one is needed. */
    SMS_GATEWAY_FROM: z.string().optional(),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
