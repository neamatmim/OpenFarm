import { farmDayOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { AccountantExport } from "@/components/accountant-export";
import { CostsBySide } from "@/components/costs";
import { categoryName, useApproveMoney } from "@/components/money";
import {
  Categories,
  CorrectEntered,
  EnterMoney,
  ReceiptLink,
} from "@/components/money-entry";
import { PAYMENT_METHOD_WORD } from "@/components/payment-method";
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
  by_hand: "money.from.byHand",
} as const satisfies Record<string, MessageKey>;

/**
 * The farm's money in a period, newest first, as its own records made it: which way, under what
 * Category, with whom and how it was paid — and, for the Owner, what is waiting for their approval. The
 * period's totals are the accountant's report, not this list's.
 */
const MoneyPage = () => {
  const { t, language } = useLanguage();
  const me = useQuery(orpc.people.me.queryOptions());
  const [from, setFrom] = useState(firstOfTheMonth);
  const [to, setTo] = useState(() => farmDayOf(new Date()));
  const money = useQuery(orpc.money.list.queryOptions({ input: { from, to } }));
  const isOwner = me.data?.roles.includes("owner") ?? false;
  const entersMoney = me.data?.roles.includes("manager") ?? false;
  const approve = useApproveMoney();
  const rows = money.data?.events ?? [];

  return (
    <div className="container mx-auto max-w-2xl space-y-5 px-4 py-6">
      <h1 className="text-lg font-medium">{t("money.title")}</h1>
      {entersMoney ? <EnterMoney /> : null}
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
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("money.none")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              className="flex items-start justify-between gap-2 rounded-lg border p-2 text-sm"
              key={row.id}
            >
              <div>
                <p>
                  {row.direction === "in" ? "+" : "−"}৳
                  {formatNumber(row.amountBdt, language)} ·{" "}
                  {categoryName(row, language)}
                  {row.counterpartyName ? ` · ${row.counterpartyName}` : ""}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatDate(row.occurredAt, language)} ·{" "}
                  {t(SOURCE_WORD[row.source])} ·{" "}
                  {t(PAYMENT_METHOD_WORD[row.paymentMethod])}
                  {row.approval === "awaiting"
                    ? ` · ${t("money.awaiting")}`
                    : ""}
                  {row.approval === "approved"
                    ? ` · ${t("money.approvedBy", { name: row.approvedByName ?? "" })}`
                    : ""}
                </p>
                {row.note || row.wageMonth ? (
                  <p className="text-muted-foreground text-xs">
                    {row.wageMonth
                      ? t("byHand.wageFor", { month: row.wageMonth })
                      : ""}
                    {row.wageMonth && row.note ? " · " : ""}
                    {row.note ?? ""}
                  </p>
                ) : null}
                {entersMoney && row.source === "by_hand" ? (
                  <div className="text-xs">
                    <CorrectEntered entered={row} />
                  </div>
                ) : null}
                {row.hasReceipt ? (
                  <div className="text-xs">
                    <ReceiptLink id={row.id} />
                  </div>
                ) : null}
              </div>
              {isOwner && row.approval === "awaiting" ? (
                <Button
                  disabled={approve.isPending}
                  onClick={() =>
                    approve.mutate({ id: row.id, amountBdt: row.amountBdt })
                  }
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
      {money.data?.more ? (
        <p className="text-muted-foreground text-sm">{t("money.more")}</p>
      ) : null}
      <AccountantExport from={from} to={to} />
      <CostsBySide from={from} to={to} />
      <Categories />
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
