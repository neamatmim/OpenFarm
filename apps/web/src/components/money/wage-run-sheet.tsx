import type { PaymentMethod, WageRunRow } from "@OpenFarm/domain";
import { farmDayOf, monthBefore } from "@OpenFarm/domain";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { WageMonth } from "@/components/money-entry";
import { EmptyState } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { paidNowOf, wagesToSend } from "@/lib/wage-run";
import { orpc } from "@/utils/orpc";

/** What a row says under the person's name: entered already, the draws coming off, or last month's wage. */
const RowSaid = ({ row, typed }: { row: WageRunRow; typed: string }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const owed = row.drawsTakenMoney + row.drawsLeftMoney;
  if (row.paid) {
    return t("wageRun.alreadyPaid");
  }
  if (owed > 0) {
    return t("wageRun.lessDraws", {
      draws: asMoney(owed),
      now: asMoney(paidNowOf(row, typed)),
    });
  }
  return t("wageRun.lastMonth", { amount: asMoney(row.wageMoney) });
};

/**
 * A month's wages paid at once: everybody paid the month before, at that wage, ticked unless this month's is entered
 * already, each wage put right where it changed, and saved together — every one still a wage of its own, the person's
 * draws taken off it as payday always takes them. Cash from the writer's own hand, or by the method chosen.
 */
export const WageRunSheet = ({
  open,
  onOpenChange,
  month: startMonth,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The month the wages pay for; the month before this one where nothing says. */
  month?: string;
}) => {
  const { t } = useLanguage();
  const onError = useRefused();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(
    () => startMonth ?? monthBefore(farmDayOf(new Date()))
  );
  const [paidOn, setPaidOn] = useState(() => farmDayOf(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [typed, setTyped] = useState<Record<string, string>>({});
  const run = useQuery({
    ...orpc.money.wageRun.queryOptions({ input: { month } }),
    enabled: open && month !== "",
  });
  const rows = run.data?.rows ?? [];
  const ticked = new Set(
    rows.flatMap((row) =>
      row.paid || unticked.has(row.personId) ? [] : [row.personId]
    )
  );
  const sending = wagesToSend(rows, { ticked, typed });
  const pay = useMutation(
    orpc.money.payWages.mutationOptions({
      onSuccess: async (paid) => {
        toast.success(t("wageRun.paid", { count: paid.ids.length }));
        setTyped({});
        setUnticked(new Set());
        await queryClient.invalidateQueries();
        onOpenChange(false);
      },
      onError,
    })
  );
  const toggle = (personId: string, on: boolean) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (on) {
        next.delete(personId);
      } else {
        next.add(personId);
      }
      return next;
    });

  return (
    <FormSheet
      description={t("wageRun.hint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        pay.mutate({
          month,
          occurredOn: paidOn,
          paymentMethod,
          wages: sending,
        })
      }
      open={open}
      pending={pay.isPending}
      ready={sending.length > 0}
      submitLabel={t("wageRun.save", { count: sending.length })}
      title={t("wageRun.title")}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <WageMonth
          onChange={(next) => {
            setMonth(next);
            setTyped({});
            setUnticked(new Set());
          }}
          value={month}
        />
        <FormField id="wage-run-on" label={t("byHand.on")}>
          <Input
            id="wage-run-on"
            onChange={(event) => setPaidOn(event.target.value)}
            required
            type="date"
            value={paidOn}
          />
        </FormField>
        <PaymentMethodField
          id="wage-run-paid-by"
          onChange={setPaymentMethod}
          value={paymentMethod}
        />
      </div>

      {run.data ? null : <Skeleton className="h-40 rounded-xl" />}
      {run.data && rows.length === 0 ? (
        <EmptyState title={t("wageRun.nobody")} />
      ) : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {rows.map((row) => {
            const typedWage = typed[row.personId] ?? "";
            return (
              <li
                className="grid grid-cols-[auto_1fr_8rem] items-center gap-3 px-3 py-2"
                key={row.personId}
              >
                <Checkbox
                  aria-label={row.name}
                  checked={ticked.has(row.personId)}
                  disabled={row.paid}
                  onCheckedChange={(on) => toggle(row.personId, on)}
                />
                <div className="flex min-w-0 flex-col">
                  <Label className="truncate">{row.name}</Label>
                  <span className="text-muted-foreground text-xs">
                    <RowSaid row={row} typed={typedWage} />
                  </span>
                </div>
                <Input
                  aria-label={t("wageRun.wageOf", { name: row.name })}
                  disabled={row.paid}
                  inputMode="numeric"
                  min={0}
                  onChange={(event) =>
                    setTyped((current) => ({
                      ...current,
                      [row.personId]: event.target.value,
                    }))
                  }
                  type="number"
                  value={typed[row.personId] ?? String(row.wageMoney)}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </FormSheet>
  );
};
