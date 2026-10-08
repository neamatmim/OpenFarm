import { useMutation } from "@tanstack/react-query";

import { useBreeds } from "@/components/breed-field";
import {
  CorrectionAnswer,
  CorrectionChoice,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { breedName } from "@/lib/breed";
import { choice, day, note } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

const SEXES = ["female", "male"] as const;

/**
 * What she is, put right by the Owner or the Manager with a reason: her sex, her breed, her birth date, her dam. A breed
 * left out at the gate decides her Expected Gain and the deshi judgment; a sex typed wrong gave her the other Side's
 * routines. Her sex is refused once her breeding, a calving or a calf of hers rests on it.
 */
export const CorrectWhatSheIs = ({
  her,
}: {
  her: {
    tagNumber: string;
    sex: (typeof SEXES)[number];
    breedId: string | null;
    birthDate: Date | string | null;
    dam: { tagNumber: string } | null;
  };
}) => {
  const { t, language } = useLanguage();
  const breeds = useBreeds();
  const correcting = useCorrecting({
    sex: choice(her.sex),
    breedId: choice(her.breedId),
    birthDate: day(her.birthDate),
    damTag: note(her.dam?.tagNumber ?? null),
  });
  const correct = useMutation(orpc.animals.correctFacts.mutationOptions({}));
  const choices = (breeds.data ?? [])
    .filter((one) => one.retiredAt === null || one.id === her.breedId)
    .map((one) => ({ value: one.id, label: breedName(one, language) ?? "" }))
    .toSorted((a, b) => a.label.localeCompare(b.label, language));
  return (
    <CorrectionDialog
      description={t("correct.whatSheIsHint")}
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          tagNumber: her.tagNumber,
          changes: correcting.changes(),
          reason,
        });
      }}
      ready={correcting.changed}
      title={t("correct.whatSheIs")}
      trigger={t("correct.whatSheIs")}
    >
      <CorrectionChoice
        label={t("animals.sex")}
        onChange={(value) => correcting.set("sex", value)}
        options={SEXES.map((one) => ({
          value: one,
          label: t(`animals.sex.${one}`),
        }))}
        value={correcting.typed.sex ?? ""}
      />
      <CorrectionChoice
        label={t("animals.breed")}
        onChange={(value) => correcting.set("breedId", value)}
        options={choices}
        unchosen={t("breeds.choose")}
        value={correcting.typed.breedId ?? ""}
      />
      <CorrectionAnswer
        label={t("animals.birthDate")}
        onChange={(value) => correcting.set("birthDate", value)}
        type="date"
        value={correcting.typed.birthDate ?? ""}
      />
      <CorrectionAnswer
        label={t("correct.damTag")}
        onChange={(value) => correcting.set("damTag", value)}
        value={correcting.typed.damTag ?? ""}
      />
    </CorrectionDialog>
  );
};
