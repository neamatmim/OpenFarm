// The round's "the rest of this Pen are well": every animal it has not reached passed as well, after a question.

import type { Step } from "@OpenFarm/domain";
import { isFinished, nothingToNoteOf } from "@OpenFarm/domain";
import { formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/page-kit";
import type { Animal } from "@/components/work/work-types";
import { useLanguage } from "@/i18n/language-provider";
import { recordStep } from "@/lib/record-offline";
import { journeyOf } from "@/lib/step-answer";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/**
 * Most of a round's animals are well, and a tap each for "nothing to note" is most of a round's taps. After the person
 * has walked the Pen, the ones not reached are passed as well at once — each its own entry into the Outbox, as a tap
 * on each would be, so the farm and the Manager's check read them the same way. Asked first, because it writes many.
 * Offered only where the Step can pass an animal as well, and where more than one is left.
 */
export const PassTheRestWell = ({
  instanceId,
  step,
  rest,
  heldByAnother,
  state,
}: {
  instanceId: string;
  step: Step;
  /** The animals the round has not reached. */
  rest: Animal[];
  /** Somebody else holds the work: it is theirs to record. */
  heldByAnother: boolean;
  /** Where the work stands: finished work is put right, not passed. */
  state: string;
}) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const well = nothingToNoteOf(step);
  const instanceKey = orpc.work.get.queryKey({ input: { id: instanceId } });
  const pass = useMutation({
    mutationFn: async (reason: string) => {
      for (const beast of rest) {
        const journey = journeyOf(
          { evidence: [], skipReason: reason },
          {
            instanceId,
            stepId: step.id,
            animalTag: beast.tagNumber,
            animalId: beast.id,
          }
        );
        if (journey.by === "outbox") {
          // One after another: each takes the next number in the phone's own count.
          // oxlint-disable-next-line no-await-in-loop
          await recordStep(queryClient, instanceKey, journey.input);
        }
      }
    },
    onSuccess: () => {
      setAsking(false);
      void queryClient.invalidateQueries({ queryKey: ["outbox"] });
    },
    onError: (error) => toast.error(error.message || t("common.error")),
  });
  if (!well || heldByAnother || isFinished(state) || rest.length < 2) {
    return null;
  }
  const count = formatDigits(rest.length, language);
  return (
    <>
      <Button
        className="mt-3 h-12 w-full sm:w-fit md:h-11"
        onClick={() => setAsking(true)}
        variant="outline"
      >
        <CircleCheck className="text-success" data-icon="inline-start" />
        {t("work.restWell", { count })}
      </Button>
      <ConfirmDialog
        confirmLabel={t("work.restWellConfirm")}
        description={t("work.restWellBody", {
          reason: language === "en" && well.en ? well.en : well.bn,
        })}
        onConfirm={() => pass.mutate(well.bn)}
        onOpenChange={setAsking}
        open={asking}
        pending={pass.isPending}
        takesAway={false}
        title={t("work.restWellTitle", { count })}
      />
    </>
  );
};
