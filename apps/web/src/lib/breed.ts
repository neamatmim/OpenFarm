import type { Language } from "@OpenFarm/i18n";

/** A breed as the farm's list names it. */
export interface BreedNames {
  nameBn: string;
  nameEn: string | null;
}

/**
 * A breed in the reader's language: its English name for an English reader where it has one, its Bangla otherwise.
 * A phone that cached an animal before the farm kept a list holds her breed as the words typed, and says those until
 * the farm's answer comes.
 */
export const breedName = (
  breed: BreedNames | string | null | undefined,
  language: Language
): string | null => {
  if (breed === null || breed === undefined) {
    return null;
  }
  if (typeof breed === "string") {
    return breed;
  }
  return language === "bn" ? breed.nameBn : (breed.nameEn ?? breed.nameBn);
};
