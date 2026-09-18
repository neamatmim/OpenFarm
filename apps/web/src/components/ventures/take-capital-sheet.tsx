import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useInvestorNames } from "@/components/investors/investor-names";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
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
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [arrival, setArrival] = useState<Arrival>(NOTHING_YET);
  const agreements = useQuery({
    ...orpc.ventures.agreements.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const nameOf = useInvestorNames();
  const taking = useMutation(
    orpc.ventures.takeCapital.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async () => {
        setArrival(NOTHING_YET);
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.ventures.key() });
        toast.success(t("ventures.capitalTaken"));
      },
    })
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
      <FormField
        hint={t("ventures.whosePaperHint")}
        id="capital-agreement"
        label={t("ventures.whosePaper")}
      >
        <NativeSelect
          id="capital-agreement"
          onChange={(event) =>
            setArrival({ ...arrival, agreementId: event.target.value })
          }
          value={arrival.agreementId}
        >
          <option value="">—</option>
          {(agreements.data ?? []).map((one) => (
            <option disabled={!one.hasPaper} key={one.id} value={one.id}>
              {`${nameOf(one.investorId)} · ${t("ventures.holdsUnits", {
                units: formatNumber(one.units, language),
              })}${one.hasPaper ? "" : ` · ${t("ventures.noPaperYet")}`}`}
            </option>
          ))}
        </NativeSelect>
      </FormField>
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
