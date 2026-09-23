import type { PaymentMethod } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Section } from "@/components/page";
import { FormField } from "@/components/page-kit";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

interface Day {
  wentTo: string;
  transportBdt: string;
  keepBdt: string;
}

const NOTHING_YET: Day = {
  wentTo: "",
  transportBdt: "",
  keepBdt: "",
};

const orNothing = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

/**
 * The day at the haat written up: where the lorry went, what the day cost, and every Animal that stood on
 * it. Who was taken is ticked here rather than read back from who sold — the ones that came home again paid
 * for their place too, and that is the whole point of writing it down.
 */
export const SellingTripForm = () => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [day, setDay] = useState<Day>(NOTHING_YET);
  const [taken, setTaken] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const trips = useQuery(orpc.sellingTrips.list.queryOptions());
  // Every beast on the Fattening side, not only the ones already flagged Ready: at Eid the lorry takes
  // whoever is worth taking, and the day is often written up after they have sold.
  const board = useQuery(orpc.fattening.board.queryOptions({ input: {} }));
  const record = useMutation(
    orpc.sellingTrips.record.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setDay(NOTHING_YET);
        setTaken([]);
        toast.success(t("selling.tripRecorded"));
      },
    })
  );
  const ready = day.wentTo.trim() !== "" && taken.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <Section
        description={t("selling.tripHint")}
        id="selling-trip"
        title={t("selling.trip")}
      >
        <FormField id="selling-went-to" label={t("selling.wentTo")}>
          <Input
            autoComplete="off"
            id="selling-went-to"
            onChange={(event) => setDay({ ...day, wentTo: event.target.value })}
            value={day.wentTo}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["selling-transport", "selling.transport", "transportBdt"],
              ["selling-keep", "selling.keep", "keepBdt"],
            ] as const
          ).map(([id, label, key]) => (
            <FormField id={id} key={id} label={t(label)}>
              <Input
                autoComplete="off"
                id={id}
                inputMode="numeric"
                onChange={(event) =>
                  setDay({ ...day, [key]: event.target.value })
                }
                type="number"
                value={day[key]}
              />
            </FormField>
          ))}
        </div>
        <PaymentMethodField
          id="selling-payment"
          onChange={setPaymentMethod}
          value={paymentMethod}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            {t("selling.whoWent")}
          </legend>
          {(board.data ?? []).map((one) => (
            <label
              className="flex items-center gap-2 text-sm"
              htmlFor={`took-${one.tagNumber}`}
              key={one.tagNumber}
            >
              <Checkbox
                checked={taken.includes(one.tagNumber)}
                id={`took-${one.tagNumber}`}
                onCheckedChange={(checked) =>
                  setTaken(
                    checked
                      ? [...taken, one.tagNumber]
                      : taken.filter((each) => each !== one.tagNumber)
                  )
                }
              />
              {one.tagNumber}
            </label>
          ))}
        </fieldset>

        <Button
          disabled={!ready || record.isPending}
          onClick={() =>
            record.mutate({
              wentTo: day.wentTo,
              transportBdt: orNothing(day.transportBdt),
              keepBdt: orNothing(day.keepBdt),
              animals: taken,
              paymentMethod,
            })
          }
          type="button"
        >
          {t("selling.recordTrip")}
        </Button>
      </Section>

      {(trips.data ?? []).length > 0 ? (
        <Section id="selling-trips-past" title={t("selling.pastTrips")}>
          {(trips.data ?? []).map((one) => (
            <div
              className="border-border/60 flex justify-between gap-2 border-b py-2 text-sm last:border-b-0"
              key={one.id}
            >
              <span>
                {one.wentTo} · {formatDate(one.wentOn, language, "date")}
              </span>
              <span className="tabular-nums">
                {t("selling.tookAnimals", {
                  count: formatNumber(one.animals, language),
                })}{" "}
                · ৳{formatNumber(one.costBdt, language)}
              </span>
            </div>
          ))}
        </Section>
      ) : null}
    </div>
  );
};
