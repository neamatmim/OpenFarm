import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { TagLink } from "@/components/fattening/fattening-words";
import { useInvestorNames } from "@/components/investors/investor-names";
import { EmptyState, Section } from "@/components/page";
import { NativeSelect } from "@/components/page-kit";
import {
  CorrectInternalSale,
  CorrectMovement,
} from "@/components/ventures/correct-movement";
import { Line } from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import type { Venture } from "@/lib/ventures";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Movement = Awaited<
  ReturnType<typeof client.ventures.movements.list>
>[number];

/** What each kind of movement is called, in the reader's own language. */
export const KIND_WORD = {
  capital_in: "ventures.kind.capitalIn",
  refund: "ventures.kind.refund",
  float_out: "ventures.kind.floatOut",
  float_back: "ventures.kind.floatBack",
  intake_out: "ventures.kind.intakeOut",
  internal_buy: "ventures.kind.internalBuy",
  internal_sell: "ventures.kind.internalSell",
  sale_in: "ventures.kind.saleIn",
  reimbursement: "ventures.kind.reimbursement",
  advance: "ventures.kind.advance",
  payout: "ventures.kind.payout",
  advance_repaid: "ventures.kind.advanceRepaid",
  farm_share: "ventures.kind.farmShare",
  farm_loss_in: "ventures.kind.farmLossIn",
  made_good: "ventures.kind.madeGood",
} as const satisfies Record<string, MessageKey>;

type Showing = "all" | "in" | "out";

/**
 * Each movement with which way it went and what the account held after it: the line before it, plus or minus
 * this one. Worked out in one pass, oldest first, which is the order the list arrives in.
 */
const withBalances = <
  T extends { direction?: "in" | "out"; amountMoney: number },
>(
  movements: readonly T[]
) => {
  const read: (T & { coming: boolean; after: number })[] = [];
  for (const one of movements) {
    const coming = one.direction === "in";
    const before = read.at(-1)?.after ?? 0;
    read.push({
      ...one,
      coming,
      after: before + (coming ? one.amountMoney : -one.amountMoney),
    });
  }
  return read;
};

/**
 * A money list's sums, under it: the word for them, then each figure beside what it is. Beneath the rows rather than
 * a row of their own, so the table and the phone's cards end on the same figures.
 */
