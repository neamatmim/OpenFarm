import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet } from "@/components/page-kit";
import { SearchablePicker } from "@/components/searchable-picker";
import { useLanguage } from "@/i18n/language-provider";
import { usePenNames } from "@/lib/pen-names";
import { orpc } from "@/utils/orpc";

import type { Seen } from "./vet-types";
import { AnimalLink, useRefusal } from "./vet-types";

/** What the Vet types either way: the disease, and what they found. */
interface Conclusion {
  disease: string;
  note: string;
}

const emptyConclusion: Conclusion = { disease: "", note: "" };

/** What the server wants: the typed disease and note, trimmed, the note left out when blank. */
const asRecorded = (conclusion: Conclusion) => ({
  disease: { bn: conclusion.disease.trim() },
  ...(conclusion.note.trim() ? { note: conclusion.note.trim() } : {}),
});

/** What the round saw, above the answer to it: the animal, the word, who saw it and when, and what they wrote. */
const WhatWasSeen = ({ seen }: { seen: Seen }) => {
  const { language } = useLanguage();
  return (
    <div className="bg-muted/60 flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <AnimalLink tagNumber={seen.tagNumber} />
          <span className="font-medium">{seen.sawLabel}</span>
        </div>
        <span className="text-muted-foreground text-xs">
          {formatDate(new Date(seen.seenAt), language, "dateTime")}
        </span>
      </div>
      {seen.seenByName ? (
        <span className="text-muted-foreground text-xs">{seen.seenByName}</span>
      ) : null}
      {seen.note ? <p className="text-foreground/80">“{seen.note}”</p> : null}
    </div>
  );
};

/**
 * A Diagnosis, in a sheet beside the Vet's list: the answer to one thing a round saw, or — with no Observation — a
 * conclusion on whichever animal the Vet names, because they came for one cow and found something on another. It is
 * the Vet's own act, so nobody else has a form to record it on.
 *
 * That animal is chosen from the ones the Vet may diagnose — still on the farm, and theirs to see: the whole herd for
 * the farm's own Vet, their Cases for a visit — each with her Pen, her State and her other tags, rather than typed.
 */
export const DiagnosisSheet = ({
  seen,
  animalTag,
  open,
  onOpenChange,
}: {
  /** What is being answered; none for a Diagnosis on its own. */
  seen: Seen | null;
  /** Opened from her own page: the animal is her, and is not chosen again. */
  animalTag?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const onError = useRefusal();
  const [tagNumber, setTagNumber] = useState(animalTag ?? "");
  const [conclusion, setConclusion] = useState(emptyConclusion);
  const idPrefix = seen?.id ?? "own";
  // Only for a Diagnosis on its own, only once the sheet is open, and only where nobody has named her yet: answering
  // a round names the animal, and so does her own page.
  const choosing = open && seen === null && animalTag === undefined;
  const herd = useQuery({
    ...orpc.animals.list.queryOptions({ input: {} }),
    enabled: choosing,
  });
  const penNames = usePenNames(choosing);
  const options = (herd.data ?? []).map((her) => ({
    value: her.tagNumber,
    label: her.tagNumber,
    detail: [
      her.penId ? penNames.get(her.penId) : undefined,
      t(`state.${her.state}` as MessageKey),
      her.officialTag,
      ...her.aliases,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  const record = useMutation(
    orpc.diagnoses.record.mutationOptions({
      onSuccess: () => {
        setTagNumber(animalTag ?? "");
        setConclusion(emptyConclusion);
        toast.success(t("vet.recorded"));
        onOpenChange(false);
      },
      onError,
    })
  );

  const ready =
    conclusion.disease.trim() !== "" &&
    (seen !== null || tagNumber.trim() !== "");

  return (
    <FormSheet
      description={seen ? t("vet.answerHint") : t("vet.onItsOwnHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        record.mutate(
          seen
            ? {
                animalTag: seen.tagNumber,
                answers: seen.id,
                ...asRecorded(conclusion),
              }
            : { animalTag: tagNumber.trim(), ...asRecorded(conclusion) }
        )
      }
      open={open}
      pending={record.isPending}
      ready={ready}
      submitLabel={t("vet.record")}
      title={seen ? t("vet.record") : t("vet.onItsOwn")}
    >
      {seen ? <WhatWasSeen seen={seen} /> : null}
      {seen === null && animalTag ? (
        <p className="bg-muted rounded-md px-3 py-2 text-sm">
          <AnimalLink tagNumber={animalTag} />
        </p>
      ) : null}
      {seen === null && animalTag === undefined ? (
        <FormField id="own-tag" label={t("vet.tagNumber")}>
          <SearchablePicker
            empty={t("vet.noAnimalToDiagnose")}
            id="own-tag"
            loading={herd.isPending}
            onChange={setTagNumber}
            options={options}
            placeholder={t("picker.findAnimal")}
            value={tagNumber}
          />
        </FormField>
      ) : null}
      <FormField id={`disease-${idPrefix}`} label={t("vet.disease")}>
        <Input
          autoComplete="off"
          id={`disease-${idPrefix}`}
          onChange={(event) =>
            setConclusion({ ...conclusion, disease: event.target.value })
          }
          value={conclusion.disease}
        />
      </FormField>
      <FormField id={`note-${idPrefix}`} label={t("vet.note")}>
        <Input
          id={`note-${idPrefix}`}
          onChange={(event) =>
            setConclusion({ ...conclusion, note: event.target.value })
          }
          value={conclusion.note}
        />
      </FormField>
    </FormSheet>
  );
};
