import { SIGHTINGS, SIGHTING_NEEDING_A_NOTE } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@OpenFarm/ui/components/dialog";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import { queueObservation } from "@/lib/record-offline";
import { orpc } from "@/utils/orpc";

/**
 * Saying what was seen of her with no round asking — a limp at the gate, bulling in the yard. It reaches the Vet's
 * inbox, and a heat begins the breeding work, just as on the round. With no signal it waits on the phone.
 */
export const ReportSighting = ({ tagNumber }: { tagNumber: string }) => {
  const { t, language } = useLanguage();
  const ids = useId();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saw, setSaw] = useState("");
  const [note, setNote] = useState("");
  const done = async (message: string) => {
    toast.success(message);
    setOpen(false);
    setSaw("");
    setNote("");
    await queryClient.invalidateQueries({ queryKey: orpc.animals.key() });
  };
  const record = useMutation(
    orpc.observations.record.mutationOptions({
      onSuccess: () => done(t("sighting.recorded")),
      onError: (error) => toast.error(error.message || t("common.error")),
    })
  );
  const needsNote = saw === SIGHTING_NEEDING_A_NOTE;
  const ready = saw !== "" && (!needsNote || note.trim() !== "");

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button className="w-fit" variant="outline">
            <Eye aria-hidden />
            {t("sighting.report")}
          </Button>
        }
      />
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>
            {t("sighting.report")} · {tagNumber}
          </DialogTitle>
          <DialogDescription>{t("sighting.hint")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const input = { tagNumber, saw, note: note.trim() || undefined };
            if (navigator.onLine) {
              record.mutate(input);
              return;
            }
            try {
              await queueObservation(input);
              await done(t("sighting.queued"));
            } catch (error) {
              toast.error((error as Error).message || t("common.error"));
            }
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">
              {t("sighting.what")}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {SIGHTINGS.map((sighting) => (
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-note`}>
              {needsNote ? t("sighting.noteNeeded") : t("sighting.note")}
            </Label>
            <Textarea
              id={`${ids}-note`}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              required={needsNote}
              rows={3}
              value={note}
            />
          </div>
          <DialogFooter>
            <Button disabled={!ready || record.isPending} type="submit">
              {record.isPending ? <Spinner /> : null}
              {t("sighting.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
