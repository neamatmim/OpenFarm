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
    /** The Owner's address: before any Farm exists, the only one that may open an account and set the farm up. A
     *  production server without it lets nobody set up, rather than whoever finds the address first. */
    OPENFARM_OWNER_EMAIL: z.email().optional(),
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
    /** What the provider's answer says when it took the message: many local gateways answer 200 with an error inside, and
     *  with this set a text counts as sent only when the answer says so. Absent, a 2xx is taken at its word. */
    SMS_GATEWAY_SUCCESS: z.string().optional(),
    /** The outside watch's check-in address, pinged after each whole turn of the farm's day: a server down or an app
     *  dead stops the pings, and the watch tells the Owner (deploy runbook, "The outside watch"). Absent, nothing. */
    OPENFARM_WATCH_URL: z.url().optional(),
    /** Where the farm is (ADR 0013): the ISO 4217 code its money is counted in, the IANA time zone its own day is read
     *  on, the ISO 3166 country a phone number written without its country code is read in, and the month, 1 to 12,
     *  its financial year begins in (ADR 0016). Unset, a farm in Bangladesh — taka, Asia/Dhaka, BD, July. Fixed when
     *  the server is set up: changed afterwards, every sum, every day, every number and every year the farm already
     *  kept reads differently. */
    OPENFARM_CURRENCY: z.string().optional(),
    OPENFARM_TIME_ZONE: z.string().optional(),
    OPENFARM_COUNTRY: z.string().optional(),
    OPENFARM_YEAR_STARTS: z.string().optional(),
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
