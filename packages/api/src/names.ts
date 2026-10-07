/** A list entry's two names: the Bangla every entry has, and the English one it may. */
interface Named {
  id: string;
  nameBn: string;
  nameEn: string | null;
}

/** Any run of spaces, as one. */
const SPACES = /\s+/gu;

/** A name as two spellings of it are compared: in one Unicode form — ড় or য় typed as one letter or as the letter and its
 *  nukta, as two Bangla keyboards do, is one name — with its spaces as one, trimmed, whatever the capitals. */
const said = (name: string) =>
  name.normalize("NFC").replace(SPACES, " ").trim().toLowerCase();

/** Whether two names are one name, as the farm compares them. */
export const sameName = (one: string, other: string): boolean =>
  said(one) === said(other);

/** An entry's names, as they are compared. */
export const namesOf = (one: Pick<Named, "nameBn" | "nameEn">): string[] =>
  [one.nameBn, one.nameEn]
    .filter((name): name is string => Boolean(name))
    .map(said);

/**
 * Whether another entry on the farm's list already goes by either of these names, in either language — two feeds both
 * called "Green grass" in English are two names for one thing, whatever their Bangla. The entry being renamed is not
 * its own clash.
 */
export const nameTaken = (
  others: readonly Named[],
  names: { bn: string; en?: string | null },
  exceptId?: string
): boolean => {
  const wanted = namesOf({ nameBn: names.bn, nameEn: names.en ?? null });
  return others.some(
    (one) =>
      one.id !== exceptId && namesOf(one).some((name) => wanted.includes(name))
  );
};
