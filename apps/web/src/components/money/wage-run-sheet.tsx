import type { WageRunRow } from "@OpenFarm/domain";
import { farmDayOf, monthBefore } from "@OpenFarm/domain";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { WageMonth } from "@/components/money-entry";
import { EmptyState, Notice } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { WhoseHandField } from "@/components/whose-hand";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { drawsOffOf, paidNowOf, wagesToSend } from "@/lib/wage-run";
import { orpc } from "@/utils/orpc";

/**
 * What a row says under the person's name: entered already; not paid, its box emptied; what payday takes off the draws
 * — never more than the wage — what stays owed after, and what is paid now; or last month's wage.
 */
const RowSaid = ({
  row,
  typed,
}: {
  row: WageRunRow;
  typed: string | undefined;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  if (row.paid) {
    return t("wageRun.alreadyPaid");
  }
  const now = paidNowOf(row, typed);
  const draws = drawsOffOf(row, typed);
  if (now === 0 && draws.takenMoney === 0) {
    return t("wageRun.notPaid");
  }
  if (draws.takenMoney > 0 || draws.leftMoney > 0) {
    const off = t("wageRun.lessDraws", {
      taken: asMoney(draws.takenMoney),
      now: asMoney(now),
    });
    return draws.leftMoney > 0
      ? `${off} ${t("wageRun.drawsLeft", { left: asMoney(draws.leftMoney) })}`
      : off;
  }
  return t("wageRun.lastMonth", { amount: asMoney(row.wageMoney) });
};

/**
 * A month's wages paid at once: everybody paid the month before, at that wage, ticked unless this month's is entered
 * already, each wage put right where it changed, and saved together — every one still a wage of its own, the person's
 * draws taken off it as payday always takes them. Paid in cash, out of the writer's hand or the one the Owner names; a
 * wage sent by bank or mobile money is entered on its own, with its transaction ID.
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
  // Whose hand the cash comes out of, where the Owner writes up somebody else's payday: the writer's where none is chosen.
  const [heldBy, setHeldBy] = useState("");
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  // By person, the box as typed — only once it is touched; an untouched box stands at last month's wage.
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
          ...(heldBy ? { heldBy } : {}),
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
        <WhoseHandField
          id="wage-run-whose-hand"
          onChange={setHeldBy}
          value={heldBy}
        />
      </div>
      <Notice title={t("wageRun.cashOnly")} tone="info" />

      {run.data ? null : <Skeleton className="h-40 rounded-xl" />}
      {run.data && rows.length === 0 ? (
        <EmptyState title={t("wageRun.nobody")} />
      ) : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {rows.map((row) => (
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
                  <RowSaid row={row} typed={typed[row.personId]} />
                </span>
              </div>
              {/* Text, not a number box: a wage typed in Bangla digits is read (`figureOf`). */}
              <Input
                aria-label={t("wageRun.wageOf", { name: row.name })}
                disabled={row.paid}
                inputMode="numeric"
                onChange={(event) =>
                  setTyped((current) => ({
                    ...current,
                    [row.personId]: event.target.value,
                  }))
                }
                value={typed[row.personId] ?? String(row.wageMoney)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </FormSheet>
  );
};
