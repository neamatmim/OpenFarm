import { priceAtWeight } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/**
 * An Animal sold between the Farm's herd and a Venture.
 *
 * The rate is the Owner's to enter and the weight is not hers to choose: the price is what her latest
 * Weigh-in and that rate make it, shown before she commits. The note is asked for rather than offered,
 * because an Investor asking years later why his bull was worth that is owed a reason.
 */
export const InternalSaleSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [tagNumber, setTagNumber] = useState("");
  const [toVentureId, setToVentureId] = useState("");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const [soldOn, setSoldOn] = useState("");
  const [reference, setReference] = useState("");
  const ventures = useQuery(orpc.ventures.takingAnimals.queryOptions());
  const her = useQuery({
    ...orpc.animals.byTag.queryOptions({ input: { tagNumber } }),
    enabled: tagNumber.trim().length > 2,
  });
  const selling = useMutation(
    orpc.ventures.sellInternally.mutationOptions({
      onError: refused,
      onSuccess: (sold) => {
        setTagNumber("");
        setToVentureId("");
        setRate("");
        setNote("");
        setSoldOn("");
        setReference("");
        onOpenChange(false);
        toast.success(
          t("ventures.soldInternally", {
            price: formatNumber(sold.priceBdt, language),
          })
        );
      },
    })
  );
  const weighed = her.data?.weighIns?.at(0);
  const weightKg = weighed ? Number(weighed.weightKg) : 0;
  const rateBdtPerKg = Number(rate);
  // Struck by the same function the farm strikes it with, so what she reads is what she commits to and
  // a refusal means she was weighed again, not that two roundings disagreed.
  const priceBdt = priceAtWeight(weightKg, rateBdtPerKg);
  const ready =
    tagNumber.trim() !== "" &&
    weightKg > 0 &&
    rateBdtPerKg > 0 &&
    note.trim() !== "" &&
    reference.trim() !== "" &&
    soldOn !== "";
  return (
    <FormSheet
      description={t("ventures.internalSaleHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        selling.mutate({
          tagNumber,
          toVentureId: toVentureId || undefined,
          rateBdtPerKg,
          note,
          soldOn,
          paymentMethod: "bank",
          reference,
          priceBdt,
        })
      }
      open={open}
      pending={selling.isPending}
      ready={ready}
      submitLabel={t("ventures.sellInternally")}
      title={t("ventures.sellInternally")}
    >
      <FormField id="internal-tag" label={t("ventures.whichAnimal")}>
        <Input
          autoComplete="off"
          id="internal-tag"
          onChange={(event) => setTagNumber(event.target.value.toUpperCase())}
          value={tagNumber}
        />
      </FormField>
      <FormField
        hint={t("ventures.toPurseHint")}
        id="internal-to"
        label={t("ventures.toPurse")}
      >
        <NativeSelect
          id="internal-to"
          onChange={(event) => setToVentureId(event.target.value)}
          value={toVentureId}
        >
          <option value="">{t("intake.theFarms")}</option>
          {(ventures.data ?? []).map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          hint={t("ventures.rateHint")}
          id="internal-rate"
          label={t("ventures.rate")}
        >
          <Input
            id="internal-rate"
            inputMode="numeric"
            onChange={(event) => setRate(event.target.value)}
            type="number"
            value={rate}
          />
        </FormField>
        <FormField id="internal-sold-on" label={t("ventures.soldOn")}>
          <Input
            id="internal-sold-on"
            onChange={(event) => setSoldOn(event.target.value)}
            type="date"
            value={soldOn}
          />
        </FormField>
      </div>
      {weightKg === 0 ? null : (
        <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm tabular-nums">
          {t("ventures.priceFromWeight", {
            weight: formatNumber(weightKg, language),
            price: formatNumber(priceBdt, language),
          })}
        </p>
      )}
      <FormField
        hint={t("ventures.referenceHint")}
        id="internal-reference"
        label={t("ventures.reference")}
      >
        <Input
          autoComplete="off"
          id="internal-reference"
          onChange={(event) => setReference(event.target.value)}
          value={reference}
        />
      </FormField>
      <FormField
        hint={t("ventures.whereTheRateCameFromHint")}
        id="internal-note"
        label={t("ventures.whereTheRateCameFrom")}
      >
        <Textarea
          id="internal-note"
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          value={note}
        />
      </FormField>
    </FormSheet>
  );
};
