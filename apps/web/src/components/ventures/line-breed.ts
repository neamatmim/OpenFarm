import { useBreeds } from "@/components/breed-field";
import { useLanguage } from "@/i18n/language-provider";
import { breedName } from "@/lib/breed";

/**
 * What a plan line's Breed is called, in the reader's language: the farm's name for it, or "any breed" for a line that
 * names none — and for a plan this phone kept from before a line could name one.
 */
export const useLineBreedName = () => {
  const { t, language } = useLanguage();
  const breeds = useBreeds().data ?? [];
  return (breedId: string | null | undefined): string => {
    if (!breedId) {
      return t("plan.anyBreed");
    }
    const found = breeds.find((one) => one.id === breedId);
    return found ? (breedName(found, language) ?? "") : "";
  };
};
