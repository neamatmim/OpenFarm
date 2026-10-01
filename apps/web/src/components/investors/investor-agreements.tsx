import { hasEnded } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Handshake, ScrollText } from "lucide-react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Nothing, SaidDate } from "@/components/list-cells";
import { EmptyState, Section, StatusBadge } from "@/components/page";
import { usePortalPlaces } from "@/components/portal/portal-source";
import {
  AgreementAgain,
  useInvestorPapers,
  ProducedPaper,
} from "@/components/ventures/investor-papers";
import { Line, StateBadge } from "@/components/ventures/venture-card";
import { PapersMenu } from "@/components/ventures/venture-investors";
import { MoneyTotals } from "@/components/ventures/venture-money";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { orpc } from "@/utils/orpc";

/** One Investor's Agreements and money, as the server answers for their page. */
export type TheirAgreements = Awaited<
  ReturnType<typeof orpc.investors.agreements.call>
>;
type Agreement = TheirAgreements["agreements"][number];
type Movement = TheirAgreements["movements"][number];

/**
 * What one Investor's money comes to, the same sums wherever they are read — the Owner's page of them and their own
 * portal: what their Units promised, the capital paid in and sent back, the capital the Farm holds of theirs now and on
 * how many papers, what has been paid out to them, and their share of the profit from the Ventures settled. Money still in a Venture and money already home are counted apart:
 * a paper whose payout went has handed its capital back.
 */
export const portfolioOf = (theirs: TheirAgreements) => {
  const holding = theirs.agreements.filter((one) => !one.settlement?.paidOn);
  const settled = theirs.agreements.filter((one) => one.settlement !== null);
  const moved = (kind: TheirAgreements["movements"][number]["kind"]) =>
    theirs.movements
      .filter((one) => one.kind === kind)
      .reduce((sum, one) => sum + one.amountBdt, 0);
  // Counted as the Owner's page counts them: a Venture settled or called off is nobody's to pay into any more.
  const running = theirs.agreements.filter(
    (one) => !hasEnded(one.venture.state)
  );
  return {
    /** Of the Ventures still running: how many, the Units held in them, what those Units promised and how much of it
     *  has been paid in. One that has finished has nothing left to pay in. */
    running: running.length,
    runningUnits: running.reduce((sum, one) => sum + one.units, 0),
    runningPromisedBdt: running.reduce((sum, one) => sum + one.promisedBdt, 0),
    runningPaidInBdt: running.reduce((sum, one) => sum + one.capitalHeldBdt, 0),
    /** Capital that came in, and capital sent back when a Venture was called off. */
    paidInBdt: moved("capital_in"),
    returnedBdt: moved("refund"),
    heldBdt: holding.reduce((sum, one) => sum + one.capitalHeldBdt, 0),
    heldOn: holding.filter((one) => one.capitalHeldBdt > 0).length,
    paidOutBdt: moved("payout"),
    profitBdt: settled.reduce(
      (sum, one) => sum + (one.settlement?.shareBdt ?? 0),
      0
    ),
    settled: settled.length,
  };
};

/** What each line of their money was, in words. */
const MOVEMENT_WORD = {
  capital_in: "money.capitalIn",
  refund: "money.refund",
  payout: "money.payout",
} as const satisfies Record<Movement["kind"], MessageKey>;

/** Which way each kind of line moved their money: into the Farm's keeping, or back to them. */
const INTO_THE_FARM: Record<Movement["kind"], boolean> = {
  capital_in: true,
  refund: false,
  payout: false,
};

/** What a Settlement came to on one paper, and whether the money has reached them. */
const SettlementCell = ({ agreement }: { agreement: Agreement }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const { settlement } = agreement;
  if (!settlement) {
    return <Nothing />;
  }
  const said = () => {
    if (settlement.acknowledgedAt) {
      return (
        <StatusBadge tone="success">
          {t("investors.page.acknowledged")}
        </StatusBadge>
      );
    }
    if (settlement.paidOn) {
      return (
        <StatusBadge tone="info">{t("investors.page.paidNotSaid")}</StatusBadge>
      );
    }
    return (
      <StatusBadge tone="warning">{t("investors.page.notPaidYet")}</StatusBadge>
    );
  };
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="font-medium tabular-nums">
        {taka(settlement.payoutBdt)}
      </span>
      {said()}
    </span>
  );
};

