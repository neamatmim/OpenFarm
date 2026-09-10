import { createDb } from "@OpenFarm/db";
import * as schema from "@OpenFarm/db/schema/auth";
import { env } from "@OpenFarm/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

export const createAuth = () => {
  const db = createDb(env.DATABASE_URL);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema,
    }),
    user: {
      additionalFields: {
        language: {
          type: ["bn", "en"],
          required: false,
          defaultValue: "bn",
          input: true,
        },
      },
    },
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [tanstackStartCookies()],
  });
};

export const auth = createAuth();
