import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Hourglass, Search, Wallet } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { categoryName, useApproveMoney } from "@/components/money";
import { CorrectEntered, ReceiptLink } from "@/components/money-entry";
import {
  EmptyState,
  Loaded,
  SegmentedControl,
  StatusBadge,
} from "@/components/page";
import { FilterBar, NativeSelect } from "@/components/page-kit";
import { PAYMENT_METHOD_WORD } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

/** How many entries the register shows before the next page. */
const REGISTER_PAGE = 20;

const SOURCE_WORD = {
  dispatch: "money.from.dispatch",
  intake: "money.from.intake",
  sale: "money.from.sale",
  feed_in: "money.from.feedIn",
  medicine_purchase: "money.from.medicinePurchase",
  vet_fee: "money.from.vetFee",
  by_hand: "money.from.byHand",
} as const satisfies Record<string, MessageKey>;

export type MoneyList = Awaited<ReturnType<typeof orpc.money.list.call>>;
type MoneyEvent = MoneyList["events"][number];

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
  handleApprove: (event: MoneyEvent) => void;
}

/** The Owner's one press on money waiting for them. */
const ApproveButton = ({
  row,
  size = "sm",
}: {
  row: MoneyRow;
  size?: "sm" | "default";
}) => {
  const { t } = useLanguage();
  const { handleApprove } = row;
  if (!(row.canApprove && row.event.approval === "awaiting")) {
    return null;
  }
  return (
    <Button
      disabled={row.approving}
      onClick={() => handleApprove(row.event)}
      size={size}
      type="button"
    >
      {t("money.approve")}
    </Button>
  );
};

/** The amount, signed by which way it went, and green when it came in. */
const Amount = ({
  event,
  className,
}: {
  event: MoneyEvent;
  className?: string;
}) => {
  const { language } = useLanguage();
  return (
    <span
      className={cn(
        "font-semibold whitespace-nowrap tabular-nums",
        event.direction === "in" ? "text-success" : "text-foreground",
        className
      )}
    >
      {event.direction === "in" ? "+" : "−"}৳
      {formatNumber(event.amountBdt, language)}
    </span>
  );
};

