import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import type { PenChoice } from "@/components/animal/animal-types";
import {
  PenOverCapacity,
  usePenChoiceLabel,
} from "@/components/animal/pen-room";
import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { keptOnThePhone, queueMove, sendOrKeep } from "@/lib/record-offline";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { client } from "@/utils/orpc";

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
  const penLabel = usePenChoiceLabel();
  const [toPenId, setToPenId] = useState(chosenPenId);
  const [reason, setReason] = useState("");
  const finished = () => {
    setToPenId(chosenPenId);
    setReason("");
    onOpenChange(false);
  };
  // Sent now when the farm answers, kept on the phone when it does not — bars and no data included.
  const move = useMutation({
    ...keptOnThePhone,
    mutationFn: (wanted: {
      tagNumber: string;
      toPenId: string;
      reason?: string;
    }) =>
      sendOrKeep({
        online: navigator.onLine,
        send: () => client.animals.move(wanted),
        keep: () => queueMove(wanted),
      }),
    onSuccess: (how) => {
      toast.success(t(how === "sent" ? "animals.moved" : "animals.moveQueued"));
      finished();
    },
    onError,
  });
  const handleSubmit = () => {
    move.mutate({
      tagNumber: animal.tagNumber,
      toPenId,
      reason: reason || undefined,
    });
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
                {penLabel(pen)}
              </option>
            ))}
        </NativeSelect>
      </FormField>
      <PenOverCapacity
        coming={1}
        pen={pens.find((pen) => pen.id === toPenId)}
      />
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