/** One paper as the table reads it: the paper, and who signed it and their papers, for its menu. */
interface AgreementRow extends Agreement {
  investorName: string;
  papers: ReturnType<typeof useInvestorPapers>;
}

interface AgreementCell {
  row: { original: AgreementRow };
}

/** The Venture it is for, leading to its Investors, and where that stands. */
const VentureCell = ({ row }: AgreementCell) => {
  const { venture } = row.original;
  return (
    <span className="flex flex-col items-start gap-1">
      <Link
        className="font-medium underline-offset-4 hover:underline focus-visible:underline"
        params={{ ventureId: venture.id }}
        search={{ tab: "investors" }}
        to="/ventures/$ventureId"
      >
        {venture.name}
      </Link>
      <StateBadge state={venture.state} />
    </span>
  );
};

const UnitsCell = ({ row }: AgreementCell) => {
  const { language } = useLanguage();
  return <>{formatNumber(row.original.units, language)}</>;
};

/** The split in force today, and the day it was amended where it was. */
const SplitCell = ({ row }: AgreementCell) => {
  const { t, language } = useLanguage();
  const { investorsPercent, farmPercent, amendedOn } = row.original;
  return (
    <span className="flex flex-col items-end">
      {t("ventures.page.splitIs", {
        investors: formatNumber(investorsPercent, language),
        farm: formatNumber(farmPercent, language),
      })}
      {amendedOn ? (
        <span className="text-muted-foreground text-xs">
          {t("investors.page.amendedOn", {
            day: formatDate(new Date(amendedOn), language),
          })}
        </span>
      ) : null}
    </span>
  );
};

/** Whether the Farm keeps the stamped paper's photo. */
const PaperBadge = ({ agreement }: { agreement: Agreement }) => {
  const { t } = useLanguage();
  return agreement.hasPaper ? (
    <StatusBadge tone="success">{t("ventures.page.paperKept")}</StatusBadge>
  ) : (
    <StatusBadge tone="warning">{t("ventures.page.paperMissing")}</StatusBadge>
  );
};

/** The day it was signed, its stamp, and whether the Farm keeps its photo. */
const SignedCell = ({ row }: AgreementCell) => (
  <span className="flex flex-col items-start gap-1">
    <SaidDate at={row.original.signedAt} />
    <span className="text-muted-foreground font-mono text-xs">
      {row.original.stamp.serial}
    </span>
    <PaperBadge agreement={row.original} />
  </span>
);

/** The capital held on it against what its Units promised, the held part in the warning's colour while an open
 *  Venture still waits on some of it. */
const HeldCell = ({ row }: AgreementCell) => {
  const taka = useTaka();
  const { venture, capitalHeldBdt, promisedBdt } = row.original;
  const short = venture.state === "open" && capitalHeldBdt < promisedBdt;
  return (
    <>
      <span className={cn(short && "text-warning")}>
        {taka(capitalHeldBdt)}
      </span>
      <span className="text-muted-foreground">{` / ${taka(promisedBdt)}`}</span>
    </>
  );
};

const PayoutCell = ({ row }: AgreementCell) => (
  <SettlementCell agreement={row.original} />
);

/** Its three Investor Statements, for any paper but one on a called-off Venture. */
const PapersCell = ({ row }: AgreementCell) =>
  row.original.venture.state === "cancelled" ? null : (
    <PapersMenu
      agreementId={row.original.id}
      hasPaid={row.original.capitalHeldBdt > 0}
      hasPhoto={row.original.hasPaper}
      name={row.original.investorName}
      papers={row.original.papers}
      settled={row.original.settlement !== null}
    />
  );

