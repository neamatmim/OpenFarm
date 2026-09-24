import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { breed } from "@OpenFarm/db/schema/herd";
import type { StandardBreedKey } from "@OpenFarm/domain";
import { STANDARD_BREED_KEYS, STANDARD_BREEDS } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";

/** A breed's two names, lower-cased, the way two spellings of it are compared. */
const namesOf = (one: { nameBn: string; nameEn: string | null }) =>
  [one.nameBn, one.nameEn]
    .filter((name): name is string => Boolean(name))
    .map((name) => name.trim().toLowerCase());

/** A refusal about the list, worded on the screen by its word. */
export const refusedBreed = (message: string, refusal: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

/** The standard breeds the farm has not been given. */
export const missingStandardBreeds = async (
  db: Pick<Tx, "query">,
  farmId: string
): Promise<StandardBreedKey[]> => {
  const have = await db.query.breed.findMany({
    where: { farmId, key: { isNotNull: true } },
    columns: { key: true },
  });
  const keys = new Set(have.map((one) => one.key));
  return STANDARD_BREED_KEYS.filter((key) => !keys.has(key));
};

/**
 * Gives the farm these standard breeds, and says which it gave: another request may have given them first. A breed the
 * farm already wrote under one of a standard breed's names — "Sahiwal", typed before there was a list — is taken as
 * that standard breed, keeping the farm's spelling and gaining the name it lacked, rather than finding a second beside
 * it.
 */
export const addStandardBreeds = async (
  tx: Tx,
  farmId: string,
  keys: readonly StandardBreedKey[],
  now: Date
): Promise<StandardBreedKey[]> => {
  if (keys.length === 0) {
    return [];
  }
  const own = await tx.query.breed.findMany({
    where: { farmId, key: { isNull: true } },
    columns: { id: true, nameBn: true, nameEn: true },
  });
  const given: StandardBreedKey[] = [];
  const fresh: StandardBreedKey[] = [];
  const taken = new Set<string>();
  for (const key of keys) {
    const { bn, en } = STANDARD_BREEDS[key];
    const standardNames = new Set([bn.toLowerCase(), en.toLowerCase()]);
    const theirs = own.find(
      (one) =>
        !taken.has(one.id) &&
        namesOf(one).some((name) => standardNames.has(name))
    );
    if (!theirs) {
      fresh.push(key);
      continue;
    }
    taken.add(theirs.id);
    // oxlint-disable-next-line no-await-in-loop -- a handful of rows, on the farm's first opening of its list
    const [adopted] = await tx
      .update(breed)
      .set({ key, nameEn: theirs.nameEn ?? en })
      .where(and(eq(breed.id, theirs.id), isNull(breed.key)))
      .returning({ key: breed.key });
    if (adopted) {
      given.push(key);
    }
  }
  if (fresh.length > 0) {
    const added = await tx
      .insert(breed)
      .values(
        fresh.map((key) => ({
          id: newId(now),
          farmId,
          key,
          nameBn: STANDARD_BREEDS[key].bn,
          nameEn: STANDARD_BREEDS[key].en,
          createdAt: now,
        }))
      )
      .onConflictDoNothing()
      .returning({ key: breed.key });
    for (const one of added) {
      if (one.key !== null) {
        given.push(one.key as StandardBreedKey);
      }
    }
  }
  return given;
};

/** Refuses a name another of the farm's breeds already has, in either language. */
export const assertNameFree = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  names: { nameBn: string; nameEn?: string | null },
  exceptId?: string
) => {
  const wanted = namesOf({
    nameBn: names.nameBn,
    nameEn: names.nameEn ?? null,
  });
  const others = await tx.query.breed.findMany({
    where: { farmId },
    columns: { id: true, nameBn: true, nameEn: true },
  });
  const clash = others.some(
    (one) =>
      one.id !== exceptId && namesOf(one).some((name) => wanted.includes(name))
  );
  if (clash) {
    throw refusedBreed("The farm already has that breed", "breed_exists");
  }
};

/** The breed an animal is being written down under: one of this farm's, and not retired. */
export const requireBreed = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  breedId: string
) => {
  const row = await tx.query.breed.findFirst({
    where: { id: breedId, farmId },
    columns: { id: true, retiredAt: true },
  });
  if (!row) {
    throw refusedBreed("No such breed on the farm's list", "breed_unknown");
  }
  if (row.retiredAt) {
    throw refusedBreed(
      "That breed is retired: nothing new is written down under it",
      "breed_retired"
    );
  }
  return row;
};

/**
 * The breed a name on a register row means: the farm's list, by either of its names, whatever the capitals. Null for
 * a name the list does not have — the row is refused, as a Pen the farm does not have is.
 */
export const breedNamed = (
  breeds: readonly {
    id: string;
    nameBn: string;
    nameEn: string | null;
    retiredAt: Date | null;
  }[],
  name: string
): string | null => {
  const wanted = name.trim().toLowerCase();
  return (
    breeds.find(
      (one) => one.retiredAt === null && namesOf(one).includes(wanted)
    )?.id ?? null
  );
};
