import { formatNumber } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  Copy,
  FileText,
  ImageIcon,
  PenLine,
  Users,
} from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { useInvestorNames } from "@/components/investors/investor-names";
import { Nothing } from "@/components/list-cells";
import { EmptyState, Section, StatusBadge } from "@/components/page";
import { RowMenu } from "@/components/page-kit";
import { AgreementPaperButton } from "@/components/ventures/agreement-paper";
import type { StatementKind } from "@/components/ventures/investor-papers";
import {
  AgreementAgain,
  PAPER_KINDS,
  ProducedPaper,
  useInvestorPapers,
} from "@/components/ventures/investor-papers";
import {
  AcknowledgeSheet,
  PayOutSheet,
  SharePaid,
} from "@/components/ventures/settling-up";
import type { VentureActs } from "@/components/ventures/venture-card";
import { Line, moneyOf } from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import { takesCapitalNow } from "@/lib/ventures";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Agreement = Awaited<ReturnType<typeof client.ventures.agreements>>[number];
type Share = Parameters<typeof SharePaid>[0]["share"];

/** How each kind of movement on an Agreement counts towards what it has paid: capital in, and capital sent back. */
const CAPITAL_SIGN: Readonly<Record<string, number>> = {
  capital_in: 1,
  refund: -1,
};

/**
 * What each Agreement has had paid against it: capital in, less any of it sent back. Read off the Venture's
 * own movements, which name the Agreement each taka came in on — the same list the account is added up from.
 */
const paidAgainst = (
  movements: readonly {
    kind: string;
    agreementId: string | null;
    amountBdt: number;
  }[]
) => {
  const paid = new Map<string, number>();
  for (const one of movements) {
    if (one.agreementId === null) {
      continue;
    }
    const sign = CAPITAL_SIGN[one.kind] ?? 0;
    paid.set(
      one.agreementId,
      (paid.get(one.agreementId) ?? 0) + sign * one.amountBdt
    );
  }
  return paid;
};

/** One Investor's papers, in a menu on his row: his three statements, each offered only once it can be made and saying
 *  why not until then — the joining letter and the progress statement once capital has come in, the settlement
 *  statement once the Settlement is approved — and the Agreement itself again: a marked copy to print, and the photo of
 *  the stamped original once the farm has kept one. */
export const PapersMenu = ({
  name,
  agreementId,
  hasPaid,
  settled,
  hasPhoto,
  papers,
}: {
  name: string;
  agreementId: string;
  hasPaid: boolean;
  settled: boolean;
  /** Whether the farm holds the photo of the stamped paper. */
  hasPhoto: boolean;
  papers: ReturnType<typeof useInvestorPapers>;
}) => {
  const { t } = useLanguage();
  const whyNot = (kind: StatementKind): MessageKey | null => {
    if (kind === "settlement") {
      return settled ? null : "statements.notSettledYet";
    }
    return hasPaid ? null : "statements.noCapitalYet";
  };
  return (
    <RowMenu
      actions={[
        ...PAPER_KINDS.map(({ kind, label, icon }) => {
          const why = whyNot(kind);
          return {
            label: t(label),
            icon,
            disabled: papers.busy || why !== null,
            hint: why ? t(why) : undefined,
            handleSelect: () => papers.ask(kind, agreementId),
          };
        }),
        {
          label: t("statements.agreementCopy"),
          icon: Copy,
          disabled: papers.busy,
          handleSelect: () => papers.askCopy(agreementId),
        },
        {
          label: t("statements.signedPaper"),
          icon: ImageIcon,
          disabled: papers.busy || !hasPhoto,
          hint: hasPhoto ? undefined : t("statements.noPaperPhoto"),
          handleSelect: () => papers.askPhoto(agreementId),
        },
      ]}
      label={t("statements.for", { name })}
      named={{ text: t("statements.title"), icon: FileText }}
    />
  );
};

/** One signed paper as the table reads it: the man's name, what he owes and has paid, his share of an approved
 *  Settlement, and what may be done from his row. */
