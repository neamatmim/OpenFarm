import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useInvestorNames } from "@/components/investors/investor-names";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

interface Arrival {
  agreementId: string;
  amountBdt: string;
  movedOn: string;
  reference: string;
}

const NOTHING_YET: Arrival = {
  agreementId: "",
  amountBdt: "",
  movedOn: "",
  reference: "",
};

/**
 * Capital as it lands: which paper it came against, how much, the day the bank moved it, and the
 * reference on the transfer, cheque or deposit slip.
 *
 * There is no way to say "cash" here, because there is no way to take it: the sheet says bank because
 * the farm only takes bank.
 */
export const TakeCapitalSheet = ({
  venture,
  agreementId = null,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  /** Opened from one Investor's row: his paper, chosen already. */
  agreementId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [arrival, setArrival] = useState<Arrival>(NOTHING_YET);
  // A new subject is another Venture or another man's paper: what was typed for one is not the other's.
  useFreshFor(venture ? `${venture.id}:${agreementId ?? ""}` : undefined, () =>
    setArrival({ ...NOTHING_YET, agreementId: agreementId ?? "" })
  );
  const agreements = useQuery({
    ...orpc.ventures.agreements.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const nameOf = useInvestorNames();
  const taka = useTaka();
  const taking = useMutation(
    orpc.ventures.takeCapital.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setArrival({ ...NOTHING_YET, agreementId: agreementId ?? "" });
        onOpenChange(false);
        toast.success(t("ventures.capitalTaken"));
      },
    })
  );
  const paper = (agreements.data ?? []).find(
    (one) => one.id === arrival.agreementId
  );
  const amount = Number(arrival.amountBdt);
  const ready =
    arrival.agreementId !== "" &&
    amount > 0 &&
    arrival.movedOn !== "" &&
    arrival.reference.trim() !== "";
  return (
    <FormSheet
      description={t("ventures.capitalHint", { venture: venture?.name ?? "" })}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        taking.mutate({
          agreementId: arrival.agreementId,
          amountBdt: amount,
          movedOn: arrival.movedOn,
          paymentMethod: "bank",
          reference: arrival.reference,
        })
      }
      open={open}
      pending={taking.isPending}
      ready={ready}
      submitLabel={t("ventures.takeCapital")}
      title={t("ventures.takeCapital")}
    >
      {/* Whose paper it comes against is the row it was opened from: said, not asked again. */}
      {paper ? (
        <p className="bg-muted rounded-md px-3 py-2 text-sm">
          <span className="font-medium">{nameOf(paper.investorId)}</span>
          {` · ${t("ventures.holdsUnits", {
            units: formatNumber(paper.units, language),
          })} · ${t("ventures.capitalLeft", { taka: taka(paper.capitalLeftBdt) })}`}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="capital-amount" label={t("ventures.amount")}>
          <Input
            id="capital-amount"
            inputMode="numeric"
            onChange={(event) =>
              setArrival({ ...arrival, amountBdt: event.target.value })
            }
            type="number"
            value={arrival.amountBdt}
          />
        </FormField>
        <FormField id="capital-moved-on" label={t("ventures.movedOn")}>
          <Input
            id="capital-moved-on"
            onChange={(event) =>
              setArrival({ ...arrival, movedOn: event.target.value })
            }
            type="date"
            value={arrival.movedOn}
          />
        </FormField>
      </div>
      <FormField
        hint={t("ventures.referenceHint")}
        id="capital-reference"
        label={t("ventures.reference")}
      >
        <Input
          autoComplete="off"
          id="capital-reference"
          onChange={(event) =>
            setArrival({ ...arrival, reference: event.target.value })
          }
          value={arrival.reference}
        />
      </FormField>
    </FormSheet>
  );
};