export const MoneyTotals = ({
  figures,
}: {
  figures: { label: string; value: string; className?: string }[];
}) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-1 border-t pt-3 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <span className="font-medium">{t("ventures.page.total")}</span>
      <dl className="flex flex-col gap-0.5 sm:flex-row sm:gap-6">
        {figures.map((one) => (
          <div className="flex justify-between gap-3" key={one.label}>
            <dt className="text-muted-foreground">{one.label}</dt>
            <dd className={cn("font-medium tabular-nums", one.className)}>
              {one.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

/** A movement as the list reads it: which way it went, what the account held after it, what it is called and whose
 *  it was. */
interface MovementRow extends Movement {
  coming: boolean;
  after: number;
  word: string;
  investorName: string | null;
}

interface MovementCell {
  row: { original: MovementRow };
}

const OnCell = ({ row }: MovementCell) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatDate(new Date(row.original.movedOn), language, "date")}
    </span>
  );
};

/** What it was, and the animal or the Investor it was for. */
const WhatCell = ({ row }: MovementCell) => (
  <span className="flex flex-col">
    <span>{row.original.word}</span>
    {row.original.tagNumber ? (
      <TagLink tagNumber={row.original.tagNumber} />
    ) : null}
    {row.original.investorName ? (
      <span className="text-muted-foreground text-xs">
        {row.original.investorName}
      </span>
    ) : null}
  </span>
);

const ReferenceCell = ({ row }: MovementCell) => (
  <span className="text-muted-foreground text-xs">
    {row.original.reference}
  </span>
);

const InCell = ({ row }: MovementCell) => {
  const asMoney = useMoney();
  return row.original.coming ? (
    <span className="text-success">{asMoney(row.original.amountMoney)}</span>
  ) : null;
};

const OutCell = ({ row }: MovementCell) => {
  const asMoney = useMoney();
  return row.original.coming ? null : <>{asMoney(row.original.amountMoney)}</>;
};

const AfterCell = ({ row }: MovementCell) => {
  const asMoney = useMoney();
  return <span className="font-medium">{asMoney(row.original.after)}</span>;
};

/** Only where the farm will take a Correction: not a Sale's money, not a counted Float, not a settled or called-off
 *  Venture — the farm's own word for each. An Internal Sale's side is put right through the sale itself. */
const Correct = ({ movement }: { movement: MovementRow }) => {
  if (movement.whyItStands === "one_side_of_a_sale" && movement.internalSale) {
    return (
      <CorrectInternalSale
        reference={movement.reference}
        sale={movement.internalSale}
      />
    );
  }
  return movement.whyItStands ? null : <CorrectMovement movement={movement} />;
};

const CorrectCell = ({ row }: MovementCell) => (
  <Correct movement={row.original} />
);

const column = createListColumns<MovementRow>();
const movementColumns = column.columns([
  column.accessor("movedOn", {
    header: listHeader("ventures.page.on"),
    cell: OnCell,
  }),
  column.accessor("word", {
    header: listHeader("ventures.page.what"),
    cell: WhatCell,
  }),
  column.accessor("reference", {
    header: listHeader("ventures.page.reference"),
    cell: ReferenceCell,
    enableSorting: false,
  }),
  column.accessor((row) => (row.coming ? row.amountMoney : undefined), {
    id: "in",
    header: listHeader("ventures.page.in"),
    cell: InCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => (row.coming ? undefined : row.amountMoney), {
    id: "out",
    header: listHeader("ventures.page.out"),
    cell: OutCell,
    meta: { align: "end" },
  }),
  column.accessor("after", {
    header: listHeader("ventures.page.after"),
    cell: AfterCell,
    meta: { align: "end" },
  }),
  column.display({
    id: "correct",
    header: ActionsHeader,
    cell: CorrectCell,
    meta: { align: "end" },
  }),
]);

/** A movement on a phone: what it was and whose, with the amount and which way at the right; the day and the
 *  reference under them, what the account held after it, and its Correction where the farm will take one. */
const MovementCard = ({ row }: { row: MovementRow }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <WhatCell row={{ original: row }} />
          <span className="text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
            <span className="tabular-nums">
              {formatDate(new Date(row.movedOn), language, "date")}
            </span>
            <span className="break-all">{row.reference}</span>
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={cn(
              "font-medium tabular-nums",
              row.coming && "text-success"
            )}
          >
            {asMoney(row.amountMoney)}
          </span>
          <span className="text-muted-foreground text-xs">
            {t(row.coming ? "ventures.page.in" : "ventures.page.out")}
          </span>
        </div>
      </div>
      <Line label={t("ventures.page.after")}>{asMoney(row.after)}</Line>
      <div className="flex justify-end empty:hidden">
        <Correct movement={row} />
      </div>
    </div>
  );
};

const movementCard = (row: MovementRow) => <MovementCard row={row} />;

/** The movements on show as rows, in the account's own order until a column is sorted. */
const MovementsTable = ({ movements }: { movements: MovementRow[] }) => {
  const table = useListTable({
    columns: movementColumns,
    data: movements,
    getRowId: (row) => row.id,
  });
  return <DataTable card={movementCard} minWidth="52rem" table={table} />;
};

/**
 * Every movement of the Venture's money, oldest first, as its account would read: what came in, what went
 * out, and what it held after each — so the last line is the balance the farm keeps, and a figure that looks
 * wrong can be followed back to the day it went wrong and put right there.
 *
 * Which way each moved the account is the server's to say, from the same sum the balance is kept by, so this
 * list cannot add up to a different figure. Narrowing to money in or out keeps the balance column as the
 * account read on each day, because a balance of only the rows on show would be a figure no bank ever printed.
 */
export const VentureMoney = ({ venture }: { venture: Venture }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const nameOf = useInvestorNames();
  const [showing, setShowing] = useState<Showing>("all");
  const movements = useQuery(
    orpc.ventures.movements.list.queryOptions({
      input: { ventureId: venture.id },
    })
  );
  const all = movements.data ?? [];
  // A list cached before the answer said which way each movement went cannot be added up, so it is waited
  // past rather than read: the fresh answer is already on its way, and a balance guessed at is worse.
  const unreadable = all.some((one) => one.direction === undefined);
  if (movements.isPending || unreadable) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  if (all.length === 0) {
    return (
      <Section>
        <EmptyState bare icon={ScrollText} title={t("ventures.page.noMoney")} />
      </Section>
    );
  }
  const read = withBalances(all);
  const closing = read.at(-1)?.after ?? 0;
  const shown = read
    .filter(
      (one) =>
        showing === "all" || (showing === "in" ? one.coming : !one.coming)
    )
    .map((one) => ({
      ...one,
      word: t(KIND_WORD[one.kind]),
      investorName: one.investorId ? nameOf(one.investorId) : null,
    }));
  const totalIn = read
    .filter((one) => one.coming)
    .reduce((sum, one) => sum + one.amountMoney, 0);
  const totalOut = read
    .filter((one) => !one.coming)
    .reduce((sum, one) => sum + one.amountMoney, 0);
  return (
    <Section
      action={
        <NativeSelect
          aria-label={t("ventures.page.showing")}
          className="sm:w-48"
          onChange={(event) => setShowing(event.target.value as Showing)}
          value={showing}
        >
          <option value="all">{t("ventures.page.showAll")}</option>
          <option value="in">{t("ventures.page.showIn")}</option>
          <option value="out">{t("ventures.page.showOut")}</option>
        </NativeSelect>
      }
      title={t("ventures.movements")}
    >
      <div className="flex flex-col gap-3">
        <MovementsTable movements={shown} />
        <MoneyTotals
          figures={[
            {
              label: t("ventures.page.in"),
              value: asMoney(totalIn),
              className: "text-success",
            },
            { label: t("ventures.page.out"), value: asMoney(totalOut) },
            {
              label: t("ventures.balance"),
              value: asMoney(closing),
              className: "font-semibold",
            },
          ]}
        />
      </div>
    </Section>
  );
};
