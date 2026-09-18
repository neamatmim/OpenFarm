import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/**
 * Every Animal the Venture still holds, with what she last weighed and what that comes to at the rate
 * being typed — so the Owner sees each price and the total before she commits, rather than reading them
 * off a receipt afterwards. An Animal nobody has weighed is said to be unweighed here, while there is
 * still time to put her on the scale.
 */
const WhatIsLeft = ({
  animals,
  rate,
}: {
  animals: readonly { tagNumber: string; weightKg: number | null }[];
  rate: number;
}) => {
  const { t, language } = useLanguage();
  const priced = Number.isNaN(rate) ? 0 : rate;
  const total = animals.reduce(
    (sum, one) => sum + Math.round((one.weightKg ?? 0) * priced),
    0
  );
  return (
    <div className="bg-muted flex flex-col gap-1 rounded-md px-3 py-2 text-sm">
      {animals.map((one) => (
        <div className="flex justify-between gap-2" key={one.tagNumber}>
          <span className="text-muted-foreground">{one.tagNumber}</span>
          <span className="tabular-nums">
            {one.weightKg === null
              ? t("ventures.neverWeighed")
              : `${formatNumber(one.weightKg, language)} · ৳${formatNumber(
                  Math.round(one.weightKg * priced),
                  language
                )}`}
          </span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-2 border-t pt-1 font-medium">
        <span>{t("ventures.total")}</span>
        <span className="tabular-nums">{`৳${formatNumber(total, language)}`}</span>
      </div>
    </div>
  );
};

/**
 * The buy-back at wind-up: the Farm takes every Animal the Venture still holds, at one rate, on one day.
 *
 * One rate for the lot, because it is one act on one day — each animal's own last weight is what makes
 * her price her own, and the note says where the rate came from, since an Investor asking years later
 * why his bull was worth that is owed a figure and a reason.
 */
export const BuyWhatIsLeftSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string; animalsStanding?: number } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const left = useQuery({
    ...orpc.ventures.whatIsLeft.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const [boughtOn, setBoughtOn] = useState("");
  const [reference, setReference] = useState("");
  const buying = useMutation(
    orpc.ventures.buyWhatIsLeft.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async (done) => {
        setRate("");
        setNote("");
        setBoughtOn("");
        setReference("");
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.ventures.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.money.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.animals.key() });
        toast.success(
          t("ventures.boughtWhatWasLeft", {
            animals: formatNumber(done.animals.length, language),
            total: formatNumber(done.totalBdt, language),
          })
        );
      },
    })
  );
  const rateBdtPerKg = Number(rate);
  const ready =
    venture !== null &&
    rate !== "" &&
    !Number.isNaN(rateBdtPerKg) &&
    rateBdtPerKg !== 0 &&
    note.trim() !== "" &&
    boughtOn !== "" &&
    reference.trim() !== "";
  return (
    <FormSheet
      description={t("ventures.buyWhatIsLeftHint", {
        venture: venture?.name ?? "",
        standing: formatNumber(venture?.animalsStanding ?? 0, language),
      })}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        buying.mutate({
          ventureId: venture?.id ?? "",
          rateBdtPerKg,
          note,
          boughtOn,
          paymentMethod: "bank",
          reference,
        })
      }
      open={open}
      pending={buying.isPending}
      ready={ready}
      submitLabel={t("ventures.buyWhatIsLeft")}
      title={t("ventures.buyWhatIsLeft")}
    >
      <WhatIsLeft animals={left.data?.animals ?? []} rate={rateBdtPerKg} />
      <FormField
        hint={t("ventures.rateHint")}
        id="wind-up-rate"
        label={t("ventures.rate")}
      >
        <Input
          id="wind-up-rate"
          inputMode="numeric"
          onChange={(event) => setRate(event.target.value)}
          type="number"
          value={rate}
        />
      </FormField>
      <FormField
        hint={t("ventures.whereTheRateCameFromHint")}
        id="wind-up-note"
        label={t("ventures.whereTheRateCameFrom")}
      >
        <Textarea
          id="wind-up-note"
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          value={note}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="wind-up-day" label={t("ventures.soldOn")}>
          <Input
            id="wind-up-day"
            onChange={(event) => setBoughtOn(event.target.value)}
            type="date"
            value={boughtOn}
          />
        </FormField>
        <FormField id="wind-up-reference" label={t("ventures.reference")}>
          <Input
            autoComplete="off"
            id="wind-up-reference"
            onChange={(event) => setReference(event.target.value)}
            value={reference}
          />
        </FormField>
      </div>
    </FormSheet>
  );
};
