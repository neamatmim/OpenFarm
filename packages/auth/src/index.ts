import { AsyncLocalStorage } from "node:async_hooks";

import type { Database } from "@OpenFarm/db";
import { createDb } from "@OpenFarm/db";
import * as schema from "@OpenFarm/db/schema/auth";
import { env } from "@OpenFarm/env/server";
import { DEFAULT_LANGUAGE, isLanguage, translate } from "@OpenFarm/i18n";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { isCommonPassword } from "./common-passwords";
import { PASSWORD_MIN_LENGTH } from "./password";

/**
 * The other half of the door: an account is opened by somebody the farm is waiting for, and by nobody else.
 *
 * The farm takes other people's money. A stranger who opens an account here gets nothing — no Role, no Farm,
 * nothing to look at — but the door standing open is the thing itself, not what comes through it: a farm that
 * accepts investment and lets the public sign up is describable as a platform, and that is a question nobody
 * wants asked. So the account is made only where the farm has already said whose it will be.
 *
 * Two ways in, and no third. Before any Farm exists, whoever is setting the farm up opens the first account —
 * there is nobody yet to invite them. Afterwards, an account is opened only against an invite the Owner or a
 * Manager wrote for that address, and only while it is still open; the code they were handed separately is
 * what then takes it up, so this is a narrower door than the invite, not a way around it.
 */
const turnAwayWhoWasNotAsked = (db: Database) =>
  createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/sign-up/email") {
      return;
    }
    const email = ctx.body?.email;
    if (typeof email !== "string") {
      return;
    }
    // An Investor's portal account is opened by the farm, from their invitation, and never by signing up: the
    // address is made from their phone, so anybody who knew the number could otherwise take it first (ADR 0007).
    const anInvestors = await db.query.investorAccess.findFirst({
      where: { loginEmail: email.toLowerCase() },
      columns: { id: true },
    });
    if (anInvestors) {
      throw new APIError("FORBIDDEN", {
        message: translate(DEFAULT_LANGUAGE, "auth.notInvited"),
      });
    }
    const theFarm = await db.query.farm.findFirst({ columns: { id: true } });
    if (!theFarm) {
      // Nobody has set the farm up yet, so there is nobody who could have invited them.
      return;
    }
    // By the address alone, not by which Farm the invite is on: one database holds one farm, and the address
    // is what the invite was written against.
    const asked = await db.query.invite.findFirst({
      where: {
        email: email.toLowerCase(),
        status: { in: ["pending", "approved"] },
        acceptedAt: { isNull: true },
      },
      columns: { id: true },
    });
    if (asked) {
      return;
    }
    // Said in Bangla because nobody here has an account to have chosen a language on.
    throw new APIError("FORBIDDEN", {
      message: translate(DEFAULT_LANGUAGE, "auth.notInvited"),
    });
  });

/**
 * The door: somebody whose Membership has ended does not sign in, and nor does an Investor while the portal is shut
 * or their access is taken away (ADR 0007).
 *
 * Asked only once the password is right. Asked before, it answered a stranger who typed any password at all — "this
 * one is an Investor's", "that one used to work here" — which is the farm telling anybody with a list of phone numbers
 * who has money in its Ventures. So a wrong password gets Better Auth's own answer whoever the address is, and only
 * the person themselves is told why the door stays shut, in their own language; the sign-in Better Auth just made for
 * them is undone before they are.
 */
const turnAwayWhoNoLongerWorksHere = (db: Database) =>
  createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/sign-in/email") {
      return;
    }
    const made = ctx.context.newSession;
    if (!made) {
      return;
    }
    const email = made.user.email.toLowerCase();
    const person = await db.query.user.findFirst({
      where: { email },
      columns: { disabledAt: true, language: true },
    });
    const language = isLanguage(person?.language)
      ? person.language
      : DEFAULT_LANGUAGE;
    const why = await whyShut(db, email, Boolean(person?.disabledAt));
    if (!why) {
      return;
    }
    deleteSessionCookie(ctx, true);
    await ctx.context.internalAdapter.deleteSession(made.session.token);
    ctx.context.setNewSession(null);
    throw new APIError("FORBIDDEN", { message: translate(language, why) });
  });

/** Why the door stays shut for this address, or nothing when it opens. */
const whyShut = async (
  db: Database,
  email: string,
  disabled: boolean
): Promise<"portal.closed" | "auth.noLongerHere" | null> => {
  // An Investor comes in only while the farm has its portal open and their access stands (ADR 0007).
  const access = await db.query.investorAccess.findFirst({
    where: { loginEmail: email },
    columns: { farmId: true, revokedAt: true },
  });
  if (access) {
    // Their own farm's portal, asked of that farm: whether it is open is the farm's to say.
    const theFarm = await db.query.farm.findFirst({
      where: { id: access.farmId },
      columns: { investorPortal: true },
    });
    return !theFarm?.investorPortal || access.revokedAt || disabled
      ? "portal.closed"
      : null;
  }
  return disabled ? "auth.noLongerHere" : null;
};

/**
 * A password everybody else uses is no secret (ASVS 6.2.4): refused wherever somebody chooses one through Better Auth
 * — changing it while signed in, or setting it with a reset — whatever path led there. The farm's own procedures that
 * set a password refuse it first, in their own words; this is the door nothing gets round.
 */
