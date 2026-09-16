import type { Database } from "@OpenFarm/db";
import { createDb } from "@OpenFarm/db";
import * as schema from "@OpenFarm/db/schema/auth";
import { env } from "@OpenFarm/env/server";
import { DEFAULT_LANGUAGE, isLanguage, translate } from "@OpenFarm/i18n";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";

/**
 * The door: somebody whose Membership has ended does not sign in.
 *
 * Every request they made would be refused anyway — the farm checks it on the way into each one — but being let
 * in and then refused everywhere is the farm failing to say what it means. They are told here, at the door, in
 * their own language: the farm knows which they read, and nobody has a session yet to read it from.
 *
 * Only that. A wrong password, an email the farm has never heard of, anything else: not this hook's business,
 * and Better Auth answers as it always did.
 */
const turnAwayWhoNoLongerWorksHere = (db: Database) =>
  createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/sign-in/email") {
      return;
    }
    const email = ctx.body?.email;
    if (typeof email !== "string") {
      return;
    }
    const person = await db.query.user.findFirst({
      where: { email: email.toLowerCase() },
      columns: { disabledAt: true, language: true },
    });
    if (!person?.disabledAt) {
      return;
    }
    const language = isLanguage(person.language)
      ? person.language
      : DEFAULT_LANGUAGE;
    throw new APIError("FORBIDDEN", {
      message: translate(language, "auth.noLongerHere"),
    });
  });

/** The farm's own auth. Given a database for a test to run it against a scratch one; the farm's otherwise. */
export const createAuth = (against?: Database) => {
  const db = against ?? createDb(env.DATABASE_URL);

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
    hooks: { before: turnAwayWhoNoLongerWorksHere(db) },
    plugins: [tanstackStartCookies()],
  });
};

export const auth = createAuth();
