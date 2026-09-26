import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    /** The Investor Portal's own address, `investors.<farm-domain>` (ADR 0009). Unset, the portal is at `/portal` on
     *  the farm's own address, as it was built. */
    PORTAL_URL: z.url().optional(),
    /** Vercel sends this as a bearer token when invoking its generated cron route. */
    CRON_SECRET: z.string().min(32).optional(),
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

if (
  env.NODE_ENV === "production" &&
  !env.BETTER_AUTH_URL.startsWith("https://")
) {
  throw new Error("BETTER_AUTH_URL must use HTTPS in production");
}

if (
  env.NODE_ENV === "production" &&
  env.PORTAL_URL &&
  !env.PORTAL_URL.startsWith("https://")
) {
  throw new Error("PORTAL_URL must use HTTPS in production");
}

if (env.PORTAL_URL) {
  const portal = new URL(env.PORTAL_URL);
  if (portal.host === new URL(env.BETTER_AUTH_URL).host) {
    throw new Error(
      "PORTAL_URL must be an address of its own, not the farm's BETTER_AUTH_URL"
    );
  }
  if (portal.pathname !== "/" || portal.search || portal.hash) {
    throw new Error(
      "PORTAL_URL must be the portal's bare address, such as https://investors.farm.example.com"
    );
  }
  // Better Auth adds these to every sign-in it runs, the portal's and the farm's alike, which would let each address
  // trust the other (ADR 0009).
  if (process.env.BETTER_AUTH_TRUSTED_ORIGINS) {
    throw new Error(
      "BETTER_AUTH_TRUSTED_ORIGINS must not be set while the portal has an address of its own"
    );
  }
}

if (env.NODE_ENV === "production" && process.env.VERCEL && !env.CRON_SECRET) {
  throw new Error(
    "CRON_SECRET is required for production deployments on Vercel"
  );
}