const MenuCell = ({ row }: AgreementCell) => (
  <div className="flex justify-end">
    <PapersCell row={row} />
  </div>
);

const agreementColumn = createListColumns<AgreementRow>();
const agreementColumns = agreementColumn.columns([
  agreementColumn.accessor((row) => row.venture.name, {
    id: "venture",
    header: listHeader("investors.page.venture"),
    cell: VentureCell,
  }),
  agreementColumn.accessor("units", {
    header: listHeader("ventures.units"),
    cell: UnitsCell,
    meta: { align: "end" },
  }),
  agreementColumn.accessor("investorsPercent", {
    id: "split",
    header: listHeader("ventures.page.split"),
    cell: SplitCell,
    meta: { align: "end" },
  }),
  agreementColumn.accessor((row) => new Date(row.signedAt).getTime(), {
    id: "signed",
    header: listHeader("investors.page.signed"),
    cell: SignedCell,
  }),
  agreementColumn.accessor("capitalHeldBdt", {
    id: "held",
    header: listHeader("investors.page.capitalHeld"),
    cell: HeldCell,
    meta: { align: "end" },
  }),
  agreementColumn.accessor((row) => row.settlement?.payoutBdt, {
    id: "payout",
    header: listHeader("ventures.page.payout"),
    cell: PayoutCell,
    meta: { align: "end" },
  }),
  agreementColumn.display({
    id: "menu",
    header: ActionsHeader,
    cell: MenuCell,
    meta: { align: "end" },
  }),
]);

/** One paper on a phone: the Venture and where it stands, with its menu at the right, and its figures under them. */
const AgreementCard = ({ row }: { row: AgreementRow }) => {
  const { t } = useLanguage();
  const cell = { row: { original: row } };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <VentureCell {...cell} />
        <PapersCell {...cell} />
      </div>
      <div className="text-sm">
        <Line label={t("ventures.units")}>
          <UnitsCell {...cell} />
        </Line>
        <Line label={t("ventures.page.split")}>
          <SplitCell {...cell} />
        </Line>
        <Line label={t("investors.page.signed")}>
          <span className="flex flex-col items-end">
            <SaidDate at={row.signedAt} />
            <span className="text-muted-foreground font-mono text-xs">
              {row.stamp.serial}
            </span>
          </span>
        </Line>
        <Line label={t("ventures.page.paper")}>
          <PaperBadge agreement={row} />
        </Line>
        <Line label={t("investors.page.capitalHeld")}>
          <HeldCell {...cell} />
        </Line>
        <Line label={t("ventures.page.payout")}>
          <SettlementCell agreement={row} />
        </Line>
      </div>
    </div>
  );
};

const agreementCard = (row: AgreementRow) => <AgreementCard row={row} />;

