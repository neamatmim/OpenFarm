import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { FormField, FormSheet } from "@/components/page-kit";
import type { AccountTyped } from "@/components/payment-method";
import {
  accountSent,
  NO_ACCOUNT,
  PaymentMethodField,
} from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import type { IntakeFields } from "./intake-fields";
import { orNothing } from "./intake-fields";

interface Outing {
  wentTo: string;
  brokerMoney: string;
  transportMoney: string;
  keepMoney: string;
}

const NOTHING_YET: Outing = {
  wentTo: "",
  brokerMoney: "",
  transportMoney: "",
  keepMoney: "",
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
  const refused = useRefused();
  const [outing, setOuting] = useState<Outing>(NOTHING_YET);
  const [paymentMethod, setPaymentMethod] =
    useState<IntakeFields["paymentMethod"]>("cash");
  const [account, setAccount] = useState<AccountTyped>(NO_ACCOUNT);
  const today = farmDayOf(new Date());
  // The day the lorry went, written up the next morning as often as not. Today is sent as nothing, which the server
  // reads as now; an earlier day as its first moment, so every beast that came home on it came after it went.
  const [wentOnDay, setWentOnDay] = useState(today);
  const record = useMutation(
    orpc.buyingTrips.record.mutationOptions({
      onError: refused,
      onSuccess: (made) => {
        setOuting(NOTHING_YET);
        setWentOnDay(today);
        onOpenChange(false);
        // The arrival being written up came home on it; the ones after pick it from the list.
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
          ...(wentOnDay === today ? {} : { wentOn: startOfFarmDay(wentOnDay) }),
          brokerMoney: orNothing(outing.brokerMoney),
          transportMoney: orNothing(outing.transportMoney),
          keepMoney: orNothing(outing.keepMoney),
          paymentMethod,
          ...accountSent(paymentMethod, account),
        })
      }
      open={open}
      pending={record.isPending}
      ready={outing.wentTo.trim() !== ""}
      submitLabel={t("intake.recordTrip")}
      title={t("intake.groupTrip")}
    >
      <FormField
        id="trip-livestock-market"
        label={t("intake.tripLivestockMarket")}
      >
        <Input
          autoComplete="off"
          id="trip-livestock-market"
          onChange={(event) =>
            setOuting({ ...outing, wentTo: event.target.value })
          }
          required
          value={outing.wentTo}
        />
      </FormField>
      <FormField id="trip-went-on" label={t("selling.wentOn")}>
        <Input
          id="trip-went-on"
          max={today}
          onChange={(event) => setWentOnDay(event.target.value || today)}
          required
          type="date"
          value={wentOnDay}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ["trip-broker", "intake.tripBroker", "brokerMoney"],
            ["trip-transport", "intake.tripTransport", "transportMoney"],
            ["trip-keep", "intake.tripKeep", "keepMoney"],
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
        account={{ typed: account, onChange: setAccount }}
        id="trip-payment"
        onChange={setPaymentMethod}
        value={paymentMethod}
      />
    </FormSheet>
  );
};
