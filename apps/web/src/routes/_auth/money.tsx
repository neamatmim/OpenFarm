import { farmDayOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@OpenFarm/ui/components/table";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Hourglass,
  Scale,
  Wallet,
} from "lucide-react";
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
import {
  EmptyState,
  Notice,
  Page,
  PageHeader,
  PeriodFilter,
  Section,
  StatTile,
  StatusBadge,
} from "@/components/page";
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

  const taka = (n: number) => `৳${formatNumber(n, language)}`;
  const moneyIn = rows
    .filter((row) => row.direction === "in")
    .reduce((sum, row) => sum + row.amountBdt, 0);
  const moneyOut = rows
    .filter((row) => row.direction === "out")
    .reduce((sum, row) => sum + row.amountBdt, 0);
  const awaiting = rows.filter((row) => row.approval === "awaiting").length;
  // Totals from a list the server cut short are the shown rows' totals, and say so on every figure.
  const partial = money.data?.more ? t("money.shownOnly") : undefined;

  return (
    <Page width="wide">
      <PageHeader
        description={t("money.subtitle")}
        eyebrow={t("nav.group.money")}
        title={t("money.title")}
      />

      <PeriodFilter
        from={from}
        fromLabel={t("dispatch.from")}
        label={t("money.period")}
        onFrom={setFrom}
        onTo={setTo}
        to={to}
        toLabel={t("dispatch.to")}
      />

      {money.data ? (
        <div className="flex flex-col gap-2">
          {money.data.more ? (
            <Notice title={t("money.partialTotals")} tone="info">
              {t("money.partialHint")}
            </Notice>
          ) : null}
          <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            <StatTile
              hint={partial}
              icon={ArrowDownLeft}
              label={t("money.totalIn")}
              tone="success"
              value={taka(moneyIn)}
            />
            <StatTile
              hint={partial}
              icon={ArrowUpRight}
              label={t("money.totalOut")}
              value={taka(moneyOut)}
            />
            <StatTile
              hint={partial}
              icon={Scale}
              label={t("money.net")}
              tone={moneyIn - moneyOut < 0 ? "danger" : "neutral"}
              value={`${moneyIn - moneyOut < 0 ? "−" : ""}${taka(Math.abs(moneyIn - moneyOut))}`}
            />
            <StatTile
              hint={partial}
              icon={Hourglass}
              label={t("money.awaitingCount")}
              tone={awaiting > 0 ? "warning" : "neutral"}
              value={formatNumber(awaiting, language)}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton className="h-32 rounded-xl" key={n} />
          ))}
        </div>
      )}

      {money.isError ? (
        <Notice
          title={wordedRefusal(money.error, t) ?? t("common.error")}
          tone="danger"
        />
      ) : null}

      <div
        className={cn(
          "grid gap-6",
          entersMoney && "xl:grid-cols-[minmax(0,1fr)_24rem]"
        )}
      >
        <Section className="min-w-0" id="register" title={t("money.register")}>
          {rows.length === 0 ? (
            <EmptyState icon={Wallet} title={t("money.none")} />
          ) : (
            <>
              <ul className="divide-border flex flex-col divide-y md:hidden">
                {rows.map((row) => (
                  <li
                    className="flex items-start justify-between gap-3 py-3"
                    key={row.id}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium">
                        {categoryName(row, language)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatDate(row.occurredAt, language)}
                        {row.counterpartyName
                          ? ` · ${row.counterpartyName}`
                          : ""}
                      </span>
                      {row.approval === "awaiting" ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <StatusBadge tone="warning">
                            {t("money.awaiting")}
                          </StatusBadge>
                          {isOwner ? (
                            <Button
                              disabled={approve.isPending}
                              onClick={() =>
                                approve.mutate({
                                  id: row.id,
                                  amountBdt: row.amountBdt,
                                })
                              }
                              size="sm"
                            >
                              {t("money.approve")}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-right font-semibold whitespace-nowrap tabular-nums",
                        row.direction === "in"
                          ? "text-success"
                          : "text-foreground"
                      )}
                    >
                      {row.direction === "in" ? "+" : "−"}
                      {taka(row.amountBdt)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="-mx-4 hidden overflow-x-auto md:-mx-5 md:block">
                <Table className="min-w-[44rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4 md:pl-5">
                        {t("money.col.date")}
                      </TableHead>
                      <TableHead>{t("money.col.what")}</TableHead>
                      <TableHead>{t("money.col.with")}</TableHead>
                      <TableHead>{t("money.col.status")}</TableHead>
                      <TableHead className="pr-4 text-right md:pr-5">
                        {t("money.col.amount")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow className="align-top" key={row.id}>
                        <TableCell className="text-muted-foreground pl-4 whitespace-nowrap tabular-nums md:pl-5">
                          {formatDate(row.occurredAt, language)}
                        </TableCell>
                        <TableCell className="min-w-56">
                          <div className="font-medium">
                            {categoryName(row, language)}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {t(SOURCE_WORD[row.source])} ·{" "}
                            {t(PAYMENT_METHOD_WORD[row.paymentMethod])}
                          </div>
                          {row.note || row.wageMonth ? (
                            <div className="text-muted-foreground text-xs">
                              {row.wageMonth
                                ? t("byHand.wageFor", { month: row.wageMonth })
                                : ""}
                              {row.wageMonth && row.note ? " · " : ""}
                              {row.note ?? ""}
                            </div>
                          ) : null}
                          {(entersMoney && row.source === "by_hand") ||
                          row.hasReceipt ? (
                            <div className="flex flex-wrap gap-3 pt-1 text-xs">
                              {entersMoney && row.source === "by_hand" ? (
                                <CorrectEntered entered={row} />
                              ) : null}
                              {row.hasReceipt ? (
                                <ReceiptLink id={row.id} />
                              ) : null}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.counterpartyName ?? "—"}
                        </TableCell>
                        <TableCell>
                          {row.approval === "awaiting" ? (
                            <div className="flex flex-col items-start gap-2">
                              <StatusBadge tone="warning">
                                {t("money.awaiting")}
                              </StatusBadge>
                              {isOwner ? (
                                <Button
                                  disabled={approve.isPending}
                                  onClick={() =>
                                    approve.mutate({
                                      id: row.id,
                                      amountBdt: row.amountBdt,
                                    })
                                  }
                                  size="sm"
                                >
                                  {t("money.approve")}
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                          {row.approval === "approved" ? (
                            <StatusBadge tone="success">
                              {t("money.approvedBy", {
                                name: row.approvedByName ?? "",
                              })}
                            </StatusBadge>
                          ) : null}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "pr-4 text-right font-semibold whitespace-nowrap tabular-nums md:pr-5",
                            row.direction === "in"
                              ? "text-success"
                              : "text-foreground"
                          )}
                        >
                          {row.direction === "in" ? "+" : "−"}
                          {taka(row.amountBdt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </Section>
        {entersMoney ? (
          <div className="flex flex-col gap-6">
            <EnterMoney />
          </div>
        ) : null}
      </div>

      <AccountantExport from={from} to={to} />
      <CostsBySide from={from} to={to} />
      <Categories />
    </Page>
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
