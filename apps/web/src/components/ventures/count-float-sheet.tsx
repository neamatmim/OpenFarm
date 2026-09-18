import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/**
 * The Float counted when the trip comes home.
 *
 * The sheet works the sum out as the Owner types, because the refusal it would otherwise meet is a
 * number she would have to do the arithmetic to understand: what went out, less the animals and the
 * outing's costs, is what should be in her hand to deposit.
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
  const queryClient = useQueryClient();
  const [buyingTripId, setBuyingTripId] = useState("");
  const [cashBack, setCashBack] = useState("");
  const [movedOn, setMovedOn] = useState("");
  const [reference, setReference] = useState("");
  const trips = useQuery(orpc.trips.list.queryOptions());
  const counting = useMutation(
    orpc.ventures.reconcileFloat.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async () => {
        setBuyingTripId("");
        setCashBack("");
        setMovedOn("");
        setReference("");
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.ventures.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.trips.key() });
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
  const bought = chosen?.float?.boughtBdt ?? 0;
  const went = chosen?.float?.amountBdt ?? 0;
  const shouldBeBack = went - bought;
  const cash = Number(cashBack);
  const balances = Math.abs(cash - shouldBeBack) < 0.01;
  const ready =
    buyingTripId !== "" &&
    balances &&
    (cash === 0 || (movedOn !== "" && reference.trim() !== ""));
  return (
    <FormSheet
      description={t("ventures.countFloatHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        counting.mutate({
          buyingTripId,
          cashBackBdt: cash,
          movedOn: movedOn || undefined,
          reference: reference || undefined,
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
              {`${one.wentTo} · ${formatDate(one.wentOn, language, "date")} · ৳${formatNumber(
                one.float?.amountBdt ?? 0,
                language
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
