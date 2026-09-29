import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/**
 * The Owner writing off one Sale's or one Dispatch's Baki that will not be paid: how much, filled with what is still
 * owed, and why. What the animal or the milk fetched drops by it and the buyer carries the mark. The Owner's alone —
 * the button is shown to nobody else.
 */
export const WriteOffButton = ({
  source,
  id,
  owingBdt,
}: {
  source: "sale" | "dispatch";
  id: string;
  owingBdt: number;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(owingBdt));
  const [why, setWhy] = useState("");
  const writeOff = useMutation(
    orpc.baki.writeOff.mutationOptions({
      onSuccess: () => {
        toast.success(t("baki.writtenOffDone"));
        setOpen(false);
      },
      onError: refused,
    })
  );
  const figure = Number(amount);
  const ready =
    amount.trim() !== "" &&
    figure > 0 &&
    !(figure > owingBdt) &&
    why.trim() !== "";
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {t("baki.writeOff")}
      </Button>
      <FormDialog
        description={t("baki.writeOffDescription")}
        onOpenChange={setOpen}
        onSubmit={() =>
          writeOff.mutate({ source, id, amountBdt: figure, why: why.trim() })
        }
        open={open}
        pending={writeOff.isPending}
        ready={ready}
        submitLabel={t("baki.writeOff")}
        title={t("baki.writeOffTitle")}
      >
        <FormField id={`write-off-${id}-amount`} label={t("baki.amount")}>
          <Input
            id={`write-off-${id}-amount`}
            inputMode="numeric"
            max={owingBdt}
            min={0}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            value={amount}
          />
        </FormField>
        <FormField id={`write-off-${id}-why`} label={t("baki.writeOffWhy")}>
          <Input
            autoComplete="off"
            id={`write-off-${id}-why`}
            maxLength={300}
            onChange={(event) => setWhy(event.target.value)}
            value={why}
          />
        </FormField>
      </FormDialog>
    </>
  );
};