interface InvestorRow extends Agreement {
  name: string;
  owedBdt: number;
  paidBdt: number;
  share: Share | undefined;
  /** Whether the Settlement is approved, and so each row says what it pays. */
  approved: boolean;
  /** The Settlement is approved: the settlement statement may be made. */
  settled: boolean;
  /** The Venture's own Advance is still out, and holds every payout until it is back. */
  advanceFirst: boolean;
  /** Capital is taken against the stamped paper, while the run is still gathering it. */
  mayTakeCapital: boolean;
  /** Nothing is done to the papers of a called-off Venture. */
  cancelled: boolean;
  papers: ReturnType<typeof useInvestorPapers>;
  handleTakeCapital: () => void;
  handlePay: () => void;
  handleAcknowledge: () => void;
}

interface InvestorCell {
  row: { original: InvestorRow };
}

/** His name, and what he writes on the transfer; an answer cached before the codes has none to show. */
const NameCell = ({ row }: InvestorCell) => {
  const { t } = useLanguage();
  return (
    <span className="flex flex-col">
      <span className="font-medium">{row.original.name}</span>
      {row.original.payInCode ? (
        <span className="text-muted-foreground font-mono text-xs">
          {t("ventures.payInCodeIs", { code: row.original.payInCode })}
        </span>
      ) : null}
    </span>
  );
};

const UnitsCell = ({ row }: InvestorCell) => {
  const { language } = useLanguage();
  return <>{formatNumber(row.original.units, language)}</>;
};

const SplitCell = ({ row }: InvestorCell) => {
  const { t, language } = useLanguage();
  return (
    <>
      {t("ventures.page.splitIs", {
        investors: formatNumber(row.original.investorsPercent, language),
        farm: formatNumber(row.original.farmPercent, language),
      })}
    </>
  );
};

/** What he has paid against what his Units are worth, the paid part in the warning's colour until they agree. */
const PaidCell = ({ row }: InvestorCell) => {
  const taka = useTaka();
  const { paidBdt, owedBdt } = row.original;
  return (
    <>
      <span className={paidBdt === owedBdt ? undefined : "text-warning"}>
        {taka(paidBdt)}
      </span>
      <span className="text-muted-foreground">{` / ${taka(owedBdt)}`}</span>
    </>
  );
};

/** Whether the farm holds the stamped paper's photo — the thing capital may not be taken without. */
const PaperCell = ({ row }: InvestorCell) => {
  const { t } = useLanguage();
  return row.original.hasPaper ? (
    <StatusBadge tone="success">{t("ventures.page.paperKept")}</StatusBadge>
  ) : (
    <StatusBadge tone="warning">{t("ventures.page.paperMissing")}</StatusBadge>
  );
};

const PayoutCell = ({ row }: InvestorCell) => {
  const taka = useTaka();
  const { share } = row.original;
  return share ? <>{taka(share.payoutBdt)}</> : <Nothing />;
};

/** What is done about one man's Agreement: his payout sent and his word on it written down, his capital taken, his
 *  stamped paper photographed, his papers made. */
const RowActions = ({
  row,
  idPrefix,
}: {
  row: InvestorRow;
  /** Where the row is drawn, so the table's and the phone card's photo buttons do not share an id. */
  idPrefix: string;
}) => {
  const { t } = useLanguage();
  return (
    <>
      {row.share ? (
        <SharePaid
          advanceFirst={row.advanceFirst}
          onAcknowledge={row.handleAcknowledge}
          onPay={row.handlePay}
          share={row.share}
        />
      ) : null}
      {row.mayTakeCapital ? (
        <Button
          onClick={row.handleTakeCapital}
          size="sm"
          type="button"
          variant="outline"
        >
          <Banknote aria-hidden data-icon="inline-start" />
          {t("ventures.takeCapital")}
        </Button>
      ) : null}
      {row.hasPaper || row.cancelled ? null : (
        <AgreementPaperButton agreementId={row.id} idPrefix={idPrefix} />
      )}
      {row.cancelled ? null : (
        <PapersMenu
          agreementId={row.id}
          hasPaid={row.paidBdt > 0}
          hasPhoto={row.hasPaper}
          name={row.name}
          papers={row.papers}
          settled={row.settled}
        />
      )}
    </>
  );
};

