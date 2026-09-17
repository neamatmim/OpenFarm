import { farmDayOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
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
import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
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

type MoneyEvent = Awaited<
  ReturnType<typeof orpc.money.list.call>
>["events"][number];

/** One Money Event in the register, with what the reader may do about it: the Owner approves what is awaiting
 *  them, and whoever enters money by hand corrects what was entered by hand. */
interface MoneyRow {
  id: string;
  event: MoneyEvent;
  /** Its Category in the reader's language, which is what the register sorts by. */
  what: string;
  canApprove: boolean;
  entersMoney: boolean;
  approving: boolean;
  onApprove: (event: MoneyEvent) => void;
}

const ApproveButton = ({ row }: { row: MoneyRow }) => {
  const { t } = useLanguage();
  if (!row.canApprove) {
    return null;
  }
  return (
    <Button
      disabled={row.approving}
      onClick={() => row.onApprove(row.event)}
      size="sm"
    >
      {t("money.approve")}
    </Button>
  );
};

/** The amount, signed by which way it went, and green when it came in. */
const Amount = ({ event }: { event: MoneyEvent }) => {
  const { language } = useLanguage();
  return (
    <span
      className={cn(
        "font-semibold whitespace-nowrap tabular-nums",
        event.direction === "in" ? "text-success" : "text-foreground"
      )}
    >
      {event.direction === "in" ? "+" : "−"}৳
      {formatNumber(event.amountBdt, language)}
    </span>
  );
};

/** One entry on a phone: its Category, when and with whom, whether it waits for approval, and the amount. */
const MoneyCard = ({ row }: { row: MoneyRow }) => {
  const { t, language } = useLanguage();
  const { event } = row;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{row.what}</span>
        <span className="text-muted-foreground text-xs">
          {formatDate(event.occurredAt, language)}
          {event.counterpartyName ? ` · ${event.counterpartyName}` : ""}
        </span>
        {event.approval === "awaiting" ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StatusBadge tone="warning">{t("money.awaiting")}</StatusBadge>
            <ApproveButton row={row} />
          </div>
        ) : null}
      </div>
      <span className="shrink-0 text-right">
        <Amount event={event} />
      </span>
    </div>
  );
};

const moneyCard = (row: MoneyRow) => <MoneyCard row={row} />;

const DateCell = ({ row }: { row: { original: MoneyRow } }) => {
  const { language } = useLanguage();
  return (
    <span className="text-muted-foreground whitespace-nowrap tabular-nums">
      {formatDate(row.original.event.occurredAt, language)}
    </span>
  );
};

/** What the entry is: its Category, where it came from and how it was paid, any note, and its receipt. */
const WhatCell = ({ row }: { row: { original: MoneyRow } }) => {
  const { t } = useLanguage();
  const { event, entersMoney } = row.original;
  const correctable = entersMoney && event.source === "by_hand";
  return (
    <>
      <div className="font-medium">{row.original.what}</div>
      <div className="text-muted-foreground text-xs">
        {t(SOURCE_WORD[event.source])} ·{" "}
        {t(PAYMENT_METHOD_WORD[event.paymentMethod])}
      </div>
      {event.note || event.wageMonth ? (
        <div className="text-muted-foreground text-xs">
          {event.wageMonth
            ? t("byHand.wageFor", { month: event.wageMonth })
            : ""}
          {event.wageMonth && event.note ? " · " : ""}
          {event.note ?? ""}
        </div>
      ) : null}
      {correctable || event.hasReceipt ? (
        <div className="flex flex-wrap gap-3 pt-1 text-xs">
          {correctable ? <CorrectEntered entered={event} /> : null}
          {event.hasReceipt ? <ReceiptLink id={event.id} /> : null}
        </div>
      ) : null}
    </>
  );
};

const WithCell = ({ row }: { row: { original: MoneyRow } }) => (
  <span className="text-sm">{row.original.event.counterpartyName ?? "—"}</span>
);

const StatusCell = ({ row }: { row: { original: MoneyRow } }) => {
  const { t } = useLanguage();
  const { event } = row.original;
  if (event.approval === "awaiting") {
    return (
      <div className="flex flex-col items-start gap-2">
        <StatusBadge tone="warning">{t("money.awaiting")}</StatusBadge>
        <ApproveButton row={row.original} />
      </div>
    );
  }
  if (event.approval === "approved") {
    return (
      <StatusBadge tone="success">
        {t("money.approvedBy", { name: event.approvedByName ?? "" })}
      </StatusBadge>
    );
  }
  return null;
};

const AmountCell = ({ row }: { row: { original: MoneyRow } }) => (
  <Amount event={row.original.event} />
);

const column = createListColumns<MoneyRow>();
const moneyColumns = column.columns([
  column.accessor((row) => new Date(row.event.occurredAt).getTime(), {
    id: "date",
    header: listHeader("money.col.date"),
    cell: DateCell,
  }),
  column.accessor("what", {
    header: listHeader("money.col.what"),
    cell: WhatCell,
    meta: { className: "min-w-56" },
  }),
  column.accessor((row) => row.event.counterpartyName ?? "", {
    id: "with",
    header: listHeader("money.col.with"),
    cell: WithCell,
  }),
  column.accessor((row) => row.event.approval ?? "", {
    id: "status",
    header: listHeader("money.col.status"),
    cell: StatusCell,
  }),
  column.accessor(
    (row) =>
      row.event.direction === "in" ? row.event.amountBdt : -row.event.amountBdt,
    {
      id: "amount",
      header: listHeader("money.col.amount"),
      cell: AmountCell,
      meta: { align: "end" },
    }
  ),
]);

/** The register: a card for each entry on a phone, and a table where there is room, sortable by any column. */
const Register = ({
  events,
  isOwner,
  entersMoney,
}: {
  events: MoneyEvent[];
  isOwner: boolean;
  entersMoney: boolean;
}) => {
  const { language } = useLanguage();
  const approve = useApproveMoney();
  const onApprove = (event: MoneyEvent) =>
    approve.mutate({ id: event.id, amountBdt: event.amountBdt });
  const table = useListTable({
    columns: moneyColumns,
    data: events.map((event) => ({
      id: event.id,
      event,
      what: categoryName(event, language),
      canApprove: isOwner,
      entersMoney,
      approving: approve.isPending,
      onApprove,
    })),
    getRowId: (row) => row.id,
  });
  return <DataTable card={moneyCard} minWidth="44rem" table={table} />;
};

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
  const entersMoney = isOwner || (me.data?.roles.includes("manager") ?? false);
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
            <EmptyState bare icon={Wallet} title={t("money.none")} />
          ) : (
            <Register
              entersMoney={entersMoney}
              events={rows}
              isOwner={isOwner}
            />
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