/** Where the entry stands with the Owner, as a word with its colour; nothing for money that never waited. */
const Approval = ({ event }: { event: MoneyEvent }) => {
  const { t } = useLanguage();
  if (event.approval === "awaiting") {
    return (
      <StatusBadge icon={Hourglass} tone="warning">
        {t("money.awaiting")}
      </StatusBadge>
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

/** Where the entry came from and how it was paid, with the wage month and any note. */
const Detail = ({ event }: { event: MoneyEvent }) => {
  const { t } = useLanguage();
  const parts = [
    t(SOURCE_WORD[event.source]),
    t(PAYMENT_METHOD_WORD[event.paymentMethod]),
    event.wageMonth ? t("byHand.wageFor", { month: event.wageMonth }) : "",
    event.note ?? "",
  ].filter(Boolean);
  return <>{parts.join(" · ")}</>;
};

/** The receipt and the Correction, where the entry has them. */
const EntryActions = ({ row }: { row: MoneyRow }) => {
  const { event, entersMoney } = row;
  const correctable = entersMoney && event.source === "by_hand";
  if (!(correctable || event.hasReceipt)) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {event.hasReceipt ? <ReceiptLink id={event.id} /> : null}
      {correctable ? <CorrectEntered entered={event} /> : null}
    </div>
  );
};

/** One entry on a phone: its Category and the amount on top, when, with whom and how beneath, and where it stands
 *  with the Owner at the foot beside what can be done about it. */
const MoneyCard = ({ row }: { row: MoneyRow }) => {
  const { language } = useLanguage();
  const { event } = row;
  const hasFoot =
    event.approval !== "not_needed" ||
    event.hasReceipt ||
    (row.entersMoney && event.source === "by_hand");
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-medium">{row.what}</span>
        <Amount className="text-lg leading-tight" event={event} />
      </div>
      <span className="text-muted-foreground text-xs">
        {formatDate(event.occurredAt, language)}
        {event.counterpartyName ? ` · ${event.counterpartyName}` : ""}
      </span>
      <span className="text-muted-foreground text-xs">
        <Detail event={event} />
      </span>
      {hasFoot ? (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Approval event={event} />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
            <EntryActions row={row} />
            <ApproveButton row={row} size="default" />
          </div>
        </div>
      ) : null}
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

/** What the entry is: its Category, and where it came from and how it was paid beneath. */
const WhatCell = ({ row }: { row: { original: MoneyRow } }) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-medium">{row.original.what}</span>
    <span className="text-muted-foreground text-xs">
      <Detail event={row.original.event} />
    </span>
  </div>
);

const WithCell = ({ row }: { row: { original: MoneyRow } }) =>
  row.original.event.counterpartyName ?? (
    <span className="text-muted-foreground">—</span>
  );

const StatusCell = ({ row }: { row: { original: MoneyRow } }) => (
  <div className="flex flex-wrap items-center gap-2">
    <Approval event={row.original.event} />
    <ApproveButton row={row.original} />
  </div>
);

const AmountCell = ({ row }: { row: { original: MoneyRow } }) => (
  <Amount event={row.original.event} />
);

const ActionsCell = ({ row }: { row: { original: MoneyRow } }) => (
  <EntryActions row={row.original} />
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
    meta: { className: "min-w-40" },
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
  column.display({
    id: "actions",
    header: ActionsHeader,
    cell: ActionsCell,
    meta: { align: "end" },
  }),
]);

type DirectionFilter = "" | "in" | "out";
type StatusFilter = "" | "awaiting" | "approved";

interface Filters {
  direction: DirectionFilter;
  category: string;
  status: StatusFilter;
  search: string;
}

const NO_FILTERS: Filters = {
  direction: "",
  category: "",
  status: "",
  search: "",
};

/** Whether an entry is one the filters let through: which way, its Category, where it stands, and words in it. */
const passes = (filters: Filters, event: MoneyEvent, what: string) => {
  const words = filters.search.trim().toLowerCase();
  const said = [what, event.counterpartyName ?? "", event.note ?? ""]
    .join(" ")
    .toLowerCase();
  return (
    (filters.direction === "" || event.direction === filters.direction) &&
    (filters.category === "" || what === filters.category) &&
    (filters.status === "" || event.approval === filters.status) &&
    (words === "" || said.includes(words))
  );
};

/** The filters over the register, in a row above it where there is room and stacked on a phone. */
const RegisterFilters = ({
  filters,
  categories,
  onChange,
}: {
  filters: Filters;
  categories: string[];
  onChange: (filters: Filters) => void;
}) => {
  const { t } = useLanguage();
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });
  return (
    <FilterBar className="border-b pb-4">
      <div className="relative sm:w-64">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          aria-label={t("money.search")}
          className="pl-9"
          onChange={(event) => set("search", event.target.value)}
          placeholder={t("money.search")}
          type="search"
          value={filters.search}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:flex">
        <NativeSelect
          aria-label={t("byHand.category")}
          className="sm:w-48"
          onChange={(event) => set("category", event.target.value)}
          value={filters.category}
        >
          <option value="">{t("money.allCategories")}</option>
          {categories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t("money.col.status")}
          className="sm:w-44"
          onChange={(event) =>
            set(
              "status",
              (["awaiting", "approved"] as const).find(
                (status) => status === event.target.value
              ) ?? ""
            )
          }
          value={filters.status}
        >
          <option value="">{t("money.anyStatus")}</option>
          <option value="awaiting">{t("money.awaitingCount")}</option>
          <option value="approved">{t("money.approved")}</option>
        </NativeSelect>
      </div>
      <div className="sm:ml-auto">
        <SegmentedControl
          label={t("byHand.direction")}
          name="money-direction"
          onChange={(value) => set("direction", value)}
          options={[
            { value: "", label: t("audit.all") },
            { value: "in", label: t("money.totalIn") },
            { value: "out", label: t("money.totalOut") },
          ]}
          value={filters.direction}
        />
      </div>
    </FilterBar>
  );
};

/**
 * The register: every Money Event in the period, newest first, filtered by which way, Category, where it stands with
 * the Owner and words in it, a page at a time — a card for each entry on a phone, a table where there is room. The
 * Owner approves what waits for them in one press on its row.
 */
export const RegisterTab = ({
  money,
  isOwner,
  entersMoney,
}: {
  money: {
    data: MoneyList | undefined;
    isError: boolean;
    refetch: () => unknown;
  };
  isOwner: boolean;
  entersMoney: boolean;
}) => {
  const { t, language } = useLanguage();
  const approve = useApproveMoney();
  const [filters, setFilters] = useState(NO_FILTERS);
  const events = money.data?.events ?? [];
  const rows = events.map((event) => ({
    id: event.id,
    event,
    what: categoryName(event, language),
    canApprove: isOwner,
    entersMoney,
    approving: approve.isPending,
    handleApprove: (one: MoneyEvent) =>
      approve.mutate({ id: one.id, amountBdt: one.amountBdt }),
  }));
  const shown = rows.filter((row) => passes(filters, row.event, row.what));
  const categories = [...new Set(rows.map((row) => row.what))].toSorted(
    (a, b) => a.localeCompare(b, language)
  );
  const table = useListTable({
    columns: moneyColumns,
    data: shown,
    getRowId: (row) => row.id,
  });
  const nothingInPeriod = events.length === 0;
  const nothingFiltered = !nothingInPeriod && shown.length === 0;
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
      <RegisterFilters
        categories={categories}
        filters={filters}
        onChange={setFilters}
      />
      <Loaded query={money}>
        {nothingInPeriod ? (
          <EmptyState bare icon={Wallet} title={t("money.none")} />
        ) : null}
        {nothingFiltered ? (
          <EmptyState bare icon={Search} title={t("audit.empty")} />
        ) : null}
        {shown.length === 0 ? null : (
          <DataTable
            card={moneyCard}
            key={JSON.stringify(filters)}
            minWidth="60rem"
            pageSize={REGISTER_PAGE}
            table={table}
          />
        )}
      </Loaded>
    </div>
  );
};
