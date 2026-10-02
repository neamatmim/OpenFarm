import { farmDayOf, weighedTooLongAgo } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { TagLink } from "@/components/fattening/fattening-words";
import {
  NEXT_EID,
  WindowChoice,
  windowOf,
  windowReady,
} from "@/components/fattening/window-choice";
import type { WindowPick } from "@/components/fattening/window-choice";
import { Notice } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { FarmAccountField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { allTyped } from "@/lib/all-typed";
import { useFreshFor } from "@/lib/fresh-for";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

/** One Animal still held, as the sheet lists her: her last weight, and when, where she has been weighed. */
interface Left {
  tagNumber: string;
  weightKg: number | null;
  /** Missing from an answer cached before the day was sent: read as weighed lately, and the server judges. */
  weighedAt?: Date | string | null;
}

/** Whether her last weighing is too old to price on, on the day being typed. */
const tooOld = (one: Left, day: string, days: number): boolean =>
  Boolean(one.weighedAt) &&
  weighedTooLongAgo(new Date(one.weighedAt ?? 0), day, days) !== null;

/**
 * Every Animal the Venture still holds, with what she last weighed, when, and what that comes to at the rate
 * being typed — so the Owner sees each price and the total before she commits, rather than reading them
 * off a receipt afterwards. An Animal nobody has weighed is said to be unweighed here, and one weighed too long
 * ago is marked, while there is still time to put her on the scale.
 */
const WhatIsLeft = ({
  animals,
  rate,
  stale,
}: {
  animals: readonly Left[];
  rate: number;
  stale: (one: Left) => boolean;
}) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const priced = Number.isNaN(rate) ? 0 : rate;
  const total = animals.reduce(
    (sum, one) => sum + Math.round((one.weightKg ?? 0) * priced),
    0
  );
  return (
    <div className="bg-muted flex flex-col gap-1 rounded-md px-3 py-2 text-sm">
      {animals.map((one) => (
        <div className="flex justify-between gap-2" key={one.tagNumber}>
          <TagLink tagNumber={one.tagNumber} />
          <span className={cn("tabular-nums", stale(one) && "text-warning")}>
            {one.weightKg === null
              ? t("ventures.neverWeighed")
              : [
                  formatNumber(one.weightKg, language),
                  one.weighedAt
                    ? t("ventures.weighedOnDay", {
                        day: formatDate(
                          new Date(one.weighedAt),
                          language,
                          "date"
                        ),
                      })
                    : "",
                  taka(one.weightKg * priced),
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-2 border-t pt-1 font-medium">
        <span>{t("ventures.total")}</span>
        <span className="tabular-nums">{taka(total)}</span>
      </div>
    </div>
  );
};

/** The fortnightly round, for an answer cached before the Owner's days were sent with it. */
const DEFAULT_PRICE_WEIGH_IN_DAYS = 14;

/**
 * Which of them must go on the scale before the buy-back: none may be priced on a weighing older than the Owner's
 * days, judged on the day being typed — today until one is. The server judges again on the day sent.
 */
const weighFirstOf = (
  left: { animals: readonly Left[]; priceWeighInDays?: number } | undefined,
  boughtOn: string
) => {
  const days = left?.priceWeighInDays ?? DEFAULT_PRICE_WEIGH_IN_DAYS;
  const judgedOn = boughtOn || farmDayOf(new Date());
  const isStale = (one: Left) => tooOld(one, judgedOn, days);
  const animals = left?.animals ?? [];
  const stale = animals.filter(isStale);
  return {
    days,
    isStale,
    stale,
    weighFirst: [
      ...animals.filter((one) => one.weightKg === null),
      ...stale,
    ].map((one) => one.tagNumber),
  };
};

/** Said while there is still time: those nobody has weighed, and those weighed too long ago to price on. */
const WeighFirst = ({
  unweighed,
  stale,
  days,
}: {
  unweighed: readonly Left[];
  stale: readonly Left[];
  days: number;
}) => {
  const { t, language } = useLanguage();
  return (
    <>
      {unweighed.length === 0 ? null : (
        <Notice
          title={t("ventures.weighThemFirst", {
            tags: unweighed.map((one) => one.tagNumber).join(", "),
          })}
          tone="warning"
        />
      )}
      {stale.length === 0 ? null : (
        <Notice
          title={t("ventures.weighThemAgain", {
            tags: stale.map((one) => one.tagNumber).join(", "),
            days: formatNumber(days, language),
          })}
          tone="warning"
        />
      )}
    </>
  );
};

/** A rate typed, and a number other than nought. */
const aRate = (typed: string, rate: number): boolean =>
  typed !== "" && !Number.isNaN(rate) && rate !== 0;

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
  const refused = useRefused();
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
  // The Farm's bank account its own side of this went into or came out of.
  const [farmAccountId, setFarmAccountId] = useState("");
  // The one Season every animal the Farm takes joins: the next Eid unless another window is said.
  const [windowPick, setWindowPick] = useState<WindowPick>(NEXT_EID);
  useFreshFor(venture?.id, () => {
    setRate("");
    setNote("");
    setBoughtOn("");
    setReference("");
  });
  const buying = useMutation(
    orpc.ventures.buyWhatIsLeft.mutationOptions({
      onError: refused,
      onSuccess: (done) => {
        setRate("");
        setNote("");
        setBoughtOn("");
        setReference("");
        onOpenChange(false);
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
  // The farm strikes no price it cannot defend: an Animal nobody has weighed has none, and the server
  // refuses the whole act over one of them. Said and stopped here rather than after she has typed a
  // rate, a reason, a day and a bank reference for nothing — the sheet has known since it opened.
  const unweighed = (left.data?.animals ?? []).filter(
    (one) => one.weightKg === null
  );
  const { days, isStale, stale, weighFirst } = weighFirstOf(
    left.data,
    boughtOn
  );
  const ready =
    venture !== null &&
    weighFirst.length === 0 &&
    aRate(rate, rateBdtPerKg) &&
    allTyped(note, boughtOn, reference) &&
    windowReady(windowPick);
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
          ...(farmAccountId ? { farmAccountId } : {}),
          targetWindow: windowOf(windowPick),
        })
      }
      missing={
        weighFirst.length === 0
          ? undefined
          : {
              said: t("ventures.weighThemFirst", {
                tags: weighFirst.join(", "),
              }),
              at: "wind-up-rate",
            }
      }
      open={open}
      pending={buying.isPending}
      ready={ready}
      submitLabel={t("ventures.buyWhatIsLeft")}
      title={t("ventures.buyWhatIsLeft")}
    >
      <WhatIsLeft
        animals={left.data?.animals ?? []}
        rate={rateBdtPerKg}
        stale={isStale}
      />
      <WeighFirst days={days} stale={stale} unweighed={unweighed} />
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
        <FarmAccountField
          id="wind-up-reference-account"
          kind="bank"
          onChange={setFarmAccountId}
          value={farmAccountId}
        />
        <FormField id="wind-up-reference" label={t("ventures.reference")}>
          <Input
            autoComplete="off"
            id="wind-up-reference"
            onChange={(event) => setReference(event.target.value)}
            value={reference}
          />
        </FormField>
      </div>
      <WindowChoice
        id="wind-up-season"
        onPick={setWindowPick}
        pick={windowPick}
      />
    </FormSheet>
  );
};
