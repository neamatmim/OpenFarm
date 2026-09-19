import { formatNumber } from "@OpenFarm/i18n";
import { IdCard } from "lucide-react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import type { Investor } from "@/components/investors/investor-types";
import { TagChip } from "@/components/page";
import { RowMenu } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

/** One Investor as the table reads them, with the one thing the page can do from their row. */
interface InvestorRow {
  investor: Investor;
  onDetails: (investor: Investor) => void;
}

interface Cell {
  row: { original: InvestorRow };
}

/** Who they are, and where they live under it — what the Owner recognises somebody by. */
const NameCell = ({ row }: Cell) => {
  const { investor } = row.original;
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="font-medium">{investor.name}</span>
      {investor.address ? (
        <span className="text-muted-foreground text-sm">
          {investor.address}
        </span>
      ) : null}
    </span>
  );
};

const PhoneCell = ({ row }: Cell) => (
  <span className="tabular-nums">{row.original.investor.phone}</span>
);

/** Who the money goes to if they die before the Venture settles; a dash where nobody was named. */
const NomineeCell = ({ row }: Cell) => {
  const { nominee } = row.original.investor;
  if (!nominee) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span>{nominee.name}</span>;
};

/** What they hold across the Ventures still running; nothing at all where they hold none. */
const UnitsCell = ({ row }: Cell) => {
  const { t, language } = useLanguage();
  const { unitsHeld } = row.original.investor;
  if (unitsHeld === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <TagChip>
      {t("investors.holds", { units: formatNumber(unitsHeld, language) })}
    </TagChip>
  );
};

const ActionCell = ({ row }: Cell) => {
  const { t } = useLanguage();
  const { investor, onDetails } = row.original;
  return (
    <div className="flex justify-end">
      <RowMenu
        actions={[
          {
            label: t("investors.details"),
            icon: IdCard,
            handleSelect: () => onDetails(investor),
          },
        ]}
        label={investor.name}
      />
    </div>
  );
};

const column = createListColumns<InvestorRow>();
const investorColumns = column.columns([
  column.accessor((row) => row.investor.name, {
    id: "name",
    header: listHeader("investors.name"),
    cell: NameCell,
    meta: { className: "min-w-56" },
  }),
  column.accessor((row) => row.investor.phone, {
    id: "phone",
    header: listHeader("investors.phone"),
    cell: PhoneCell,
  }),
  column.accessor((row) => row.investor.nominee?.name ?? "", {
    id: "nominee",
    header: listHeader("investors.nominee"),
    cell: NomineeCell,
  }),
  column.accessor((row) => row.investor.unitsHeld, {
    id: "units",
    header: listHeader("investors.unitsHeld"),
    cell: UnitsCell,
    meta: { align: "end" },
  }),
  column.display({
    id: "action",
    header: ActionsHeader,
    cell: ActionCell,
    meta: { align: "end", className: "w-16" },
  }),
]);

/** One Investor on a phone: who they are, how they are reached and what they hold, with their row's menu
 *  where the table would have put it. */
const InvestorCard = ({ row }: { row: InvestorRow }) => {
  const { t, language } = useLanguage();
  const { investor } = row;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">{investor.name}</span>
        <span className="text-muted-foreground text-xs">
          {[
            investor.phone,
            investor.address,
            investor.nominee
              ? t("investors.nomineeIs", { name: investor.nominee.name })
              : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {investor.unitsHeld > 0 ? (
          <TagChip>
            {t("investors.holds", {
              units: formatNumber(investor.unitsHeld, language),
            })}
          </TagChip>
        ) : null}
      </div>
      <ActionCell row={{ original: row }} />
    </div>
  );
};

const investorCard = (row: InvestorRow) => <InvestorCard row={row} />;

/** Everybody whose money is in the farm's Ventures as a table where there is room — name and address,
 *  phone, nominee and Units, sortable — and as cards on a phone. */
export const InvestorsTable = ({
  investors,
  onDetails,
}: {
  investors: Investor[];
  onDetails: (investor: Investor) => void;
}) => {
  const table = useListTable({
    columns: investorColumns,
    data: investors.map((investor) => ({ investor, onDetails })),
    getRowId: (row) => row.investor.id,
  });
  return (
    <DataTable
      card={investorCard}
      minWidth="44rem"
      pageSize={20}
      table={table}
    />
  );
};
