import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Section } from "@/components/page";
import { FormField } from "@/components/page-kit";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

import type { IntakeFields } from "./intake-fields";
import { orNothing } from "./intake-fields";

interface Outing {
  wentTo: string;
  brokerBdt: string;
  transportBdt: string;
  keepBdt: string;
}

const NOTHING_YET: Outing = {
  wentTo: "",
  brokerBdt: "",
  transportBdt: "",
  keepBdt: "",
};

/**
 * The outing written up once, when the first of its animals is: where the lorry went and what the day cost
 * beyond the beasts themselves. Recorded here because this is where the Manager stands when he comes home —
 * and the arrivals that follow pick it from the list rather than typing it again.
 */
export const BuyingTripForm = ({
  fields,
  onEdit,
}: {
  fields: IntakeFields;
  onEdit: (patch: Partial<IntakeFields>) => void;
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [outing, setOuting] = useState<Outing>(NOTHING_YET);
  const [paymentMethod, setPaymentMethod] =
    useState<IntakeFields["paymentMethod"]>("cash");
  const record = useMutation(
    orpc.trips.record.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async (made) => {
        setOuting(NOTHING_YET);
        // The arrival being written up came home on it; the ones after pick it from the list.
        onEdit({ buyingTripId: made.id });
        await queryClient.invalidateQueries({ queryKey: orpc.trips.key() });
        toast.success(t("intake.tripRecorded"));
      },
    })
  );
  const ready = outing.wentTo.trim() !== "";
  return (
    <Section
      description={t("intake.groupTripHint")}
      id="intake-trip-part"
      title={t("intake.groupTrip")}
    >
      <FormField id="trip-haat" label={t("intake.tripHaat")}>
        <Input
          autoComplete="off"
          id="trip-haat"
          onChange={(event) =>
            setOuting({ ...outing, wentTo: event.target.value })
          }
          value={outing.wentTo}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ["trip-broker", "intake.tripBroker", "brokerBdt"],
            ["trip-transport", "intake.tripTransport", "transportBdt"],
            ["trip-keep", "intake.tripKeep", "keepBdt"],
          ] as const
        ).map(([id, label, key]) => (
          <FormField id={id} key={id} label={t(label)}>
            <Input
              autoComplete="off"
              id={id}
              inputMode="numeric"
              onChange={(event) =>
                setOuting({ ...outing, [key]: event.target.value })
              }
              type="number"
              value={outing[key]}
            />
          </FormField>
        ))}
      </div>
      <PaymentMethodField
        id="trip-payment"
        onChange={setPaymentMethod}
        value={paymentMethod}
      />
      <Button
        disabled={!ready || record.isPending}
        onClick={() =>
          record.mutate({
            wentTo: outing.wentTo,
            brokerBdt: orNothing(outing.brokerBdt),
            transportBdt: orNothing(outing.transportBdt),
            keepBdt: orNothing(outing.keepBdt),
            paymentMethod,
          })
        }
        type="button"
        variant="secondary"
      >
        {t("intake.recordTrip")}
      </Button>
      {fields.buyingTripId === "" ? null : (
        <p className="text-muted-foreground text-xs">
          {t("intake.tripChosen")}
        </p>
      )}
    </Section>
  );
};
