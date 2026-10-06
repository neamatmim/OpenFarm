import type { MessageKey } from "@OpenFarm/i18n";

import { FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

const SIDE_WORD = {
  "": "byHand.wholeFarm",
  dairy: "animals.side.dairy",
  fattening: "animals.side.fattening",
} as const satisfies Record<string, MessageKey>;

export type SideChoice = keyof typeof SIDE_WORD;

/** Which Side money entered by hand belongs to, or the whole farm. */
export const SideField = ({
  id,
  onChange,
  value,
}: {
  id: string;
  onChange: (side: SideChoice) => void;
  value: SideChoice;
}) => {
  const { t } = useLanguage();
  return (
    <FormField id={id} label={t("byHand.side")}>
      <NativeSelect
        id={id}
        onChange={(event) =>
          onChange(
            (Object.keys(SIDE_WORD) as SideChoice[]).find(
              (side) => side === event.target.value
            ) ?? ""
          )
        }
        value={value}
      >
        {(Object.keys(SIDE_WORD) as SideChoice[]).map((side) => (
          <option key={side} value={side}>
            {t(SIDE_WORD[side])}
          </option>
        ))}
      </NativeSelect>
    </FormField>
  );
};
