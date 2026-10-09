import type { PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { useState } from "react";

import { Loaded, Section, TagChip } from "@/components/page";
import { ChoiceCard, FormField } from "@/components/page-kit";
import type { AccountTyped } from "@/components/payment-method";
import {
  accountSent,
  NO_ACCOUNT,
  PaymentMethodField,
} from "@/components/payment-method";
import { SellingTripCorrection } from "@/components/trips/trip-corrections";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

interface Day {
  wentTo: string;
  transportMoney: string;
  keepMoney: string;
}

const NOTHING_YET: Day = {
  wentTo: "",
  transportMoney: "",
  keepMoney: "",
};

const orNothing = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

type Beast = Awaited<
  ReturnType<typeof orpc.sellingTrips.whoCouldHaveGone.call>
>[number];

/** The day the lorry went, as the server takes it: nothing for today, which it reads as now, and the first moment of
 *  an earlier day — before anything sold off the lorry that day, so her share of it is charged while she was here. */
const wentOnOf = (day: string, today: string): Date | undefined =>
  day === today ? undefined : startOfFarmDay(day);

/** The beasts pen by pen, since a lorry is loaded a pen at a time, and the ones sold that day together under their own
 *  heading, gone from their pens by now. */
const penByPen = (
  offered: Beast[],
  heading: { sold: string; noPen: string }
): [string, Beast[]][] => {
  const pens = new Map<string, Beast[]>();
  for (const one of offered) {
    const pen = one.soldThatDay ? heading.sold : (one.penName ?? heading.noPen);
    pens.set(pen, [...(pens.get(pen) ?? []), one]);
  }
  return [...pens];
};

/** One animal to tick, as a tile: her tag, and a mark when the Manager has already confirmed her Ready. */
const BeastTile = ({
  one,
  taken,
  onTaken,
}: {
  one: Beast;
  taken: boolean;
  onTaken: (taken: boolean) => void;
}) => {
  const { t } = useLanguage();
  return (
    <ChoiceCard htmlFor={`took-${one.tagNumber}`}>
      <Checkbox
        checked={taken}
        id={`took-${one.tagNumber}`}
        onCheckedChange={onTaken}
      />
      <TagChip>{one.tagNumber}</TagChip>
      {one.ready ? (
        <span className="text-success ms-auto flex">
          <CircleCheck aria-hidden className="size-3.5" />
          <span className="sr-only">{t("state.ready_for_sale")}</span>
        </span>
      ) : null}
    </ChoiceCard>
  );
};

/** The button over a group: a whole pen taken or left, or every beast sold that day, who are in no pen now. */
const WHOLE_GROUP_WORD = {
  false: { false: "selling.takePen", true: "selling.leavePen" },
  true: { false: "selling.takeAllSold", true: "selling.leaveAllSold" },
} as const;

/** Who went, pen by pen as tiles, with a button to take — or leave — a whole pen at once. */
const WhoWent = ({
  offered,
  taken,
  onTaken,
}: {
  offered: Beast[];
  taken: string[];
  onTaken: (taken: string[]) => void;
}) => {
  const { t } = useLanguage();
  const soldHeading = t("selling.soldThatDay");
  if (offered.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("selling.nobodyToTake")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {penByPen(offered, {
        sold: soldHeading,
        noPen: t("selling.noPen"),
      }).map(([pen, beasts]) => {
        const tags = beasts.map((one) => one.tagNumber);
        const whole = tags.every((tag) => taken.includes(tag));
        return (
          <div className="flex flex-col gap-2" key={pen}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                {pen}
              </span>
              <Button
                onClick={() =>
                  onTaken(
                    whole
                      ? taken.filter((tag) => !tags.includes(tag))
                      : [
                          ...taken,
                          ...tags.filter((tag) => !taken.includes(tag)),
                        ]
                  )
                }
                size="xs"
                type="button"
                variant="ghost"
              >
                {t(WHOLE_GROUP_WORD[`${pen === soldHeading}`][`${whole}`])}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
              {beasts.map((one) => (
                <BeastTile
                  key={one.tagNumber}
                  onTaken={(checked) =>
                    onTaken(
                      checked
                        ? [...taken, one.tagNumber]
                        : taken.filter((each) => each !== one.tagNumber)
                    )
                  }
                  one={one}
                  taken={taken.includes(one.tagNumber)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * The day at the livestock market written up: where the lorry went, what the day cost, and every Animal that stood on
 * it. Who was taken is ticked here rather than read back from who sold — the ones that came home again paid
 * for their place too, and that is the whole point of writing it down.
 */
export const SellingTripForm = () => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const asMoney = useMoney();
  const [day, setDay] = useState<Day>(NOTHING_YET);
  const today = farmDayOf(new Date());
  const [wentOnDay, setWentOnDay] = useState(today);
  const [taken, setTaken] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [account, setAccount] = useState<AccountTyped>(NO_ACCOUNT);
  const trips = useQuery(orpc.sellingTrips.list.queryOptions());
  // Every beast on the Fattening side, not only the ones already flagged Ready: at Eid the lorry takes
  // whoever is worth taking. And the ones sold that day, since the day is often written up after they have sold.
  const wentOn = wentOnOf(wentOnDay, today);
  const offered = useQuery(
    orpc.sellingTrips.whoCouldHaveGone.queryOptions({
      input: { wentOn: startOfFarmDay(wentOnDay) },
    })
  );
  const record = useMutation(
    orpc.sellingTrips.record.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setDay(NOTHING_YET);
        setWentOnDay(farmDayOf(new Date()));
        setTaken([]);
        toast.success(t("selling.tripRecorded"));
      },
    })
  );
  const ready = day.wentTo.trim() !== "" && taken.length > 0;
  const past = trips.data ?? [];
  return (
    <div
      className={cn(
        "grid items-start gap-4",
        past.length > 0 && "xl:grid-cols-[minmax(0,1fr)_22rem]"
      )}
    >
      <Section
        description={t("selling.tripHint")}
        id="selling-trip"
        title={t("selling.trip")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="selling-went-to" label={t("selling.wentTo")}>
            <Input
              autoComplete="off"
              id="selling-went-to"
              onChange={(event) =>
                setDay({ ...day, wentTo: event.target.value })
              }
              value={day.wentTo}
            />
          </FormField>
          <FormField id="selling-went-on" label={t("selling.wentOn")}>
            <Input
              id="selling-went-on"
              max={today}
              onChange={(event) => {
                setWentOnDay(event.target.value || today);
                // Another day is another lorry: who was ticked for the last one was not necessarily on it.
                setTaken([]);
              }}
              required
              type="date"
              value={wentOnDay}
            />
          </FormField>
          <PaymentMethodField
            account={{ typed: account, onChange: setAccount }}
            id="selling-payment"
            onChange={setPaymentMethod}
            value={paymentMethod}
          />
          {(
            [
              ["selling-transport", "selling.transport", "transportMoney"],
              ["selling-keep", "selling.keep", "keepMoney"],
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

        <fieldset className="flex flex-col gap-3 border-t pt-4">
          <legend className="float-left mb-3 flex w-full items-baseline justify-between gap-2 text-sm font-medium">
            {t("selling.whoWent")}
            <span className="text-muted-foreground font-normal tabular-nums">
              {t("selling.chosen", {
                count: formatNumber(taken.length, language),
              })}
            </span>
          </legend>
          <Loaded
            query={offered}
            skeleton={<Skeleton className="h-16 rounded-xl" />}
          >
            <WhoWent
              offered={offered.data ?? []}
              onTaken={setTaken}
              taken={taken}
            />
          </Loaded>
        </fieldset>

        <div className="flex justify-end border-t pt-4">
          <Button
            disabled={!ready || record.isPending}
            onClick={() =>
              record.mutate({
                wentTo: day.wentTo,
                transportMoney: orNothing(day.transportMoney),
                keepMoney: orNothing(day.keepMoney),
                animals: taken,
                wentOn,
                paymentMethod,
                ...accountSent(paymentMethod, account),
              })
            }
            type="button"
          >
            {t("selling.recordTrip")}
          </Button>
        </div>
      </Section>

      {past.length > 0 ? (
        <Section id="selling-trips-past" title={t("selling.pastTrips")}>
          <ul className="flex flex-col">
            {past.map((one) => (
              <li
                className="border-border/60 flex items-start justify-between gap-3 border-b py-2.5 text-sm first:pt-0 last:border-b-0 last:pb-0"
                key={one.id}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{one.wentTo}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatDate(one.wentOn, language, "date")}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-0.5 whitespace-nowrap tabular-nums">
                  <span className="font-medium">{asMoney(one.costMoney)}</span>
                  <span className="text-muted-foreground text-xs">
                    {t("selling.tookAnimals", {
                      count: formatNumber(one.animals, language),
                    })}
                  </span>
                  {/* What those sold off it lost on the way, together; an answer kept from before has none. */}
                  {one.shrink ? (
                    <span className="text-muted-foreground text-xs">
                      {t("selling.shrink", {
                        percent: formatNumber(one.shrink.percent, language),
                        kg: formatNumber(one.shrink.lostKg, language),
                      })}
                    </span>
                  ) : null}
                  {/* Put right part by part; an answer kept from before the parts were listed has none to show. */}
                  {one.parts ? (
                    <SellingTripCorrection
                      trip={{ ...one, parts: one.parts }}
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
};
