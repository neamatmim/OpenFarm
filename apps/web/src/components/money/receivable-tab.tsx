import { startOfFarmDay } from "@OpenFarm/domain";
import { currencySign, formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { HandCoins, Plus } from "lucide-react";
import { useState } from "react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { phoneLink } from "@/components/investors/phone-link";
import { Nothing } from "@/components/list-cells";
import { useIsOwner } from "@/components/money";
import {
  BuyerPhoneCorrection,
  ReceivablePaymentCorrection,
  WriteOffCorrection,
} from "@/components/money/receivable-corrections";
import type { PaymentFor } from "@/components/money/receivable-payment-sheet";
import { ReceivablePaymentSheet } from "@/components/money/receivable-payment-sheet";
import { WriteOffButton } from "@/components/money/receivable-write-off";
import {
  EmptyState,
  Loaded,
  RecordList,
  RecordRow,
  Section,
  StatTile,
  TableSkeleton,
  TagChip,
} from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { orpc } from "@/utils/orpc";

type Buyer = Awaited<ReturnType<typeof orpc.receivables.list.call>>[number];
type KindStanding = Buyer["kinds"][number];

/** A farm day as the reader reads it. */
const useDay = () => {
  const { language } = useLanguage();
  return (day: string) => formatDate(startOfFarmDay(day), language, "date");
};

/** One Sale or Dispatch he left owing on: the bull by her tag or the milk by its liters, what of it is still owed and
 *  what stays written off — and, for the Owner, the way to write off what will not be paid. */
const OwedRow = ({
  item,
  kind,
  mayWriteOff,
}: {
  item: KindStanding["items"][number];
  kind: KindStanding["kind"];
  mayWriteOff: boolean;
}) => {
  const { t } = useLanguage();
  const day = useDay();
  const what =
    item.tagNumber === null ? (
      t("receivable.liters", { liters: item.liters ?? 0 })
    ) : (
      <TagChip>{item.tagNumber}</TagChip>
    );
  return (
    <RecordRow
      meta={
        <>
          <span>{day(item.leftOn)}</span>
          {item.promisedBy === null ? null : (
            <span>
              {t("receivable.promised", { day: day(item.promisedBy) })}
            </span>
          )}
        </>
      }
      title={what}
      trailing={
        <span className="flex flex-col items-end gap-0.5">
          <span
            className={
              item.owingMoney > 0
                ? "text-warning text-sm font-medium tabular-nums"
                : "text-muted-foreground text-sm"
            }
          >
            {item.owingMoney > 0
              ? t("receivable.itemOwes", {
                  owing: item.owingMoney,
                  receivable: item.receivableMoney,
                })
              : t("receivable.itemPaidOff")}
          </span>
          {/* Missing from an answer a phone kept from before anything was written off. */}
          {(item.writtenOffMoney ?? 0) > 0 ? (
            <span className="text-danger text-xs tabular-nums">
              {t("receivable.writtenOff", { amount: item.writtenOffMoney })}
            </span>
          ) : null}
          {mayWriteOff && item.owingMoney > 0 ? (
            <WriteOffButton
              id={item.id}
              owingMoney={item.owingMoney}
              source={kind === "milk" ? "dispatch" : "sale"}
            />
          ) : null}
        </span>
      }
    />
  );
};

/** Each time the Owner wrote some of his Receivable off, as written, each to put right or take back — the Owner's alone.
 *  None in an answer the phone kept from before write-offs were listed one by one. */
const WriteOffLines = ({ standing }: { standing: KindStanding }) => {
  const { t } = useLanguage();
  const day = useDay();
  const written = standing.items.flatMap((item) => item.writeOffs ?? []);
  if (written.length === 0) {
    return null;
  }
  return (
    <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
      {written.map((one) => (
        <li
          className="flex flex-wrap items-center justify-between gap-2"
          key={one.id}
        >
          <span>
            {t("receivable.writeOffLine", {
              amount: one.amountMoney,
              day: day(one.writtenOn),
            })}
            {` — ${one.reason}`}
          </span>
          <WriteOffCorrection writeOff={one} />
        </li>
      ))}
    </ul>
  );
};

/** His Receivable of one kind: what he owes and since when, each thing he took, and each payment he made. */
const KindPart = ({
  standing,
  onPay,
  mayWriteOff,
}: {
  standing: KindStanding;
  onPay: () => void;
  mayWriteOff: boolean;
}) => {
  const { t } = useLanguage();
  const day = useDay();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">
            {t(
              standing.kind === "milk"
                ? "receivable.kind.milk"
                : "receivable.kind.cattle"
            )}
            {" · "}
            <span className="tabular-nums">
              {t("receivable.owed", { amount: standing.owingMoney })}
            </span>
          </span>
          <span className="text-muted-foreground text-xs">
            {[
              standing.oldestOn === null
                ? null
                : t("receivable.since", { day: day(standing.oldestOn) }),
              standing.soonestPromise === null
                ? null
                : t("receivable.promised", {
                    day: day(standing.soonestPromise),
                  }),
              standing.paidAheadMoney > 0
                ? t("receivable.paidAhead", { amount: standing.paidAheadMoney })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <Button onClick={onPay} size="sm" type="button" variant="outline">
          <Plus aria-hidden data-icon="inline-start" />
          {t("receivable.record")}
        </Button>
      </div>
      <RecordList>
        {standing.items.map((item) => (
          <OwedRow
            item={item}
            key={item.id}
            kind={standing.kind}
            mayWriteOff={mayWriteOff}
          />
        ))}
      </RecordList>
      {standing.payments.length > 0 ? (
        <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
          {standing.payments.map((payment) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2"
              key={payment.id}
            >
              <span>
                {t("receivable.paymentLine", {
                  amount: payment.amountMoney,
                  day: day(payment.paidOn),
                })}
                {payment.note ? ` — ${payment.note}` : null}
              </span>
              <ReceivablePaymentCorrection payment={payment} />
            </li>
          ))}
        </ul>
      ) : null}
      {mayWriteOff ? <WriteOffLines standing={standing} /> : null}
    </div>
  );
};

/** What one buyer owes, kind by kind: what he took, what he paid, and what was written off — on a phone under his
 *  name, on a desk under his row. */
const BuyerBreakdown = ({
  buyer,
  onPay,
  mayWriteOff,
}: {
  buyer: Buyer;
  onPay: (paying: PaymentFor) => void;
  mayWriteOff: boolean;
}) => (
  <div className="flex flex-col gap-5">
    <div className="flex justify-end">
      <BuyerPhoneCorrection buyer={buyer} />
    </div>
    {buyer.kinds.map((standing) => (
      <KindPart
        key={standing.kind}
        mayWriteOff={mayWriteOff}
        onPay={() => onPay({ buyer: buyer.name, kind: standing.kind })}
        standing={standing}
      />
    ))}
  </div>
);

/** One buyer who owes the farm: his name and a number to ring, and his cattle and his milk apart. */
const BuyerCard = ({
  buyer,
  onPay,
  mayWriteOff,
}: {
  buyer: Buyer;
  onPay: (paying: PaymentFor) => void;
  mayWriteOff: boolean;
}) => {
  const { t } = useLanguage();
  return (
    <Section
      description={phoneLink(buyer.phone)}
      title={
        <span className="flex flex-wrap items-baseline gap-x-2">
          {buyer.name}
          {buyer.owingMoney > 0 ? (
            <span className="text-warning text-sm font-medium tabular-nums">
              {t("receivable.owed", { amount: buyer.owingMoney })}
            </span>
          ) : null}
          {(buyer.writtenOffMoney ?? 0) > 0 ? (
            <span className="text-danger text-sm font-medium tabular-nums">
              {t("receivable.writtenOff", { amount: buyer.writtenOffMoney })}
            </span>
          ) : null}
        </span>
      }
    >
      <BuyerBreakdown buyer={buyer} mayWriteOff={mayWriteOff} onPay={onPay} />
    </Section>
  );
};

interface Cell {
  row: { original: Buyer };
}

const owingOf = (buyer: Buyer, kind: KindStanding["kind"]) =>
  buyer.kinds.find((one) => one.kind === kind)?.owingMoney ?? 0;

/** The day he has owed since: the older of his cattle and his milk. Nothing, once all he took is paid. */
const sinceOf = (buyer: Buyer) =>
  buyer.kinds
    .map((one) => one.oldestOn)
    .filter((day) => day !== null)
    .toSorted()
    .at(0);

/** The soonest day he promised to pay by, of either kind. */
const promiseOf = (buyer: Buyer) =>
  buyer.kinds
    .map((one) => one.soonestPromise)
    .filter((day) => day !== null)
    .toSorted()
    .at(0);

const BuyerCell = ({ row }: Cell) => (
  <span className="flex flex-col">
    <span className="font-medium">{row.original.name}</span>
    <span className="text-muted-foreground text-xs">
      {phoneLink(row.original.phone)}
    </span>
  </span>
);

const TONE = {
  warning: "text-warning font-medium",
  danger: "text-danger font-medium",
} as const;

const MoneyOrNothing = ({
  amount,
  tone,
}: {
  amount: number;
  tone?: keyof typeof TONE;
}) => {
  const asMoney = useMoney();
  if (amount <= 0) {
    return <Nothing />;
  }
  return (
    <span className={tone === undefined ? undefined : TONE[tone]}>
      {asMoney(amount)}
    </span>
  );
};

const CattleCell = ({ row }: Cell) => (
  <MoneyOrNothing amount={owingOf(row.original, "cattle")} />
);
const MilkCell = ({ row }: Cell) => (
  <MoneyOrNothing amount={owingOf(row.original, "milk")} />
);
const WrittenOffCell = ({ row }: Cell) => (
  // Missing from an answer a phone kept from before anything was written off.
  <MoneyOrNothing amount={row.original.writtenOffMoney ?? 0} tone="danger" />
);
const OwingCell = ({ row }: Cell) => (
  <MoneyOrNothing amount={row.original.owingMoney} tone="warning" />
);

const DayCell = ({ day }: { day: string | undefined }) => {
  const said = useDay();
  return day === undefined ? <Nothing /> : <span>{said(day)}</span>;
};
const SinceCell = ({ row }: Cell) => <DayCell day={sinceOf(row.original)} />;
const PromiseCell = ({ row }: Cell) => (
  <DayCell day={promiseOf(row.original)} />
);

const column = createListColumns<Buyer>();
const buyerColumns = column.columns([
  column.accessor("name", {
    header: listHeader("receivable.buyer"),
    cell: BuyerCell,
  }),
  column.accessor(sinceOf, {
    id: "since",
    header: listHeader("receivable.col.since"),
    cell: SinceCell,
  }),
  column.accessor(promiseOf, {
    id: "promised",
    header: listHeader("receivable.promisedBy"),
    cell: PromiseCell,
  }),
  column.accessor((buyer) => owingOf(buyer, "cattle"), {
    id: "cattle",
    header: listHeader("receivable.kind.cattle"),
    cell: CattleCell,
    meta: { align: "end" },
  }),
  column.accessor((buyer) => owingOf(buyer, "milk"), {
    id: "milk",
    header: listHeader("receivable.kind.milk"),
    cell: MilkCell,
    meta: { align: "end" },
  }),
  column.accessor((buyer) => buyer.writtenOffMoney ?? 0, {
    id: "writtenOff",
    header: listHeader("receivable.col.writtenOff"),
    cell: WrittenOffCell,
    meta: { align: "end" },
  }),
  column.accessor("owingMoney", {
    header: listHeader("receivable.col.owing"),
    cell: OwingCell,
    meta: { align: "end" },
  }),
]);

/** On a desk, every buyer a row to read down — who, since when, promised by, and what of his cattle and his milk is
 *  still owed — sortable by any of it, each opening to what he took and paid (Polaris's index table, Carbon's
 *  expandable rows). It starts in the server's order, the one owed longest first. */
const BuyersTable = ({
  buyers,
  onPay,
  mayWriteOff,
}: {
  buyers: Buyer[];
  onPay: (paying: PaymentFor) => void;
  mayWriteOff: boolean;
}) => {
  const table = useListTable({
    columns: buyerColumns,
    data: buyers,
    getRowId: (buyer) => buyer.counterpartyId,
  });
  return (
    <DataTable
      renderDetail={(buyer) => (
        <BuyerBreakdown buyer={buyer} mayWriteOff={mayWriteOff} onPay={onPay} />
      )}
      minWidth="56rem"
      table={table}
    />
  );
};

/**
 * Who owes the farm what: every buyer with Receivable, the one owed longest first — the one to ring today — with what he
 * took, what he has paid, and a payment one tap away.
 */
export const ReceivableTab = () => {
  const { t, language } = useLanguage();
  const list = useQuery(orpc.receivables.list.queryOptions());
  // Writing Receivable off is the Owner's alone.
  const mayWriteOff = useIsOwner();
  const [paying, setPaying] = useState<PaymentFor | null>(null);
  const buyers = list.data ?? [];
  const owing = buyers.reduce((sum, one) => sum + one.owingMoney, 0);
  const owingBuyers = buyers.filter((one) => one.owingMoney > 0).length;
  return (
    <Loaded query={list} skeleton={<TableSkeleton rows={4} />}>
      {buyers.length === 0 ? (
        <EmptyState
          description={t("receivable.nobodyHint")}
          icon={HandCoins}
          title={t("receivable.nobody")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <StatTile
            hint={t("receivable.owingTotalHint", { count: owingBuyers })}
            icon={HandCoins}
            label={t("receivable.owingTotal")}
            tone={owing > 0 ? "warning" : "neutral"}
            value={`${currencySign()}${formatNumber(owing, language)}`}
          />
          {/* A phone keeps a card a buyer, his breakdown under his name. */}
          <div className="flex flex-col gap-4 md:hidden">
            {buyers.map((buyer) => (
              <BuyerCard
                buyer={buyer}
                key={buyer.counterpartyId}
                mayWriteOff={mayWriteOff}
                onPay={setPaying}
              />
            ))}
          </div>
          <Section className="hidden md:flex">
            <BuyersTable
              buyers={buyers}
              mayWriteOff={mayWriteOff}
              onPay={setPaying}
            />
          </Section>
        </div>
      )}
      <ReceivablePaymentSheet
        key={paying ? `${paying.buyer}:${paying.kind}` : "none"}
        onClose={() => setPaying(null)}
        paying={paying}
      />
    </Loaded>
  );
};
