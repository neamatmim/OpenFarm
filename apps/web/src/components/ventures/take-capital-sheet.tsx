import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useInvestorNames } from "@/components/investors/investor-names";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { AgreementPaperButton } from "@/components/ventures/agreement-paper";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import { useRefused } from "@/lib/refused";
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
 * The stamped paper, attached to an Agreement signed without one.
 *
 * Offered here because here is where she finds out: the option above is disabled and says so, and until
 * now that was the end of the road. One Investor holds at most one Agreement per Venture, no Agreement
 * can be undone, and no other screen would take the photograph — so a forgotten photo shut that man's
 * capital out for good and the only way back was a call nobody can make from a phone.
 */
const PaperlessAgreements = ({
  agreements,
}: {
  agreements: { id: string; investorId: string }[];
}) => {
  const { t } = useLanguage();
  const nameOf = useInvestorNames();
  if (agreements.length === 0) {
    return null;
  }
  return (
    <div className="border-warning/35 bg-warning-surface/40 flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm font-medium">{t("ventures.paperMissing")}</p>
      {agreements.map((one) => (
        <div className="flex flex-wrap items-center gap-3" key={one.id}>
          <span className="min-w-0 flex-1 truncate text-sm">
            {nameOf(one.investorId)}
          </span>
          <AgreementPaperButton agreementId={one.id} idPrefix="capital" />
        </div>
      ))}
      <p className="text-muted-foreground text-sm">
        {t("ventures.paperMissingHint")}
      </p>
    </div>
  );
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
      <PaperlessAgreements
        agreements={(agreements.data ?? []).filter((one) => !one.hasPaper)}
      />
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
