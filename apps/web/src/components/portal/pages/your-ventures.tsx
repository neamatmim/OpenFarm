import { hasEnded } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Link, useNavigate } from "@tanstack/react-router";
import { CircleCheck, Handshake, Sprout } from "lucide-react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import type { TheirAgreements } from "@/components/investors/investor-agreements";
import { Nothing, SaidDate } from "@/components/list-cells";
import type { Tone } from "@/components/page";
import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { PageTabs } from "@/components/page-kit";
import { ListSkeleton } from "@/components/portal/portal-skeletons";
import {
  usePortalPlaces,
  useTheirPortfolio,
} from "@/components/portal/portal-source";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";

type HisAgreement = TheirAgreements["agreements"][number];

const TABS = ["running", "finished"] as const;
type Tab = (typeof TABS)[number];

/** Whether a Venture has run its course: settled, or called off with every taka sent back. */
const hasFinished = (one: HisAgreement) => hasEnded(one.venture.state);

/** How each stage is said beside its name: under way, done, or called off. */
const STAGE_TONE: Record<HisAgreement["venture"]["state"], Tone> = {
  open: "info",
  buying: "info",
  fattening: "info",
  selling: "info",
  settled: "success",
  cancelled: "neutral",
};

/** The Venture's name, opening their own page of it. */
const VentureCell = ({ row }: { row: { original: HisAgreement } }) => {
  const { to, params } = usePortalPlaces().venture(row.original.id).link;
  return (
    <Link
      className="font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
      params={params}
      to={to}
    >
      {row.original.venture.name}
    </Link>
  );
};

const StageCell = ({ row }: { row: { original: HisAgreement } }) => {
  const { t } = useLanguage();
  const { state } = row.original.venture;
  return (
    <StatusBadge tone={STAGE_TONE[state]}>
      {t(`ventures.state.${state}`)}
    </StatusBadge>
  );
};

const UnitsCell = ({ row }: { row: { original: HisAgreement } }) => {
  const { language } = useLanguage();
  return <>{formatNumber(row.original.units, language)}</>;
};

const CapitalCell = ({ row }: { row: { original: HisAgreement } }) => {
  const taka = useTaka();
  return <>{taka(row.original.capitalHeldBdt)}</>;
};

const SplitCell = ({ row }: { row: { original: HisAgreement } }) => {
  const { t, language } = useLanguage();
  return (
    <>
      {t("portal.percent", {
        percent: formatNumber(row.original.investorsPercent, language),
      })}
    </>
  );
};

const WindowCell = ({ row }: { row: { original: HisAgreement } }) => (
  <>
    <SaidDate at={row.original.targetWindow.start} /> –{" "}
    <SaidDate at={row.original.targetWindow.end} />
  </>
);

const ShareCell = ({ row }: { row: { original: HisAgreement } }) => {
  const taka = useTaka();
  const { settlement } = row.original;
  return settlement ? <>{taka(settlement.shareBdt)}</> : <Nothing />;
};

const PayoutCell = ({ row }: { row: { original: HisAgreement } }) => {
  const taka = useTaka();
  const { settlement } = row.original;
  return settlement ? <>{taka(settlement.payoutBdt)}</> : <Nothing />;
};

const PaidOnCell = ({ row }: { row: { original: HisAgreement } }) => {
  const { t } = useLanguage();
  const { settlement } = row.original;
  if (!settlement) {
    return <Nothing />;
  }
  return settlement.paidOn ? (
    <SaidDate at={settlement.paidOn} />
  ) : (
    <span className="text-muted-foreground">
      {t("investors.page.notPaidYet")}
    </span>
  );
};

const ONE_LINE = { className: "whitespace-nowrap" };
const FIGURE = { align: "end" as const, className: "whitespace-nowrap" };

const columns = createListColumns<HisAgreement>();

const name = columns.accessor((row) => row.venture.name, {
  id: "venture",
  header: listHeader("portal.ventures.venture"),
  cell: VentureCell,
});
const stage = columns.accessor((row) => row.venture.state, {
  id: "stage",
  header: listHeader("portal.ventures.stage"),
  cell: StageCell,
  meta: ONE_LINE,
});
const units = columns.accessor("units", {
  header: listHeader("portal.units"),
  cell: UnitsCell,
  meta: FIGURE,
});
const capital = columns.accessor("capitalHeldBdt", {
  header: listHeader("portal.capital"),
  cell: CapitalCell,
  meta: FIGURE,
});

/** A Venture under way: where it has got to, their Units and capital, their part of the profit and when it sells. */
const RUNNING = columns.columns([
  name,
  stage,
  units,
  capital,
  columns.accessor("investorsPercent", {
    header: listHeader("portal.split"),
    cell: SplitCell,
    meta: FIGURE,
  }),
  columns.accessor((row) => row.targetWindow.start, {
    id: "window",
    header: listHeader("portal.window"),
    cell: WindowCell,
    meta: ONE_LINE,
  }),
]);