const AgreementsTable = ({ rows }: { rows: AgreementRow[] }) => {
  const table = useListTable({
    columns: agreementColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return <DataTable card={agreementCard} minWidth="52rem" table={table} />;
};

/**
 * Every paper one Investor signed, the latest first: the Venture it is for and where that stands, the Units and
 * the split in force today, the day it was signed with its stamp and whether the Farm keeps its photo, the capital
 * held on it against what its Units promised, and what a Settlement paid on it. Each paper's three Investor
 * Statements are made from its row, and shown under the table.
 *
 * The acts on the money itself — taking capital, paying out — stay on the Venture's page, where the account they
 * move is.
 */
export const InvestorAgreements = ({
  investor,
  agreements,
}: {
  investor: { name: string };
  agreements: Agreement[];
}) => {
  const { t } = useLanguage();
  const papers = useInvestorPapers();
  return (
    <Section
      description={t("investors.page.agreementsHint")}
      title={t("investors.page.tab.agreements")}
    >
      {agreements.length === 0 ? (
        <EmptyState bare icon={Handshake} title={t("investors.noVentures")} />
      ) : (
        <AgreementsTable
          rows={agreements.map((one) => ({
            ...one,
            investorName: investor.name,
            papers,
          }))}
        />
      )}
      {papers.produced ? <ProducedPaper produced={papers.produced} /> : null}
      <AgreementAgain papers={papers} />
    </Section>
  );
};
/** The money table's words, as its reader is spoken to: the Owner reading about "them", or the Investor about "you". */
const MONEY_WORDS = {
  owner: {
    none: "investors.page.noMoney",
    noneHint: null,
    back: "investors.page.toThem",
  },
  portal: {
    none: "portal.money.none",
    noneHint: "portal.money.noneHint",
    back: "portal.money.toYou",
  },
} as const satisfies Record<string, Record<string, MessageKey | null>>;

/** The Venture a line of their money moved in, leading to the page of it the reader has: the Owner's, or the
 *  Investor's own in the portal, which is asked for by their Agreement. */
const VentureLink = ({
  venture,
  agreementId,
  inThePortal,
}: {
  venture: Agreement["venture"] | undefined;
  agreementId: string;
  inThePortal: boolean;
}) => {
  // In the portal the Venture is the reader's own page of it, wherever that portal is drawn — an Investor's own, or
  // the Owner's Preview of it.
  const inPortal = usePortalPlaces().venture(agreementId).link;
  if (!venture) {
    return <Nothing />;
  }
  const className =
    "underline-offset-4 hover:underline focus-visible:underline";
  return inThePortal ? (
    <Link className={className} params={inPortal.params} to={inPortal.to}>
      {venture.name}
    </Link>
  ) : (
    <Link
      className={className}
      params={{ ventureId: venture.id }}
      search={{ tab: "money" }}
      to="/ventures/$ventureId"
    >
      {venture.name}
    </Link>
  );
};

/** One line of their money as the table reads it: what it was called, the Venture it moved in, and whose page of that
 *  Venture it leads to. */
interface MovementRow extends Movement {
  word: string;
  venture: Agreement["venture"] | undefined;
  inThePortal: boolean;
}

interface MovementCell {
  row: { original: MovementRow };
}

const OnCell = ({ row }: MovementCell) => (
  <span className="whitespace-nowrap">
    <SaidDate at={row.original.movedOn} />
  </span>
);

const MovedInCell = ({ row }: MovementCell) => (
  <VentureLink
    agreementId={row.original.agreementId}
    inThePortal={row.original.inThePortal}
    venture={row.original.venture}
  />
);

const WhatCell = ({ row }: MovementCell) => row.original.word;

const ReferenceCell = ({ row }: MovementCell) => (
  <span className="font-mono text-xs">
    {row.original.reference ?? <Nothing />}
  </span>
);

const IntoCell = ({ row }: MovementCell) => {
  const taka = useTaka();
  return INTO_THE_FARM[row.original.kind] ? (
    <>{taka(row.original.amountBdt)}</>
  ) : (
    <Nothing />
  );
};

const BackCell = ({ row }: MovementCell) => {
  const taka = useTaka();
  return INTO_THE_FARM[row.original.kind] ? (
    <Nothing />
  ) : (
    <>{taka(row.original.amountBdt)}</>
  );
};

const moneyColumn = createListColumns<MovementRow>();
/** The columns, the last headed as its reader is spoken to. */
const moneyColumnsFor = (back: MessageKey) =>
  moneyColumn.columns([
    moneyColumn.accessor((row) => new Date(row.movedOn).getTime(), {
      id: "on",
      header: listHeader("ventures.page.on"),
      cell: OnCell,
    }),
    moneyColumn.accessor((row) => row.venture?.name, {
      id: "venture",
      header: listHeader("investors.page.venture"),
      cell: MovedInCell,
    }),
    moneyColumn.accessor("word", {
      header: listHeader("ventures.page.what"),
      cell: WhatCell,
    }),
    moneyColumn.accessor("reference", {
      header: listHeader("ventures.page.reference"),
      cell: ReferenceCell,
      enableSorting: false,
    }),
    moneyColumn.accessor(
      (row) => (INTO_THE_FARM[row.kind] ? row.amountBdt : undefined),
      {
        id: "in",
        header: listHeader("investors.page.toTheFarm"),
        cell: IntoCell,
        meta: { align: "end" },
      }
    ),
    moneyColumn.accessor(
      (row) => (INTO_THE_FARM[row.kind] ? undefined : row.amountBdt),
      {
        id: "back",
        header: listHeader(back),
        cell: BackCell,
        meta: { align: "end" },
      }
    ),
  ]);
const MONEY_COLUMNS = {
  owner: moneyColumnsFor(MONEY_WORDS.owner.back),
  portal: moneyColumnsFor(MONEY_WORDS.portal.back),
};

/** On a phone each line is a row of its own rather than six columns scrolled sideways: what it was and the amount
 *  first, then the day, the Venture and the reference under them. */
const MovementCard = ({ row }: { row: MovementRow }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const words = MONEY_WORDS[row.inThePortal ? "portal" : "owner"];
  const into = INTO_THE_FARM[row.kind];
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium">{row.word}</span>
        <span className="text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
          <SaidDate at={row.movedOn} />
          <VentureLink
            agreementId={row.agreementId}
            inThePortal={row.inThePortal}
            venture={row.venture}
          />
          {row.reference ? (
            <span className="font-mono">{row.reference}</span>
          ) : null}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-medium tabular-nums">{taka(row.amountBdt)}</span>
        <span className="text-muted-foreground text-xs">
          {into ? t("investors.page.toTheFarm") : t(words.back)}
        </span>
      </div>
    </div>
  );
};

const movementCard = (row: MovementRow) => <MovementCard row={row} />;

const MoneyTable = ({
  rows,
  inThePortal,
}: {
  rows: MovementRow[];
  inThePortal: boolean;
}) => {
  const table = useListTable({
    columns: MONEY_COLUMNS[inThePortal ? "portal" : "owner"],
    data: rows,
    getRowId: (row) => `${row.kind}-${row.id}`,
  });
  return <DataTable card={movementCard} minWidth="44rem" table={table} />;
};

/**
 * Every taka of one Investor's that moved, the latest first: capital that came in on a paper, capital sent back
 * when a Venture was called off, and each payout a Settlement made — with the day, the Venture, the reference it
 * went on, and what it all comes to.
 */
export const InvestorMoney = ({
  agreements,
  movements,
  inThePortal = false,
}: {
  agreements: Agreement[];
  movements: Movement[];
  /** Read by the Investor themselves: each Venture leads to their own page of it rather than the Owner's. */
  inThePortal?: boolean;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const words = MONEY_WORDS[inThePortal ? "portal" : "owner"];
  const ventureOf = new Map(
    agreements.map((one) => [one.id, one.venture] as const)
  );
  // The same sums the totals above the ledger are read from: in is capital received, out is payouts and refunds.
  const sums = portfolioOf({ agreements, movements });
  const inBdt = sums.paidInBdt;
  const outBdt = sums.paidOutBdt + sums.returnedBdt;
  return (
    // In the portal the page it stands on says what it is; on the Owner's page of an Investor it is one tab of several.
    <Section
      description={inThePortal ? undefined : t("investors.page.moneyHint")}
      title={inThePortal ? undefined : t("investors.page.tab.money")}
    >
      {movements.length === 0 ? (
        <EmptyState
          bare
          description={words.noneHint ? t(words.noneHint) : undefined}
          icon={ScrollText}
          title={t(words.none)}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <MoneyTable
            inThePortal={inThePortal}
            rows={movements.map((one) => ({
              ...one,
              word: t(MOVEMENT_WORD[one.kind]),
              venture: ventureOf.get(one.agreementId),
              inThePortal,
            }))}
          />
          <MoneyTotals
            figures={[
              { label: t("investors.page.toTheFarm"), value: taka(inBdt) },
              { label: t(words.back), value: taka(outBdt) },
            ]}
          />
        </div>
      )}
    </Section>
  );
};
