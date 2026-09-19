import { formatNumber } from "@OpenFarm/i18n";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { RowMenu } from "@/components/page-kit";
import type { VentureActs } from "@/components/ventures/venture-card";
import {
  CardBadges,
  PrimaryActs,
  StateBadge,
  VentureCard,
  actsInTheMenu,
  moneyOf,
} from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import type { Venture } from "@/lib/ventures";

/** One Venture as the table reads it: the Venture itself, what the page can do to it, and the month the
 *  bank is claimed straight up to. */
interface VentureRow {
  venture: Venture;
  acts: VentureActs;
  lastMonthOver: string;
}

interface Cell {
  row: { original: VentureRow };
}

/** The name, and under it where the run stands — so a row says what it is before it says what it holds. */
const VentureCell = ({ row }: Cell) => {
  const { t } = useLanguage();
  const { venture, acts } = row.original;
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <button
        aria-label={t("ventures.details")}
        className="rounded-md text-start font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2"
        onClick={() => acts.details(venture)}
        type="button"
      >
        {venture.name}
      </button>
      <StateBadge state={venture.state} />
    </span>
  );
};

/** What the Investors have put in — the way to every movement of it, as it is on the card. */
const HeldCell = ({ row }: Cell) => {
  const { t, language } = useLanguage();
  const { venture, acts } = row.original;
  return (
    <button
      aria-label={t("ventures.movements")}
      className="rounded-md tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-2"
      onClick={() => acts.seeMovements(venture)}
      type="button"
    >
      {`৳${formatNumber(venture.capitalInBdt, language)}`}
    </button>
  );
};

const BalanceCell = ({ row }: Cell) => {
  const { language } = useLanguage();
  return (
    <span className="tabular-nums">
      {`৳${formatNumber(moneyOf(row.original.venture).balanceBdt, language)}`}
    </span>
  );
};

const SignedCell = ({ row }: Cell) => {
  const { t, language } = useLanguage();
  const { venture } = row.original;
  const signed = moneyOf(venture).signedFor;
  return (
    <span className="tabular-nums">
      {t("ventures.unitsOfUnits", {
        taken: formatNumber(signed.units, language),
        units: formatNumber(venture.units, language),
        people: formatNumber(signed.people, language),
      })}
    </span>
  );
};

/** How the account stands against the bank, and anything else wrong with the run said beside it: the same
 *  badges the card shows, because a row and a card disagreeing about a Venture is worse than either. */
const BankCell = ({ row }: Cell) => (
  <CardBadges
    lastMonthOver={row.original.lastMonthOver}
    venture={row.original.venture}
  />
);

/** The act the run is waiting for, and the menu holding everything else it can do. */
const ActsCell = ({ row }: Cell) => {
  const { t } = useLanguage();
  const { venture, acts } = row.original;
  return (
    <div className="flex items-center justify-end gap-1">
      <PrimaryActs acts={acts} compact venture={venture} />
      <RowMenu
        actions={actsInTheMenu(venture, acts, t)}
        label={t("ventures.moreFor", { venture: venture.name })}
      />
    </div>
  );
};

const column = createListColumns<VentureRow>();
const ventureColumns = column.columns([
  column.accessor((row) => row.venture.name, {
    id: "venture",
    header: listHeader("ventures.col.venture"),
    cell: VentureCell,
    meta: { className: "min-w-48" },
  }),
  column.accessor((row) => row.venture.capitalInBdt, {
    id: "held",
    header: listHeader("ventures.held"),
    cell: HeldCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => moneyOf(row.venture).balanceBdt, {
    id: "balance",
    header: listHeader("ventures.balance"),
    cell: BalanceCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => moneyOf(row.venture).signedFor.units, {
    id: "signed",
    header: listHeader("ventures.signedFor"),
    cell: SignedCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => row.venture.bank?.lastCheckedMonth ?? "", {
    id: "bank",
    header: listHeader("ventures.col.bank"),
    cell: BankCell,
  }),
  column.display({
    id: "acts",
    header: ActionsHeader,
    cell: ActsCell,
    meta: { align: "end", className: "w-32" },
  }),
]);

/** A Venture on a phone, where a row of six columns is a row nobody can read: the card it has always been,
 *  inside the list's own line rather than in a box of its own. */
const ventureCard = (row: VentureRow) => (
  <VentureCard
    acts={row.acts}
    bare
    lastMonthOver={row.lastMonthOver}
    venture={row.venture}
  />
);

/**
 * The Ventures on one tab as a table: what each is called and where it stands, what its Investors have put
 * in, what its account should hold, who has signed and how the bank stands — with the act it is waiting for
 * at the end of its row, and everything else in the menu beside it.
 *
 * Sortable by every figure, because the question a table answers is which of them, and the rest of what a
 * Venture is opens from its name.
 */
export const VenturesTable = ({
  ventures,
  acts,
  lastMonthOver,
}: {
  ventures: Venture[];
  acts: VentureActs;
  lastMonthOver: string;
}) => {
  const table = useListTable({
    columns: ventureColumns,
    data: ventures.map((venture) => ({ venture, acts, lastMonthOver })),
    getRowId: (row) => row.venture.id,
  });
  return <DataTable card={ventureCard} minWidth="60rem" table={table} />;
};
