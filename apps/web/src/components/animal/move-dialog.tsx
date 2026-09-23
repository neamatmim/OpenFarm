import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import type { PenChoice } from "@/components/animal/animal-types";
import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { queueMove } from "@/lib/record-offline";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/**
 * An Animal to another Pen — with signal the farm answers now; without it the Move waits on the phone rather than
 * being lost. Opened from her page, and from a list that already knows where she should go, which chooses the Pen for
 * whoever moves her.
 */
export const MoveDialog = ({
  animal,
  pens,
  chosenPenId = "",
  open,
  onOpenChange,
}: {
  animal: { tagNumber: string; penId: string; penName: string };
  pens: PenChoice[];
  /** The Pen to offer first, where the screen knows where she belongs. */
  chosenPenId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const onError = useRefused();
  const [toPenId, setToPenId] = useState(chosenPenId);
  const [reason, setReason] = useState("");
  const finished = () => {
    setToPenId(chosenPenId);
    setReason("");
    onOpenChange(false);
  };
  const move = useMutation(
    orpc.animals.move.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.moved"));
        finished();
      },
      onError,
    })
  );
  const handleSubmit = async () => {
    const wanted = {
      tagNumber: animal.tagNumber,
      toPenId,
      reason: reason || undefined,
    };
    if (navigator.onLine) {
      move.mutate(wanted);
      return;
    }
    try {
      await queueMove(wanted);
      toast.success(t("animals.moveQueued"));
      finished();
    } catch (error) {
      onError(error as Error);
    }
  };
  return (
    <FormDialog
      description={`${t("animals.pen")}: ${animal.penName}`}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      open={open}
      pending={move.isPending}
      ready={toPenId !== ""}
      submitLabel={t("animals.move")}
      title={`${t("animals.move")} · ${animal.tagNumber}`}
    >
      <FormField id="act-move-pen" label={t("animals.moveTo")}>
        <NativeSelect
          id="act-move-pen"
          onChange={(event) => setToPenId(event.target.value)}
          required
          value={toPenId}
        >
          <option value="">—</option>
          {pens
            .filter((pen) => pen.id !== animal.penId)
            .map((pen) => (
              <option key={pen.id} value={pen.id}>
                {pen.shedName} / {pen.name}
              </option>
            ))}
        </NativeSelect>
      </FormField>
      <FormField id="act-move-reason" label={t("animals.reason")}>
        <Input
          id="act-move-reason"
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </FormField>
    </FormDialog>
  );
};
