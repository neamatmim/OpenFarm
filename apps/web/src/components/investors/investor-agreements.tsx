import { formatDate, formatNumber } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@OpenFarm/ui/components/table";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Handshake, ScrollText } from "lucide-react";

import { Nothing, SaidDate } from "@/components/list-cells";
import { EmptyState, Section, StatusBadge } from "@/components/page";
import {
  useInvestorPapers,
  ProducedPaper,
} from "@/components/ventures/investor-papers";
import { StateBadge } from "@/components/ventures/venture-card";
import { PapersMenu } from "@/components/ventures/venture-investors";
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
  return {
    /** What their Units promised, on every paper not called off: what they signed to bring. */
    promisedBdt: theirs.agreements
      .filter((one) => one.venture.state !== "cancelled")
      .reduce((sum, one) => sum + one.promisedBdt, 0),
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
  capital_in: "investors.page.move.capitalIn",
  refund: "investors.page.move.refund",
  payout: "investors.page.move.payout",
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
  const { t, language } = useLanguage();
  const taka = useTaka();
  const papers = useInvestorPapers();
  return (
    <Section
      description={t("investors.page.agreementsHint")}
      title={t("investors.page.tab.agreements")}
    >
      {agreements.length === 0 ? (
        <EmptyState bare icon={Handshake} title={t("investors.noVentures")} />
      ) : (
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <Table className="min-w-[52rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="ps-4 md:ps-5">
                  {t("investors.page.venture")}
                </TableHead>
                <TableHead className="text-end">
                  {t("ventures.units")}
                </TableHead>
                <TableHead className="text-end">
                  {t("ventures.page.split")}
                </TableHead>
                <TableHead>{t("investors.page.signed")}</TableHead>
                <TableHead className="text-end">
                  {t("investors.page.capitalHeld")}
                </TableHead>
                <TableHead className="text-end">
                  {t("ventures.page.payout")}
                </TableHead>
                <TableHead className="pe-4 md:pe-5">
                  <span className="sr-only">{t("common.col.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agreements.map((one) => {
                const short =
                  one.venture.state === "open" &&
                  one.capitalHeldBdt < one.promisedBdt;
                return (
                  <TableRow key={one.id}>
                    <TableCell className="ps-4 md:ps-5">
                      <span className="flex flex-col items-start gap-1">
                        <Link
                          className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                          params={{ ventureId: one.venture.id }}
                          search={{ tab: "investors" }}
                          to="/ventures/$ventureId"
                        >
                          {one.venture.name}
                        </Link>
                        <StateBadge state={one.venture.state} />
                      </span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatNumber(one.units, language)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      <span className="flex flex-col items-end">
                        {t("ventures.page.splitIs", {
                          investors: formatNumber(
                            one.investorsPercent,
                            language
                          ),
                          farm: formatNumber(one.farmPercent, language),
                        })}
                        {one.amendedOn ? (
                          <span className="text-muted-foreground text-xs">
                            {t("investors.page.amendedOn", {
                              day: formatDate(
                                new Date(one.amendedOn),
                                language
                              ),
                            })}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-col items-start gap-1">
                        <SaidDate at={one.signedAt} />
                        <span className="text-muted-foreground font-mono text-xs">
                          {one.stamp.serial}
                        </span>
                        {one.hasPaper ? (
                          <StatusBadge tone="success">
                            {t("ventures.page.paperKept")}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="warning">
                            {t("ventures.page.paperMissing")}
                          </StatusBadge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      <span className={cn(short && "text-warning")}>
                        {taka(one.capitalHeldBdt)}
                      </span>
                      <span className="text-muted-foreground">
                        {` / ${taka(one.promisedBdt)}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-end">
                      <SettlementCell agreement={one} />
                    </TableCell>
                    <TableCell className="pe-4 md:pe-5">
                      <div className="flex justify-end">
                        {one.venture.state === "cancelled" ? null : (
                          <PapersMenu
                            agreementId={one.id}
                            hasPaid={one.capitalHeldBdt > 0}
                            name={investor.name}
                            papers={papers}
                            settled={one.settlement !== null}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {papers.produced ? <ProducedPaper produced={papers.produced} /> : null}
    </Section>
  );
};

/** The money table's words, as its reader is spoken to: the Owner reading about "them", or the Investor about "you". */
const MONEY_WORDS = {
  owner: {
    none: "investors.page.noMoney",
    back: "investors.page.toThem",
  },
  portal: {
    none: "portal.money.none",
    back: "portal.money.toYou",
  },
} as const satisfies Record<string, Record<string, MessageKey>>;

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
  if (!venture) {
    return <Nothing />;
  }
  const className =
    "underline-offset-4 hover:underline focus-visible:underline";
  return inThePortal ? (
    <Link
      className={className}
      params={{ agreementId }}
      to="/portal/ventures/$agreementId"
    >
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
  let inBdt = 0;
  let outBdt = 0;
  for (const one of movements) {
    if (INTO_THE_FARM[one.kind]) {
      inBdt += one.amountBdt;
    } else {
      outBdt += one.amountBdt;
    }
  }
  return (
    // In the portal the page it stands on says what it is; on the Owner's page of an Investor it is one tab of several.
    <Section
      description={inThePortal ? undefined : t("investors.page.moneyHint")}
      title={inThePortal ? undefined : t("investors.page.tab.money")}
    >
      {movements.length === 0 ? (
        <EmptyState bare icon={ScrollText} title={t(words.none)} />
      ) : (
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <Table className="min-w-[44rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="ps-4 md:ps-5">
                  {t("ventures.page.on")}
                </TableHead>
                <TableHead>{t("investors.page.venture")}</TableHead>
                <TableHead>{t("ventures.page.what")}</TableHead>
                <TableHead>{t("ventures.page.reference")}</TableHead>
                <TableHead className="text-end">
                  {t("investors.page.toTheFarm")}
                </TableHead>
                <TableHead className="pe-4 text-end md:pe-5">
                  {t(words.back)}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((one) => {
                const venture = ventureOf.get(one.agreementId);
                const into = INTO_THE_FARM[one.kind];
                return (
                  <TableRow key={`${one.kind}-${one.id}`}>
                    <TableCell className="ps-4 whitespace-nowrap md:ps-5">
                      <SaidDate at={one.movedOn} />
                    </TableCell>
                    <TableCell>
                      <VentureLink
                        agreementId={one.agreementId}
                        inThePortal={inThePortal}
                        venture={venture}
                      />
                    </TableCell>
                    <TableCell>{t(MOVEMENT_WORD[one.kind])}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {one.reference ?? <Nothing />}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {into ? taka(one.amountBdt) : <Nothing />}
                    </TableCell>
                    <TableCell className="pe-4 text-end tabular-nums md:pe-5">
                      {into ? <Nothing /> : taka(one.amountBdt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="ps-4 font-medium md:ps-5" colSpan={4}>
                  {t("ventures.page.total")}
                </TableCell>
                <TableCell className="text-end font-medium tabular-nums">
                  {taka(inBdt)}
                </TableCell>
                <TableCell className="pe-4 text-end font-medium tabular-nums md:pe-5">
                  {taka(outBdt)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </Section>
  );
};