/** A Venture that has run its course: how it ended, and what came of it for them — their share, their payout, and
 *  the day it reached them. */
const FINISHED = columns.columns([
  name,
  stage,
  units,
  capital,
  columns.accessor((row) => row.settlement?.shareBdt ?? null, {
    id: "share",
    header: listHeader("portal.profit"),
    cell: ShareCell,
    meta: FIGURE,
  }),
  columns.accessor((row) => row.settlement?.payoutBdt ?? null, {
    id: "payout",
    header: listHeader("portal.paidOut"),
    cell: PayoutCell,
    meta: FIGURE,
  }),
  columns.accessor((row) => row.settlement?.paidOn ?? null, {
    id: "paidOn",
    header: listHeader("portal.ventures.paidOn"),
    cell: PaidOnCell,
    meta: ONE_LINE,
  }),
]);

/** One Venture as a row on a phone: its name and stage, their capital, and when it sells or what it paid them. */
const VentureRow = ({ one }: { one: HisAgreement }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const { to, params } = usePortalPlaces().venture(one.id).link;
  return (
    <Link
      className="flex items-start justify-between gap-3 text-sm outline-none focus-visible:underline"
      params={params}
      to={to}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium">{one.venture.name}</span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <StageCell row={{ original: one }} />
          <span>{t("portal.unitsHeld", { count: one.units })}</span>
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-medium tabular-nums">
          {taka(one.settlement?.payoutBdt ?? one.capitalHeldBdt)}
        </span>
        <span className="text-muted-foreground text-xs">
          {one.settlement ? (
            <PaidOnCell row={{ original: one }} />
          ) : (
            t("portal.percent", {
              percent: formatNumber(one.investorsPercent, language),
            })
          )}
        </span>
      </div>
    </Link>
  );
};

const ventureRow = (one: HisAgreement) => <VentureRow one={one} />;

/** One tab's Ventures as a table, or why there are none. */
const TheirTable = ({ tab, rows }: { tab: Tab; rows: HisAgreement[] }) => {
  const { t } = useLanguage();
  const table = useListTable({
    columns: tab === "running" ? RUNNING : FINISHED,
    data: rows,
    getRowId: (row) => row.id,
  });
  if (rows.length === 0) {
    return (
      <EmptyState
        bare
        icon={tab === "running" ? Sprout : CircleCheck}
        title={t(
          tab === "running"
            ? "portal.ventures.noneRunning"
            : "portal.ventures.noneFinished"
        )}
      />
    );
  }
  return <DataTable card={ventureRow} minWidth="44rem" table={table} />;
};

/** Every Venture they are in or have been in, running and finished apart, once it is read. */
const TheirVentures = ({
  theirs,
  tab,
}: {
  theirs: TheirAgreements;
  tab: Tab;
}) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const places = usePortalPlaces();
  if (theirs.agreements.length === 0) {
    return <EmptyState icon={Handshake} title={t("portal.noVentures")} />;
  }
  const finished = theirs.agreements.filter(hasFinished);
  const running = theirs.agreements.filter((one) => !hasFinished(one));
  return (
    <PageTabs
      onChange={(value) =>
        navigate({
          ...places.ventures.link,
          replace: true,
          search: value === "running" ? {} : { tab: value },
        })
      }
      tabs={[
        {
          value: "running",
          label: t("ventures.tab.running"),
          icon: Sprout,
          content: (
            <Section>
              <TheirTable rows={running} tab="running" />
            </Section>
          ),
        },
        {
          value: "finished",
          label: t("portal.ventures.finished"),
          icon: CircleCheck,
          content: (
            <Section>
              <TheirTable rows={finished} tab="finished" />
            </Section>
          ),
        },
      ]}
      value={tab}
    />
  );
};

/**
 * «আপনার ভেঞ্চার»: every Venture an Investor is in or has been in, as a table — the ones still running, and those that
 * have settled or were called off — each opening their own page of it. A place of its own, because a portfolio page
 * with a card for every Venture of every year would bury the one running now.
 */
export const PortalYourVentures = ({ tab = "running" }: { tab?: Tab }) => {
  const { t } = useLanguage();
  const theirs = useTheirPortfolio();
  return (
    <Page>
      <PageHeader
        description={t("portal.ventures.hint")}
        title={t("portal.yourVentures")}
      />
      <Loaded query={theirs} skeleton={<ListSkeleton lines={4} />}>
        {theirs.data ? <TheirVentures tab={tab} theirs={theirs.data} /> : null}
      </Loaded>
    </Page>
  );
};

/** What the address may say about this page: which of its two tabs is open. */
export interface YourVenturesSearch {
  tab?: Tab;
}

/** The address's word on which tab is open, in the portal and in the Preview alike. */
export const yourVenturesSearch = (
  search: Record<string, unknown>
): YourVenturesSearch => (search.tab === "finished" ? { tab: "finished" } : {});
