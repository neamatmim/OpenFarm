import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet } from "@/components/page-kit";
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
 * beyond the beasts themselves. Recorded from the intake form because this is where the Manager stands when he
 * comes home, but in a sheet of its own and only when asked for — most arrivals come on an outing already written
 * up, or on none. Once recorded, the arrival being written up is put on it.
 */
export const BuyingTripSheet = ({
  open,
  onOpenChange,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: (tripId: string) => void;
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
        onOpenChange(false);
        // The arrival being written up came home on it; the ones after pick it from the list.
        await queryClient.invalidateQueries({ queryKey: orpc.trips.key() });
        onRecorded(made.id);
        toast.success(t("intake.tripRecorded"));
      },
    })
  );
  return (
    <FormSheet
      description={t("intake.groupTripHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        record.mutate({
          wentTo: outing.wentTo,
          brokerBdt: orNothing(outing.brokerBdt),
          transportBdt: orNothing(outing.transportBdt),
          keepBdt: orNothing(outing.keepBdt),
          paymentMethod,
        })
      }
      open={open}
      pending={record.isPending}
      ready={outing.wentTo.trim() !== ""}
      submitLabel={t("intake.recordTrip")}
      title={t("intake.groupTrip")}
    >
      <FormField id="trip-haat" label={t("intake.tripHaat")}>
        <Input
          autoComplete="off"
          id="trip-haat"
          onChange={(event) =>
            setOuting({ ...outing, wentTo: event.target.value })
          }
          required
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
    </FormSheet>
  );
};
