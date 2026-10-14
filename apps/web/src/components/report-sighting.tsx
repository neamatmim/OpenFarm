import type { ObservationWord } from "@OpenFarm/domain";
import {
  OBSERVATION_WORDS,
  OBSERVATION_WORD_NEEDING_A_NOTE,
  observationWordsFor,
} from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Eye } from "lucide-react";
import { useId, useState } from "react";

import { FormDialog, FormField } from "@/components/page-kit";
import { useRecordObservation } from "@/components/record-observation";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";

/** Shared controls for recording a sighting and putting a refused one right. */
export const SightingFields = ({
  saw,
  note,
  onSaw,
  onNote,
  words = OBSERVATION_WORDS,
}: {
  saw: string;
  note: string;
  onSaw: (value: string) => void;
  onNote: (value: string) => void;
  /** The words offered: every one, unless the animal's State rules some out. */
  words?: readonly ObservationWord[];
}) => {
  const { t, language } = useLanguage();
  const ids = useId();
  const needsNote = saw === OBSERVATION_WORD_NEEDING_A_NOTE;
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          {t("sighting.what")}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {words.map((sighting) => (
            <Button
              aria-pressed={saw === sighting.value}
              className="h-auto min-h-11 justify-start py-2 text-start whitespace-normal md:h-auto"
              key={sighting.value}
              onClick={() => onSaw(sighting.value)}
              type="button"
              variant={saw === sighting.value ? "default" : "outline"}
            >
              {language === "en" ? sighting.en : sighting.bn}
            </Button>
          ))}
        </div>
      </fieldset>
      <FormField
        id={`${ids}-note`}
        label={needsNote ? t("sighting.noteNeeded") : t("sighting.note")}
      >
        <Textarea
          id={`${ids}-note`}
          maxLength={500}
          onChange={(event) => onNote(event.target.value)}
          required={needsNote}
          rows={3}
          value={note}
        />
      </FormField>
    </>
  );
};

/**
 * Saying what was seen of her with no round asking — a limp at the gate, bulling in the yard. It reaches the Vet's
 * inbox, and a heat begins the breeding work, just as on the round. With no signal it waits on the phone.
 */
export const ReportSighting = ({
  tagNumber,
  state,
  className,
}: {
  tagNumber: string;
  /** Her State: "giving less milk" is offered of a cow in milk alone. */
  state: string;
  /** Where the button sits in the header it is drawn in. */
  className?: string;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [open, setOpen] = useState(false);
  const [saw, setSaw] = useState("");
  const [note, setNote] = useState("");
  const done = (message: string) => {
    toast.success(message);
    setOpen(false);
    setSaw("");
    setNote("");
  };
  const record = useRecordObservation({
    onSuccess: (how) =>
      done(t(how === "sent" ? "sighting.recorded" : "sighting.queued")),
    onError: refused,
  });
  const needsNote = saw === OBSERVATION_WORD_NEEDING_A_NOTE;
  const ready = saw !== "" && (!needsNote || note.trim() !== "");

  const handleSubmit = () => {
    record.mutate({ tagNumber, saw, note: note.trim() || undefined });
  };

  return (
    <>
      <Button
        className={cn("w-fit", className)}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Eye aria-hidden data-icon="inline-start" />
        {t("sighting.report")}
      </Button>
      <FormDialog
        description={t("sighting.hint")}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
        open={open}
        pending={record.isPending}
        ready={ready}
        submitLabel={t("sighting.save")}
        title={`${t("sighting.report")} · ${tagNumber}`}
      >
        <SightingFields
          note={note}
          onNote={setNote}
          onSaw={setSaw}
          saw={saw}
          words={observationWordsFor(state)}
        />
      </FormDialog>
    </>
  );
};
