import { formatNumber } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import type { Investor } from "@/components/investors/investor-types";
import {
  PortalStandingBadge,
  PortalStandingLine,
  STANDING,
  standingOf,
} from "@/components/investors/portal-access";
import { Nothing } from "@/components/list-cells";
import { StatusBadge, TagChip } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/** One Investor as the table reads them. */
interface InvestorRow {
  investor: Investor;
}

interface Cell {
  row: { original: InvestorRow };
}

/** Said beside the name of somebody retired, so the list still shows everybody the farm has on file and which
 *  of them it may still sign. */
const RetiredBadge = ({ investor }: { investor: Investor }) => {
  const { t } = useLanguage();
  return investor.retiredAt ? (
    <StatusBadge tone="neutral">{t("investors.retired")}</StatusBadge>
  ) : null;
};

/** Who they are, and where they live under it — what the Owner recognises somebody by. The name leads to their own
 *  page, as a Tag Number leads to an animal's: a link, so it opens in a tab of its own as well. */
const NameCell = ({ row }: Cell) => {
  const { investor } = row.original;
  return (
    <Link
      className="group flex min-w-0 flex-col gap-0.5 text-start outline-none"
      params={{ investorId: investor.id }}
      to="/investors/$investorId"
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium underline-offset-4 group-hover:underline group-focus-visible:underline">
          {investor.name}
        </span>
        <RetiredBadge investor={investor} />
      </span>
      {investor.address ? (
        <span className="text-muted-foreground text-sm">
          {investor.address}
        </span>
      ) : null}
    </Link>
  );
};

const PhoneCell = ({ row }: Cell) => (
  <span className="tabular-nums">{row.original.investor.phone}</span>
);

/** The first Nominee in force, by name, and how many more there are; nothing where nobody is named. */
const firstNominee = (investor: Investor) =>
  investor.nomination?.nominees[0]?.name;

/** The Nominees in force as one short phrase: the first by name, and how many more. */
const nomineesSaid = (
  investor: Investor,
  t: ReturnType<typeof useLanguage>["t"]
) => {
  const first = firstNominee(investor);
  if (!first) {
    return null;
  }
  const more = (investor.nomination?.nominees.length ?? 1) - 1;
  return more > 0 ? t("investors.nomineesAre", { name: first, more }) : first;
};

/** Who collects for the heirs if they die before the Venture settles: the first Nominee and how many more, said to be
 *  not yet signed for where the list was carried over; a dash where nobody is named. */
const NomineeCell = ({ row }: Cell) => {
  const { t } = useLanguage();
  const { investor } = row.original;
  const said = nomineesSaid(investor, t);
  if (!said) {
    return <Nothing />;
  }
  const notSignedFor = investor.nomination?.how === "carried_over";
  return (
    <span className="flex flex-col">
      <span>{said}</span>
      {notSignedFor ? (
        <span className="text-warning text-xs">
          {t("nominees.notSignedFor")}
        </span>
      ) : null}
    </span>
  );
};

/** What they hold across the Ventures still running; nothing at all where they hold none. */
const UnitsCell = ({ row }: Cell) => {
  const { t, language } = useLanguage();
  const { unitsHeld } = row.original.investor;
  if (unitsHeld === 0) {
    return <Nothing />;
  }
  return (
    <TagChip>
      {t("investors.holds", { units: formatNumber(unitsHeld, language) })}
    </TagChip>
  );
};

/** Where they stand with the portal, and what goes with it: the code's last day, or when they were last in. */
const PortalCell = ({ row }: Cell) => {
  const { investor } = row.original;
  if (standingOf(investor) === "none") {
    return <Nothing />;
  }
  return (
    <span className="flex flex-col items-start gap-1">
      <PortalStandingBadge investor={investor} />
      <PortalStandingLine investor={investor} />
    </span>
  );
};

/** Where a standing sorts: in first, never invited as nothing, at the bottom whichever way. */
const PORTAL_ORDER = Object.keys(STANDING);

const column = createListColumns<InvestorRow>();
const nameColumn = column.accessor((row) => row.investor.name, {
  id: "name",
  header: listHeader("investors.name"),
  cell: NameCell,
  meta: { className: "min-w-56" },
});
const phoneColumn = column.accessor((row) => row.investor.phone, {
  id: "phone",
  header: listHeader("investors.phone"),
  cell: PhoneCell,
});
const nomineeColumn = column.accessor((row) => firstNominee(row.investor), {
  id: "nominee",
  header: listHeader("investors.nominee"),
  cell: NomineeCell,
});
const unitsColumn = column.accessor((row) => row.investor.unitsHeld, {
  id: "units",
  header: listHeader("investors.unitsHeld"),
  cell: UnitsCell,
  meta: { align: "end" },
});
const portalColumn = column.accessor(
  (row) => {
    const standing = standingOf(row.investor);
    return standing === "none" ? undefined : PORTAL_ORDER.indexOf(standing);
  },
  {
    id: "portal",
    header: listHeader("portal.column"),
    cell: PortalCell,
  }
);
const investorColumns = column.columns([
  nameColumn,
  phoneColumn,
  nomineeColumn,
  unitsColumn,
]);
const withPortalColumns = column.columns([
  nameColumn,
  phoneColumn,
  nomineeColumn,
  portalColumn,
  unitsColumn,
]);

/** One Investor on a phone: who they are, how they are reached and what they hold. The whole card leads to
 *  their page, the way a thumb expects a card to. */
const InvestorCard = ({ row }: { row: InvestorRow }) => {
  const { t, language } = useLanguage();
  const { investor } = row;
  return (
    <Link
      className="flex w-full items-start justify-between gap-3 text-start"
      params={{ investorId: investor.id }}
      to="/investors/$investorId"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{investor.name}</span>
          <RetiredBadge investor={investor} />
          {standingOf(investor) === "none" ? null : (
            <PortalStandingBadge investor={investor} />
          )}
        </span>
        <PortalStandingLine investor={investor} />
        <span className="text-muted-foreground text-xs">
          {[
            investor.phone,
            investor.address,
            firstNominee(investor)
              ? t("investors.nomineeIs", {
                  name: nomineesSaid(investor, t) ?? "",
                })
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
    </Link>
  );
};

const investorCard = (row: InvestorRow) => <InvestorCard row={row} />;

/** Everybody whose money is in the farm's Ventures as a table where there is room — name and address,
 *  phone, nominee, where they stand with the portal once it is in use, and Units, sortable — and as cards on a
 *  phone. */
export const InvestorsTable = ({
  investors,
  showPortal,
}: {
  investors: Investor[];
  /** Whether the portal is in use, and so worth a column. */
  showPortal: boolean;
}) => {
  const table = useListTable({
    columns: showPortal ? withPortalColumns : investorColumns,
    data: investors.map((investor) => ({ investor })),
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
