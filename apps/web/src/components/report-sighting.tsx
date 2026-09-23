import {
  OBSERVATION_WORDS,
  OBSERVATION_WORD_NEEDING_A_NOTE,
} from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { queueObservation } from "@/lib/record-offline";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/**
 * Saying what was seen of her with no round asking — a limp at the gate, bulling in the yard. It reaches the Vet's
 * inbox, and a heat begins the breeding work, just as on the round. With no signal it waits on the phone.
 */
export const ReportSighting = ({
  tagNumber,
  className,
}: {
  tagNumber: string;
  /** Where the button sits in the header it is drawn in. */
  className?: string;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [saw, setSaw] = useState("");
  const [note, setNote] = useState("");
  const done = (message: string) => {
    toast.success(message);
    setOpen(false);
    setSaw("");
    setNote("");
  };
  const record = useMutation(
    orpc.observations.record.mutationOptions({
      onSuccess: () => done(t("sighting.recorded")),
      onError: refused,
    })
  );
  const needsNote = saw === OBSERVATION_WORD_NEEDING_A_NOTE;
  const ready = saw !== "" && (!needsNote || note.trim() !== "");

  const handleSubmit = async () => {
    const input = { tagNumber, saw, note: note.trim() || undefined };
    if (navigator.onLine) {
      record.mutate(input);
      return;
    }
    try {
      await queueObservation(input);
      await done(t("sighting.queued"));
    } catch (error) {
      refused(error);
    }
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
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            {t("sighting.what")}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {OBSERVATION_WORDS.map((sighting) => (
              <Button
                aria-pressed={saw === sighting.value}
                className="h-auto min-h-11 justify-start py-2 text-start whitespace-normal"
                key={sighting.value}
                onClick={() => setSaw(sighting.value)}
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
            onChange={(event) => setNote(event.target.value)}
            required={needsNote}
            rows={3}
            value={note}
          />
        </FormField>
      </FormDialog>
    </>
  );
};
