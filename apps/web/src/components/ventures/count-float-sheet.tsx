import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import { useMoney } from "@/lib/money";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** The Float's sum as the Owner types: what went out, what it bought, what should be back, and how far what she typed
 *  is from it — short positive, as notes that should have come home and did not. */
const floatSumOf = (
  float: { amountMoney: number; boughtMoney: number } | null,
  cashBack: string
) => {
  const went = float?.amountMoney ?? 0;
  const bought = float?.boughtMoney ?? 0;
  const shouldBeBack = went - bought;
  const cash = Number(cashBack);
  const short = shouldBeBack - cash;
  return {
    went,
    bought,
    shouldBeBack,
    cash,
    balances: Math.abs(short) < 0.01,
    short,
  };
};

/** Why a Float does not balance, asked with how far it is out and which way. */
const WhyItDiffers = ({
  short,
  why,
  onChange,
}: {
  short: number;
  why: string;
  onChange: (why: string) => void;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  return (
    <FormField
      hint={t(short > 0 ? "ventures.floatShort" : "ventures.floatOver", {
        amount: asMoney(Math.abs(short)),
      })}
      id="count-why"
      label={t("ventures.floatWhy")}
    >
      <Input
        autoComplete="off"
        id="count-why"
        maxLength={300}
        onChange={(event) => onChange(event.target.value)}
        value={why}
      />
    </FormField>
  );
};

/**
 * The Float counted when the trip comes home.
 *
 * The sheet works the sum out as the Owner types, because the refusal it would otherwise meet is a
 * number she would have to do the arithmetic to understand: what went out, less the animals and the
 * outing's costs, is what should be in her hand to deposit. One that does not balance says by how much, and is
 * counted home only with why — ৳500 lost on the road, or the Farm's notes added for a dear bull.
 */
export const CountFloatSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  /** Whose Floats these are: the card the Owner opened this from. */
  venture: { id: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const asMoney = useMoney();
  const [buyingTripId, setBuyingTripId] = useState("");
  const [cashBack, setCashBack] = useState("");
  const [movedOn, setMovedOn] = useState("");
  const [reference, setReference] = useState("");
  const [why, setWhy] = useState("");
  useFreshFor(venture?.id, () => {
    setBuyingTripId("");
    setCashBack("");
    setMovedOn("");
    setReference("");
    setWhy("");
  });
  // Every outing still holding this Venture's Float, however long ago it went: the latest twenty would
  // lose an old one, and a Float nobody can pick is one the run can never count home.
  const trips = useQuery({
    ...orpc.buyingTrips.list.queryOptions({
      input: { openFloatsOf: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const counting = useMutation(
    orpc.ventures.floats.reconcile.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setBuyingTripId("");
        setCashBack("");
        setMovedOn("");
        setReference("");
        setWhy("");
        onOpenChange(false);
        toast.success(t("ventures.floatCounted"));
      },
    })
  );
  // This Venture's outings, still out. A Float belongs to the Venture that funded it, and counting one
  // Venture's money home from another's card would be a slip nobody could see.
  const stillOut = (trips.data ?? []).filter(
    (one) =>
      one.float !== null &&
      one.float.reconciledAt === null &&
      one.float.ventureId === venture?.id
  );
  const chosen = stillOut.find((one) => one.id === buyingTripId);
  const { went, bought, shouldBeBack, cash, balances, short } = floatSumOf(
    chosen?.float ?? null,
    cashBack
  );
  const typedCash = cashBack.trim() !== "";
  const saidWhy = why.trim() !== "";
  const ready =
    buyingTripId !== "" &&
    typedCash &&
    (balances || saidWhy) &&
    (cash === 0 || (movedOn !== "" && reference.trim() !== ""));
  return (
    <FormSheet
      description={t("ventures.countFloatHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        counting.mutate({
          buyingTripId,
          cashBackMoney: cash,
          movedOn: movedOn || undefined,
          reference: reference || undefined,
          ...(balances ? {} : { differenceReason: why.trim() }),
        })
      }
      open={open}
      pending={counting.isPending}
      ready={ready}
      submitLabel={t("ventures.countFloat")}
      title={t("ventures.countFloat")}
    >
      <FormField id="count-trip" label={t("ventures.floatTrip")}>
        <NativeSelect
          id="count-trip"
          onChange={(event) => setBuyingTripId(event.target.value)}
          value={buyingTripId}
        >
          <option value="">—</option>
          {stillOut.map((one) => (
            <option key={one.id} value={one.id}>
              {`${one.wentTo} · ${formatDate(one.wentOn, language, "date")} · ${asMoney(
                one.float?.amountMoney ?? 0
              )}`}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {chosen ? (
        <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm tabular-nums">
          {t("ventures.floatSum", {
            went: formatNumber(went, language),
            bought: formatNumber(bought, language),
            back: formatNumber(shouldBeBack, language),
          })}
        </p>
      ) : null}
      <FormField
        hint={t("ventures.cashBackHint")}
        id="count-cash"
        label={t("ventures.cashBack")}
      >
        <Input
          id="count-cash"
          inputMode="numeric"
          onChange={(event) => setCashBack(event.target.value)}
          type="number"
          value={cashBack}
        />
      </FormField>
      {chosen && typedCash && !balances ? (
        <WhyItDiffers onChange={setWhy} short={short} why={why} />
      ) : null}
      {cash === 0 ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="count-moved-on" label={t("ventures.depositedOn")}>
            <Input
              id="count-moved-on"
              onChange={(event) => setMovedOn(event.target.value)}
              type="date"
              value={movedOn}
            />
          </FormField>
          <FormField id="count-reference" label={t("ventures.slip")}>
            <Input
              autoComplete="off"
              id="count-reference"
              onChange={(event) => setReference(event.target.value)}
              value={reference}
            />
          </FormField>
        </div>
      )}
    </FormSheet>
  );
};