const ActionsCell = ({ row }: InvestorCell) => (
  <div className="flex flex-wrap items-center justify-end gap-2">
    <RowActions idPrefix="row" row={row.original} />
  </div>
);

const column = createListColumns<InvestorRow>();
const investorColumn = column.accessor("name", {
  header: listHeader("ventures.investor"),
  cell: NameCell,
});
const unitsColumn = column.accessor("units", {
  header: listHeader("ventures.units"),
  cell: UnitsCell,
  meta: { align: "end" },
});
const splitColumn = column.accessor("investorsPercent", {
  id: "split",
  header: listHeader("ventures.page.split"),
  cell: SplitCell,
  meta: { align: "end" },
});
const paidColumn = column.accessor("paidBdt", {
  id: "paid",
  header: listHeader("ventures.page.paidOfOwed"),
  cell: PaidCell,
  meta: { align: "end" },
});
const paperColumn = column.accessor((row) => (row.hasPaper ? 1 : 0), {
  id: "paper",
  header: listHeader("ventures.page.paper"),
  cell: PaperCell,
});
const payoutColumn = column.accessor((row) => row.share?.payoutBdt, {
  id: "payout",
  header: listHeader("ventures.page.payout"),
  cell: PayoutCell,
  meta: { align: "end" },
});
const actionsColumn = column.display({
  id: "actions",
  header: ActionsHeader,
  cell: ActionsCell,
  meta: { align: "end" },
});
const investorColumns = column.columns([
  investorColumn,
  unitsColumn,
  splitColumn,
  paidColumn,
  paperColumn,
  actionsColumn,
]);
const withPayoutColumns = column.columns([
  investorColumn,
  unitsColumn,
  splitColumn,
  paidColumn,
  paperColumn,
  payoutColumn,
  actionsColumn,
]);

/** One man's paper on a phone: who he is and whether the paper is kept, his figures under them, and what may be done
 *  about it at the foot. */
const InvestorCard = ({ row }: { row: InvestorRow }) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <NameCell row={{ original: row }} />
        <PaperCell row={{ original: row }} />
      </div>
      <div className="text-sm">
        <Line label={t("ventures.units")}>
          <UnitsCell row={{ original: row }} />
        </Line>
        <Line label={t("ventures.page.split")}>
          <SplitCell row={{ original: row }} />
        </Line>
        <Line label={t("ventures.page.paidOfOwed")}>
          <PaidCell row={{ original: row }} />
        </Line>
        {row.approved ? (
          <Line label={t("ventures.page.payout")}>
            <PayoutCell row={{ original: row }} />
          </Line>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RowActions idPrefix="card" row={row} />
      </div>
    </div>
  );
};

const investorCard = (row: InvestorRow) => <InvestorCard row={row} />;

