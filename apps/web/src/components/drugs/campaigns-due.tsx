import { formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Syringe } from "lucide-react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { TagLink } from "@/components/fattening/fattening-words";
import { Nothing, SaidDate } from "@/components/list-cells";
import { EmptyState, Loaded, Section, StatusBadge } from "@/components/page";
import { RaiseWork } from "@/components/raise-work";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

type Campaign = Awaited<
  ReturnType<typeof orpc.treatments.campaignsDue.call>
>[number];
type Owed = Campaign["animals"][number];

const TagCell = ({ row }: { row: { original: Owed } }) => (
  <TagLink tagNumber={row.original.tagNumber} />
);

const PenCell = ({ row }: { row: { original: Owed } }) =>
  row.original.penLabel ?? <Nothing />;

/** Her last dose of the product, or that none was given her on the farm. */
const LastCell = ({ row }: { row: { original: Owed } }) => {
  const { t } = useLanguage();
  return row.original.lastGivenOn ? (
    <SaidDate at={row.original.lastGivenOn} />
  ) : (
    <span className="text-muted-foreground">{t("campaigns.noneGiven")}</span>
  );
};

const DueCell = ({ row }: { row: { original: Owed } }) => {
  const { t } = useLanguage();
  return (
    <span className="flex flex-wrap items-center gap-2 whitespace-nowrap">
      <SaidDate at={row.original.dueOn} />
      {row.original.standing === "due" ? (
        <StatusBadge tone="warning">{t("campaigns.due")}</StatusBadge>
      ) : (
        <StatusBadge icon={CalendarClock} tone="info">
          {t("campaigns.soon")}
        </StatusBadge>
      )}
    </span>
  );
};

const column = createListColumns<Owed>();
const owedColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  column.accessor((one) => one.penLabel ?? "", {
    id: "pen",
    header: listHeader("animals.pen"),
    cell: PenCell,
  }),
  column.accessor((one) => one.lastGivenOn ?? "", {
    id: "last",
    header: listHeader("campaigns.lastGiven"),
    cell: LastCell,
  }),
  column.accessor("dueOn", {
    header: listHeader("campaigns.dueOn"),
    cell: DueCell,
  }),
]);

/** One animal owed it, on a phone: her tag and Pen, her day beneath. */
const OwedCard = ({ row }: { row: Owed }) => {
  const { t } = useLanguage();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TagLink tagNumber={row.tagNumber} />
        <span className="text-muted-foreground text-sm">{row.penLabel}</span>
      </div>
      <span className="text-sm">
        {t("campaigns.dueOn")}: <SaidDate at={row.dueOn} />
      </span>
    </div>
  );
};

const owedCard = (row: Owed) => <OwedCard row={row} />;

/** One Campaign: its interval and product, the animals owed it, and the button that raises it in their Pens. */
const CampaignOwed = ({
  campaign,
  mayRaise,
}: {
  campaign: Campaign;
  mayRaise: boolean;
}) => {
  const { t, language } = useLanguage();
  const table = useListTable({
    columns: owedColumns,
    data: campaign.animals,
    getRowId: (row) => row.animalId,
  });
  const name =
    language === "en" && campaign.name.en ? campaign.name.en : campaign.name.bn;
  const product =
    language === "en" && campaign.product.nameEn
      ? campaign.product.nameEn
      : campaign.product.nameBn;
  // Raised in the Pens of the animals whose day has come; those coming due wait for theirs.
  const pens = [
    ...new Set(
      campaign.animals
        .filter((one) => one.standing === "due")
        .map((one) => one.penId)
    ),
  ];
  return (
    <Section
      action={
        mayRaise && pens.length > 0 ? (
          <RaiseWork
            definitionId={campaign.definitionId}
            key={pens.join(",")}
            label={t("campaigns.raise", {
              count: formatNumber(pens.length, language),
            })}
            penIds={pens}
          />
        ) : null
      }
      description={[
        t("sop.trigger.monthsSaid", { months: campaign.months }),
        product,
      ]
        .filter(Boolean)
        .join(" · ")}
      title={name}
    >
      {campaign.animals.length === 0 ? (
        <EmptyState
          bare
          compact
          icon={Syringe}
          title={t("campaigns.noneOwed")}
        />
      ) : (
        <DataTable card={owedCard} minWidth="36rem" table={table} />
      )}
    </Section>
  );
};

/**
 * Who is **Due for a Campaign**: each Campaign that comes round by its interval, with the animals whose day has come or
 * comes within the fortnight — soonest first — and, for whoever raises the work, the Campaign raised in their Pens.
 */
export const CampaignsDueTab = ({ mayRaise }: { mayRaise: boolean }) => {
  const { t } = useLanguage();
  const due = useQuery(orpc.treatments.campaignsDue.queryOptions());
  return (
    <Loaded query={due}>
      {(due.data ?? []).length === 0 ? (
        <EmptyState
          description={t("campaigns.noIntervalHint")}
          icon={Syringe}
          title={t("campaigns.noInterval")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {(due.data ?? []).map((campaign) => (
            <CampaignOwed
              campaign={campaign}
              key={campaign.definitionId}
              mayRaise={mayRaise}
            />
          ))}
        </div>
      )}
    </Loaded>
  );
};

/** How many animals are owed a Campaign now, across them all: the tab's count. */
export const owedNow = (campaigns: readonly Campaign[] | undefined): number =>
  (campaigns ?? []).reduce(
    (sum, campaign) =>
      sum + campaign.animals.filter((one) => one.standing === "due").length,
    0
  );
