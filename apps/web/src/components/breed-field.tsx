import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { breedName } from "@/lib/breed";
import { orpc } from "@/utils/orpc";

/** The farm's breeds, for a screen that needs to name the one chosen. Shared with the field, so it is asked once. */
export const useBreeds = () => useQuery(orpc.breeds.list.queryOptions());

/**
 * Her breed, chosen from the farm's list: the breeds not retired, in the reader's language, and "not known" — a breed
 * is never a thing anybody must know to write an animal down. The list is kept on the Breeds page, a tap away.
 */
export const BreedField = ({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (breedId: string) => void;
}) => {
  const { t, language } = useLanguage();
  const breeds = useBreeds();
  const choices = (breeds.data ?? [])
    .filter((one) => one.retiredAt === null)
    .map((one) => ({ id: one.id, name: breedName(one, language) ?? "" }))
    .toSorted((a, b) => a.name.localeCompare(b.name, language));
  return (
    <FormField
      hint={
        <Link
          className="text-primary underline-offset-4 hover:underline"
          to="/admin/breeds"
        >
          {t("breeds.manage")}
        </Link>
      }
      id={id}
      label={t("animals.breed")}
    >
      <NativeSelect
        disabled={breeds.data === undefined}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{t("breeds.choose")}</option>
        {choices.map((one) => (
          <option key={one.id} value={one.id}>
            {one.name}
          </option>
        ))}
      </NativeSelect>
    </FormField>
  );
};