/** The signed papers as rows, with a payout column once the Settlement is approved. */
const InvestorsTable = ({
  rows,
  approved,
}: {
  rows: InvestorRow[];
  approved: boolean;
}) => {
  const table = useListTable({
    columns: approved ? withPayoutColumns : investorColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return <DataTable card={investorCard} table={table} />;
};

/**
 * Who has signed this Venture and on what: their Units, the split those Units earn, the capital they have
 * paid against what the Units are worth, and whether the farm holds the stamped paper's photo — the thing
 * capital may not be taken without.
 *
 * What is done about one man's Agreement is done from his row: his capital taken, his stamped paper photographed,
 * his papers made — the paper shown beneath the table. Signing somebody new sits over the table, and so does capital
 * that came with only the bank's reference to say whose it is.
 */
export const VentureInvestors = ({
  venture,
  acts,
}: {
  venture: Venture;
  acts: VentureActs;
}) => {
  const { t, language } = useLanguage();
  const nameOf = useInvestorNames();
  const input = { input: { ventureId: venture.id } };
  const agreements = useQuery(orpc.ventures.agreements.queryOptions(input));
  const movements = useQuery(orpc.ventures.movements.queryOptions(input));
  const paid = paidAgainst(movements.data ?? []);
  const signed = moneyOf(venture).signedFor;
  const unitsLeft = venture.units - signed.units;
  const papers = useInvestorPapers();
  // Once the Settlement is approved, what each man is owed from it and whether it has gone — sent from his row,
  // as his capital and his papers are.
  const frozen = useQuery(orpc.ventures.approvedSettlement.queryOptions(input));
  const approved = frozen.data ?? null;
  const shareOf = new Map(
    (approved?.shares ?? []).map((one) => [one.agreementId, one] as const)
  );
  const advanceFirst =
    approved !== null && approved.advanceBdt !== 0 && !approved.advanceRepaid;
  const [paying, setPaying] =
    useState<Parameters<typeof PayOutSheet>[0]["what"]>(null);
  const [saying, setSaying] =
    useState<Parameters<typeof AcknowledgeSheet>[0]["what"]>(null);
  const open = venture.state === "open";
  // Open, or paid by the month and running: the Monthly Sums come in while it buys and fattens.
  const taking = takesCapitalNow(venture);
  const cancelled = venture.state === "cancelled";
  const settled = venture.settlementApproved ?? false;
  if (agreements.isPending) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  const agreed = agreements.data ?? [];
  /** Whether a paper may take capital now: its stamped photo is on file and its Units are not all paid for. An answer
   *  cached before `capitalLeftBdt` was sent works it out from what has come in against it. */
  const mayPayIn = (one: Agreement) =>
    one.hasPaper &&
    (one.capitalLeftBdt ??
      one.units * venture.unitPriceBdt - (paid.get(one.id) ?? 0)) > 0;
  // Money that lands with only the bank's reference to go on is taken from over the table, where the reference's
  // Pay-in Code chooses whose it is; money already known to be one man's is taken from his row.
  const someoneMayPayIn = agreed.some(mayPayIn);
  const rows = agreed.map((one): InvestorRow => {
    const share = shareOf.get(one.id);
    return {
      ...one,
      name: nameOf(one.investorId),
      owedBdt: one.units * venture.unitPriceBdt,
      paidBdt: paid.get(one.id) ?? 0,
      share,
      approved: approved !== null,
      settled,
      advanceFirst,
      mayTakeCapital: taking && mayPayIn(one),
      cancelled,
      papers,
      handleTakeCapital: () => acts.takeCapital(venture, one.id),
      handlePay: () => {
        if (share) {
          setPaying({
            ventureId: venture.id,
            kind: "share",
            title: share.name,
            amountBdt: share.payoutBdt,
            agreementId: one.id,
          });
        }
      },
      handleAcknowledge: () => {
        if (share) {
          setSaying({
            ventureId: venture.id,
            agreementId: one.id,
            title: share.name,
          });
        }
      },
    };
  });
  const actions = taking ? (
    <>
      {someoneMayPayIn ? (
        <Button
          onClick={() => acts.takeCapital(venture)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Banknote aria-hidden data-icon="inline-start" />
          {t("ventures.takeCapital")}
        </Button>
      ) : null}
      {open && unitsLeft > 0 ? (
        <Button onClick={() => acts.sign(venture)} size="sm" type="button">
          <PenLine aria-hidden data-icon="inline-start" />
          {t("ventures.sign")}
        </Button>
      ) : null}
    </>
  ) : null;
  return (
    <Section
      action={actions}
      description={t("ventures.unitsOfUnits", {
        taken: formatNumber(signed.units, language),
        units: formatNumber(venture.units, language),
        people: formatNumber(signed.people, language),
      })}
      title={t("ventures.page.tab.investors")}
    >
      {rows.length === 0 ? (
        <EmptyState bare icon={Users} title={t("ventures.page.nobodySigned")} />
      ) : (
        <InvestorsTable approved={approved !== null} rows={rows} />
      )}
      <PayOutSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setPaying(null);
          }
        }}
        open={paying !== null}
        what={paying}
      />
      <AcknowledgeSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setSaying(null);
          }
        }}
        open={saying !== null}
        what={saying}
      />
      {papers.produced ? (
        <div className="mt-4">
          <ProducedPaper produced={papers.produced} />
        </div>
      ) : null}
      <AgreementAgain papers={papers} />
    </Section>
  );
};
