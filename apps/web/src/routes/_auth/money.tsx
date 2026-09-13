import { farmDayOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { orpc } from "@/utils/orpc";

/** The first of this month on the farm's clock, which is where an Owner starts reading money. */
const firstOfTheMonth = () =>
  `${farmDayOf(new Date()).slice(0, "YYYY-MM".length)}-01`;

const SOURCE_WORD = {
  dispatch: "money.from.dispatch",
  intake: "money.from.intake",
  sale: "money.from.sale",
  feed_in: "money.from.feedIn",
  medicine_purchase: "money.from.medicinePurchase",
  vet_fee: "money.from.vetFee",
} as const satisfies Record<string, MessageKey>;

const METHOD_WORD = {
  cash: "money.method.cash",
  bkash: "money.method.bkash",
  bank: "money.method.bank",
} as const satisfies Record<string, MessageKey>;

/**
 * The farm's money in a period, as its own records made it: what came in, what went out, under what
 * heading, with whom and how it was paid — and, for the Owner, what is waiting for their approval.
 */
const MoneyPage = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const me = useQuery(orpc.people.me.queryOptions());
  const [from, setFrom] = useState(firstOfTheMonth);
  const [to, setTo] = useState(() => farmDayOf(new Date()));
  const money = useQuery(orpc.money.list.queryOptions({ input: { from, to } }));
  const isOwner = me.data?.roles.includes("owner") ?? false;
  const approve = useMutation(
    orpc.money.approve.mutationOptions({
      onSuccess: () =>
        Promise.all(
          [orpc.money.key(), orpc.home.key()].map((key) =>
            queryClient.invalidateQueries({ queryKey: key })
          )
        ),
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  const rows = money.data ?? [];
  const total = (direction: "in" | "out") =>
    rows
      .filter((row) => row.direction === direction)
      .reduce((sum, row) => sum + row.amountBdt, 0);

  return (
    <div className="container mx-auto max-w-2xl space-y-5 px-4 py-6">
      <h1 className="text-lg font-medium">{t("money.title")}</h1>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={t("dispatch.from")}
          className="w-40"
          onChange={(event) => setFrom(event.target.value)}
          type="date"
          value={from}
        />
        <Input
          aria-label={t("dispatch.to")}
          className="w-40"
          onChange={(event) => setTo(event.target.value)}
          type="date"
          value={to}
        />
      </div>
      {money.isError ? (
        <p className="text-sm text-red-400">
          {wordedRefusal(money.error, t) ?? t("common.error")}
        </p>
      ) : null}
      <p className="text-sm">
        {t("money.totals", {
          in: formatNumber(total("in"), language),
          out: formatNumber(total("out"), language),
        })}
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("money.none")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.toReversed().map((row) => (
            <li
              className="flex items-start justify-between gap-2 rounded-lg border p-2 text-sm"
              key={row.id}
            >
              <div>
                <p>
                  {row.direction === "in" ? "+" : "−"}৳
                  {formatNumber(row.amountBdt, language)} ·{" "}
                  {language === "bn"
                    ? row.categoryBn
                    : (row.categoryEn ?? row.categoryBn)}
                  {row.counterpartyName ? ` · ${row.counterpartyName}` : ""}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatDate(row.occurredAt, language)} ·{" "}
                  {t(SOURCE_WORD[row.source])} ·{" "}
                  {t(METHOD_WORD[row.paymentMethod])}
                  {row.approval === "awaiting"
                    ? ` · ${t("money.awaiting")}`
                    : ""}
                  {row.approval === "approved"
                    ? ` · ${t("money.approvedBy", { name: row.approvedByName ?? "" })}`
                    : ""}
                </p>
              </div>
              {isOwner && row.approval === "awaiting" ? (
                <Button
                  disabled={approve.isPending}
                  onClick={() => approve.mutate({ id: row.id })}
                  size="sm"
                  variant="outline"
                >
                  {t("money.approve")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/money")({
  beforeLoad: ({ context }) => {
    // Barn Staff never see money, and the Vet's is on the Vet's own screen.
    const { roles } = context.me;
    if (!(roles.includes("owner") || roles.includes("manager"))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: MoneyPage,
});
