import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/**
 * The Owner's own money into a Venture whose Running Budget has run out.
 *
 * Interest-free and never a charge against the Venture: it earns her nothing and costs them nothing, and
 * it comes back at cost before any capital does. The sheet says so, because an Advance that looked like
 * a loan would be the one thing an Investor could fairly object to.
 */
export const AdvanceSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [movedOn, setMovedOn] = useState("");
  const [reference, setReference] = useState("");
  const advancing = useMutation(
    orpc.ventures.advance.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async () => {
        setAmount("");
        setMovedOn("");
        setReference("");
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.ventures.key() });
        toast.success(t("ventures.advanced"));
      },
    })
  );
  const amountBdt = Number(amount);
  const ready =
    venture !== null &&
    amountBdt > 0 &&
    movedOn !== "" &&
    reference.trim() !== "";
  return (
    <FormSheet
      description={t("ventures.advanceHint", { venture: venture?.name ?? "" })}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        advancing.mutate({
          ventureId: venture?.id ?? "",
          amountBdt,
          movedOn,
          paymentMethod: "bank",
          reference,
        })
      }
      open={open}
      pending={advancing.isPending}
      ready={ready}
      submitLabel={t("ventures.advance")}
      title={t("ventures.advance")}
    >
      <FormField
        hint={t("ventures.advanceEarnsNothing")}
        id="advance-amount"
        label={t("ventures.amount")}
      >
        <Input
          id="advance-amount"
          inputMode="numeric"
          onChange={(event) => setAmount(event.target.value)}
          type="number"
          value={amount}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="advance-moved-on" label={t("ventures.movedOn")}>
          <Input
            id="advance-moved-on"
            onChange={(event) => setMovedOn(event.target.value)}
            type="date"
            value={movedOn}
          />
        </FormField>
        <FormField id="advance-reference" label={t("ventures.reference")}>
          <Input
            autoComplete="off"
            id="advance-reference"
            onChange={(event) => setReference(event.target.value)}
            value={reference}
          />
        </FormField>
      </div>
    </FormSheet>
  );
};
