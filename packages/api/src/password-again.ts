import { auth, passwordIsTheirs } from "@OpenFarm/auth";
import {
  GUESSES_BEFORE_SLOWING,
  ONE_TRY_EVERY_MS,
  countTheGuess,
  guessesOf,
} from "@OpenFarm/auth/guesses";
import { passwordGiven } from "@OpenFarm/db/schema/auth";
import { os } from "@orpc/server";

import { refused } from "./agreeing-in-app";
import type { Context } from "./context";

/**
 * How long a password given counts for (the Owner, 2026-10-07): an act that pays money out, approves money, opens the
 * portal or copies an Investor's data asks for it again once this has passed since it was last given. A laptop left
 * open in the office is a session; it is not the Owner.
 */
export const PASSWORD_GIVEN_FOR_MS = 15 * 60_000;

/** When this session's person last gave their password: signing in, or giving it again since. */
const lastGiven = async (
  context: Context,
  session: NonNullable<Context["session"]>["session"]
): Promise<Date> => {
  const again = await context.db.query.passwordGiven.findFirst({
    where: { sessionId: session.id },
  });
  const signedIn = new Date(session.createdAt);
  return again && again.givenAt > signedIn ? again.givenAt : signedIn;
};

/**
 * Refuses an act that moves money out or reaches an Investor's data when the password was not given in the last
 * quarter hour. The page asks for it and sends the act again; nothing is done until it is given.
 */
export const assertPasswordGiven = async (context: Context): Promise<void> => {
  const { session } = context;
  if (!session) {
    throw refused(
      "Only a person signed in with a password may do this",
      "password_needed"
    );
  }
  const given = await lastGiven(context, session.session);
  if (context.clock.now().getTime() - given.getTime() > PASSWORD_GIVEN_FOR_MS) {
    throw refused(
      "Give your password again: this asks for it once a quarter of an hour",
      "password_needed"
    );
  }
};

/** The same, before the act's own work begins. */
export const requirePasswordGiven = () =>
  os.$context<Context>().middleware(async ({ context, next }) => {
    await assertPasswordGiven(context);
    return next();
  });

/**
 * Takes the signed-in person's password again. Wrong ones count against the account as at signing in — five within
 * the hour and it takes one try a minute, and the Owner is told — so this is no second door for guessing.
 */
export const givePassword = async (
  context: Context,
  password: string
): Promise<void> => {
  const { session, db } = context;
  if (!session) {
    throw refused("Nobody is signed in", "password_needed");
  }
  const now = context.clock.now();
  const login = session.user.email.trim().toLowerCase();
  const recent = await guessesOf(db, login, now);
  const newest = recent[0]?.guessedAt;
  if (
    recent.length >= GUESSES_BEFORE_SLOWING &&
    newest &&
    now.getTime() - newest.getTime() < ONE_TRY_EVERY_MS
  ) {
    throw refused(
      "Too many wrong passwords: wait a minute and try again",
      "account_slowed"
    );
  }
  const right = await passwordIsTheirs(auth, session.user.id, password);
  await countTheGuess(db, login, right, now);
  if (!right) {
    throw refused("That is not your password", "password_wrong");
  }
  await db
    .insert(passwordGiven)
    .values({ sessionId: session.session.id, givenAt: now })
    .onConflictDoUpdate({
      target: passwordGiven.sessionId,
      set: { givenAt: now },
    });
};
