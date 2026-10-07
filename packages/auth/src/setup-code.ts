import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import type { Database } from "@OpenFarm/db";
import { setupCode } from "@OpenFarm/db/schema/auth";

/** Letters and digits nobody misreads off a terminal: no 0/O, 1/I/L, 5/S, 8/B, 2/Z. */
const ALPHABET = "34679ACDEFGHJKMNPQRTUVWXY";
/** Twelve of them, about 56 bits: past guessing at sign-up's rate, short enough to copy by hand. */
const LENGTH = 12;
const GROUP = 4;

/** The one row there ever is. */
const THE_CODE = "the-farm";

/** A fresh code, in groups of four to be read off a screen: `7KQM-WD3T-HXAC`. */
export const aSetupCode = (): string => {
  const letters = Array.from(
    { length: LENGTH },
    () => ALPHABET[randomInt(ALPHABET.length)]
  ).join("");
  return letters.match(new RegExp(`.{${GROUP}}`, "gu"))?.join("-") ?? letters;
};

/** A code as it is compared: case, spaces and dashes are the reader's, not the code's. */
const asTyped = (code: string) =>
  code.toUpperCase().replaceAll(/[^0-9A-Z]/gu, "");

export const hashOfSetupCode = (code: string): string =>
  createHash("sha256").update(asTyped(code)).digest("hex");

/** Whether what was typed is the code whose hash is kept. Nothing kept, nothing answers. */
export const setupCodeAnswers = (
  given: string | null | undefined,
  hash: string | undefined
): boolean => {
  if (!(given && hash)) {
    return false;
  }
  const typed = Buffer.from(hashOfSetupCode(given), "hex");
  const kept = Buffer.from(hash, "hex");
  return typed.length === kept.length && timingSafeEqual(typed, kept);
};

/** The kept code's hash, while the farm is still to be set up. */
export const theSetupCodeHash = async (
  db: Pick<Database, "query">
): Promise<string | undefined> => {
  const kept = await db.query.setupCode.findFirst({
    where: { id: THE_CODE },
    columns: { codeHash: true },
  });
  return kept?.codeHash;
};

/**
 * What a production server does as it starts: once the farm exists, forgets any code; before it does, makes one if
 * none is kept, and hands it back to be printed — once. A restart, or a second instance, finds it kept and prints
 * nothing, so the code first printed stays the one that works; delete the row to be given another.
 */
export const setUpCodeIfNoFarm = async (
  db: Pick<Database, "query" | "insert" | "delete">,
  now: Date
): Promise<string | null> => {
  const farm = await db.query.farm.findFirst({ columns: { id: true } });
  if (farm) {
    await db.delete(setupCode);
    return null;
  }
  const code = aSetupCode();
  const made = await db
    .insert(setupCode)
    .values({ id: THE_CODE, codeHash: hashOfSetupCode(code), madeAt: now })
    .onConflictDoNothing()
    .returning({ id: setupCode.id });
  return made.length > 0 ? code : null;
};
