import { formatNumber } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@OpenFarm/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { Banknote, FileText, PenLine, Users } from "lucide-react";

import { useInvestorNames } from "@/components/investors/investor-names";
import { EmptyState, Section, StatusBadge } from "@/components/page";
import { RowMenu } from "@/components/page-kit";
import { AgreementPaperButton } from "@/components/ventures/agreement-paper";
import type { StatementKind } from "@/components/ventures/investor-papers";
import {
  PAPER_KINDS,
  ProducedPaper,
  useInvestorPapers,
} from "@/components/ventures/investor-papers";
import type { VentureActs } from "@/components/ventures/venture-card";
import { moneyOf } from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

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

/** One Investor's three papers, in a menu on his row: each offered only once it can be made, and saying why not
 *  until then — the joining letter and the progress statement once capital has come in, the settlement statement
 *  once the Settlement is approved. */
const PapersMenu = ({
  name,
  agreementId,
  hasPaid,
  settled,
  papers,
}: {
  name: string;
  agreementId: string;
  hasPaid: boolean;
  settled: boolean;
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
      actions={PAPER_KINDS.map(({ kind, label, icon }) => {
        const why = whyNot(kind);
        return {
          label: t(label),
          icon,
          disabled: papers.busy || why !== null,
          hint: why ? t(why) : undefined,
          handleSelect: () => papers.ask(kind, agreementId),
        };
      })}
      label={t("statements.for", { name })}
      named={{ text: t("statements.title"), icon: FileText }}
    />
  );
};

/**
 * Who has signed this Venture and on what: their Units, the split those Units earn, the capital they have
 * paid against what the Units are worth, and whether the farm holds the stamped paper's photo — the thing
 * capital may not be taken without.
 *
 * What is done about one man's Agreement is done from his row: his capital taken, his stamped paper photographed,
 * his papers made — the paper shown beneath the table. Signing somebody new sits over the table.
 */
export const VentureInvestors = ({
  venture,
  acts,
}: {
  venture: Venture;
  acts: VentureActs;
}) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const nameOf = useInvestorNames();
  const input = { input: { ventureId: venture.id } };
  const agreements = useQuery(orpc.ventures.agreements.queryOptions(input));
  const movements = useQuery(orpc.ventures.movements.queryOptions(input));
  const paid = paidAgainst(movements.data ?? []);
  const signed = moneyOf(venture).signedFor;
  const unitsLeft = venture.units - signed.units;
  const papers = useInvestorPapers();
  const open = venture.state === "open";
  const cancelled = venture.state === "cancelled";
  const settled = venture.settlementApproved ?? false;
  const actions =
    open && unitsLeft > 0 ? (
      <Button onClick={() => acts.sign(venture)} size="sm" type="button">
        <PenLine aria-hidden data-icon="inline-start" />
        {t("ventures.sign")}
      </Button>
    ) : null;
  if (agreements.isPending) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  const rows = agreements.data ?? [];
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
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <Table className="min-w-[40rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="ps-4 md:ps-5">
                  {t("ventures.investor")}
                </TableHead>
                <TableHead className="text-end">
                  {t("ventures.units")}
                </TableHead>
                <TableHead className="text-end">
                  {t("ventures.page.split")}
                </TableHead>
                <TableHead className="text-end">
                  {t("ventures.page.paidOfOwed")}
                </TableHead>
                <TableHead>{t("ventures.page.paper")}</TableHead>
                <TableHead className="pe-4 md:pe-5">
                  <span className="sr-only">{t("common.col.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((one) => {
                const owed = one.units * venture.unitPriceBdt;
                const hasPaid = paid.get(one.id) ?? 0;
                return (
                  <TableRow key={one.id}>
                    <TableCell className="ps-4 font-medium md:ps-5">
                      {nameOf(one.investorId)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatNumber(one.units, language)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {t("ventures.page.splitIs", {
                        investors: formatNumber(one.investorsPercent, language),
                        farm: formatNumber(one.farmPercent, language),
                      })}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      <span
                        className={
                          hasPaid === owed ? undefined : "text-warning"
                        }
                      >
                        {taka(hasPaid)}
                      </span>
                      <span className="text-muted-foreground">
                        {` / ${taka(owed)}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      {one.hasPaper ? (
                        <StatusBadge tone="success">
                          {t("ventures.page.paperKept")}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="warning">
                          {t("ventures.page.paperMissing")}
                        </StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="pe-4 md:pe-5">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {/* Capital is taken against the stamped paper, while the run is still gathering it. */}
                        {open && one.hasPaper && hasPaid < owed ? (
                          <Button
                            onClick={() => acts.takeCapital(venture, one.id)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Banknote aria-hidden data-icon="inline-start" />
                            {t("ventures.takeCapital")}
                          </Button>
                        ) : null}
                        {one.hasPaper || cancelled ? null : (
                          <AgreementPaperButton
                            agreementId={one.id}
                            idPrefix="row"
                          />
                        )}
                        {cancelled ? null : (
                          <PapersMenu
                            agreementId={one.id}
                            hasPaid={hasPaid > 0}
                            name={nameOf(one.investorId)}
                            papers={papers}
                            settled={settled}
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
      {papers.produced ? (
        <div className="mt-4">
          <ProducedPaper produced={papers.produced} />
        </div>
      ) : null}
    </Section>
  );
};
