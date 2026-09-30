/** Any run of spaces or dashes: "Foot-and-mouth" and "Foot and  mouth" are one spelling. */
const SPACES_AND_DASHES = /[\s\-–—]+/gu;

/**
 * A disease's name as two spellings of it are compared: one Unicode form — Bangla has two ways to write য় — trimmed,
 * whatever the capitals, and any run of spaces or dashes one space.
 */
export const diseaseWord = (name: string): string =>
  name.normalize("NFC").trim().toLowerCase().replaceAll(SPACES_AND_DASHES, " ");

/** A disease on the farm's list: its names, and the other names it goes by. */
export interface ListedDisease {
  nameBn: string;
  nameEn: string | null;
  otherNames: readonly string[];
}

/** Whether what the Vet wrote names this disease on the list — by its name, its English, or another name it goes by. */
export const namesTheDisease = (
  listed: ListedDisease,
  said: { bn: string; en?: string | null }
): boolean => {
  const written = new Set(
    [said.bn, said.en]
      .filter((word): word is string => Boolean(word?.trim()))
      .map(diseaseWord)
  );
  return [listed.nameBn, listed.nameEn, ...listed.otherNames]
    .filter((word): word is string => Boolean(word?.trim()))
    .some((word) => written.has(diseaseWord(word)));
};