const turnAwayCommonPasswords = () =>
  createAuthMiddleware((ctx) => {
    if (ctx.path !== "/change-password" && ctx.path !== "/reset-password") {
      return Promise.resolve();
    }
    const chosen = ctx.body?.newPassword;
    if (typeof chosen === "string" && isCommonPassword(chosen)) {
      throw new APIError("BAD_REQUEST", {
        code: "PASSWORD_TOO_COMMON",
        message: translate(DEFAULT_LANGUAGE, "auth.passwordTooCommon"),
      });
    }
    return Promise.resolve();
  });

/**
 * The door, its questions asked before anything is done: who may open an account, and what may be a password. Who
 * may still come in is asked after, once the password is right (`turnAwayWhoNoLongerWorksHere`).
 *
 * One hook because Better Auth takes one, and each question answers for its own path and leaves every other
 * request alone.
 */
const theDoor = (db: Database) => {
  const signingUp = turnAwayWhoWasNotAsked(db);
  const choosing = turnAwayCommonPasswords();
  return createAuthMiddleware(async (ctx) => {
    await signingUp(ctx);
    await choosing(ctx);
  });
};

/**
 * Where a reset token is caught on its way out.
 *
 * Better Auth mints the token and hands it to whoever would send it, which for most farms is an email. This
 * one has no email it can rely on reaching a milker, so the token is caught here instead and spent in the same
 * request that asked for it — it is never written down, never sent, and never leaves the server.
 */
const catching = new AsyncLocalStorage<{ token?: string }>();

const asHttpsOrigin = (hostname: string | undefined): string | null =>
  hostname ? `https://${hostname}` : null;

const previewOrigin =
  process.env.VERCEL_ENV === "preview"
    ? asHttpsOrigin(process.env.VERCEL_URL)
    : null;

const trustedOrigins = [
  env.BETTER_AUTH_URL,
  previewOrigin,
  process.env.VERCEL_ENV === "preview"
    ? asHttpsOrigin(process.env.VERCEL_BRANCH_URL)
    : null,
].filter((origin): origin is string => origin !== null);

const authBaseUrl = previewOrigin ?? env.BETTER_AUTH_URL;

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
    trustedOrigins,
    rateLimit: {
      // One farm runs one app process. Pin the limiter on in every environment so a
      // production-mode mistake cannot silently turn brute-force protection off.
      enabled: true,
      // Vercel and multi-process Node deployments do not share memory. Keeping
      // counters in PostgreSQL makes the limit apply to the deployment, not one
      // warm process.
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        // Every screen asks whether its person is still signed in, and the phones on the farm's Wi-Fi share one
        // address: counting those questions locked the shed out on a busy morning. They guess nothing.
        "/get-session": false,
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 3 },
        // Guessing somebody's current password from a phone they left signed in is guessing a password.
        "/change-password": { window: 60, max: 5 },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 15 * 60,
      // A password set in the shed is a good moment to turn out whoever is still signed in as them.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ token }) => {
        const caught = catching.getStore();
        if (caught) {
          caught.token = token;
        }
        // Nobody waiting for it is nobody asking: the farm does not email these, so there is nothing to send.
        return Promise.resolve();
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: authBaseUrl,
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 60 * 60,
    },
    advanced: {
      // Local HTTP remains usable in development; production cookies are never sent
      // over plaintext even if a reverse proxy is misconfigured.
      useSecureCookies: env.NODE_ENV === "production",
    },
    hooks: {
      before: theDoor(db),
      after: turnAwayWhoNoLongerWorksHere(db),
    },
    plugins: [tanstackStartCookies()],
  });
};

export const auth = createAuth();

/**
 * Sets somebody's password when they cannot sign in to change it themselves — the farm having handed them a
 * one-time code and taken it back off them.
 *
 * Better Auth does the whole of it: minting the token, checking it, hashing the password, and turning out the
 * sessions that were signed in as them. Nothing here holds a password, and nothing here hashes one.
 */
export const setPasswordFor = async (
  which: ReturnType<typeof createAuth>,
  email: string,
  newPassword: string
): Promise<boolean> => {
  const caught: { token?: string } = {};
  await catching.run(caught, () =>
    which.api.requestPasswordReset({ body: { email } })
  );
  const { token } = caught;
  if (!token) {
    return false;
  }
  await which.api.resetPassword({ body: { token, newPassword } });
  return true;
};

/**
 * Opens an Investor's portal account, from the farm's own taking-up of their invitation (ADR 0007): the account, and
 * the password they chose for it. Not by signing up — the door refuses an Investor's address there — so nobody can
 * open it but the farm, and only once the code the Owner handed over has been checked.
 *
 * Better Auth hashes the password, as it does every other; nothing here holds one longer than the call.
 */
export const openInvestorAccount = async (
  which: ReturnType<typeof createAuth>,
  { email, name, password }: { email: string; name: string; password: string }
): Promise<string> => {
  const context = await which.$context;
  const hash = await context.password.hash(password);
  const person = await context.internalAdapter.createUser(
    { email: email.toLowerCase(), name, emailVerified: false },
    { method: "email-password" }
  );
  await context.internalAdapter.linkAccount({
    userId: person.id,
    providerId: "credential",
    accountId: person.id,
    password: hash,
  });
  return person.id;
};
