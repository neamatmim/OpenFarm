import { randomUUID } from "node:crypto";

import type { Database } from "@OpenFarm/db";
import { eq, lt } from "@OpenFarm/db/operators";
import { passwordGuess } from "@OpenFarm/db/schema/auth";
import { DEFAULT_LANGUAGE, isLanguage, translate } from "@OpenFarm/i18n";
import { APIError } from "better-auth/api";

/** Wrong passwords within the hour before an account is slowed. */
export const GUESSES_BEFORE_SLOWING = 5;
/** How far back wrong passwords are counted. */
export const GUESS_WINDOW_MS = 60 * 60_000;
/** How long a wrong password is kept: long enough to tell one run of guessing — guesses never an hour apart — from the
 *  next, so the Owner is told of a run once rather than every few minutes while it goes on. */
export const GUESSES_KEPT_MS = 24 * 60 * 60_000;
/** A slowed account takes one try in this long. */
export const ONE_TRY_EVERY_MS = 60_000;

/** Somebody's sign-in address as it is counted: as typed, lowercased and trimmed. */
export const loginOf = (body: unknown): string =>
  String((body as { email?: unknown } | null)?.email ?? "")
    .trim()
    .toLowerCase();

/** The reader's language, from the page's own cookie: the account's would tell a stranger it exists. */
const LANGUAGE_IN_COOKIE = /(?:^|;\s*)openfarm\.language=(?<language>[a-z]+)/u;

const languageOf = (headers: Headers | undefined) => {
  const said = headers?.get("cookie")?.match(LANGUAGE_IN_COOKIE)
    ?.groups?.language;
  return isLanguage(said) ? said : DEFAULT_LANGUAGE;
};

/** The wrong passwords for one login within the hour, newest first. */
export const guessesOf = (
  db: Pick<Database, "query">,
  login: string,
  now: Date
) =>
  db.query.passwordGuess.findMany({
    where: {
      login,
      guessedAt: { gt: new Date(now.getTime() - GUESS_WINDOW_MS) },
    },
    columns: { guessedAt: true },
    orderBy: { guessedAt: "desc", id: "desc" },
  });

/**
 * Refuses a sign-in to a slowed account until a minute has passed since its last wrong password, whatever address it
 * comes from — the right password included, so a guesser learns nothing from which try is refused. The person who owns
 * it waits a minute and gets in.
 */
export const refuseWhileSlowed = async (
  db: Pick<Database, "query">,
  login: string,
  headers: Headers | undefined,
  now: Date
): Promise<void> => {
  if (login === "") {
    return;
  }
  const recent = await guessesOf(db, login, now);
  const newest = recent[0]?.guessedAt;
  if (
    recent.length >= GUESSES_BEFORE_SLOWING &&
    newest &&
    now.getTime() - newest.getTime() < ONE_TRY_EVERY_MS
  ) {
    throw new APIError("TOO_MANY_REQUESTS", {
      code: "ACCOUNT_SLOWED",
      message: translate(languageOf(headers), "auth.accountSlowed"),
    });
  }
};

/** Counts a wrong password against its login, or clears the count once the right one is given. */
export const countTheGuess = async (
  db: Pick<Database, "insert" | "delete">,
  login: string,
  right: boolean,
  now: Date
): Promise<void> => {
  if (login === "") {
    return;
  }
  if (right) {
    await db.delete(passwordGuess).where(eq(passwordGuess.login, login));
    return;
  }
  await db
    .insert(passwordGuess)
    .values({ id: randomUUID(), login, guessedAt: now });
  // And forgets what the day has passed, which nothing reads again: the count that slows an account stays the hour's.
  await db
    .delete(passwordGuess)
    .where(
      lt(passwordGuess.guessedAt, new Date(now.getTime() - GUESSES_KEPT_MS))
    );
};
