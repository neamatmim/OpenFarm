import { formatNumber } from "@OpenFarm/i18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";

import { RecordList, RecordRow } from "@/components/page";
import {
  CardBadges,
  StateBadge,
  Terms,
  moneyOf,
} from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import type { Venture } from "@/lib/ventures";

/** One figure of a Venture's money, as the sheet lists them. */
const Figure = ({ label, value }: { label: string; value: string }) => (
  <RecordRow
    title={label}
    trailing={<span className="text-sm font-medium tabular-nums">{value}</span>}
  />
);

/**
 * Everything about one Venture that the row it was opened from has no width for: every figure of its
 * money, where it stands, what is wrong with it, and the terms it was opened on.
 *
 * The row carries what the Owner compares Ventures by — what is held, what the account should hold, who
 * has signed, how the bank stands. This carries what she looks up about one of them, which is the rest.
 */
export const VentureDetailsSheet = ({
  venture,
  lastMonthOver,
  onOpenChange,
}: {
  venture: Venture | null;
  /** The last month that is over, so "straight with the bank" is claimed only up to it. */
  lastMonthOver: string;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const taka = (amount: number) => `৳${formatNumber(amount, language)}`;
  const money = venture ? moneyOf(venture) : null;
  return (
    <Sheet onOpenChange={onOpenChange} open={venture !== null}>
      <SheetContent
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{venture?.name ?? t("ventures.details")}</SheetTitle>
        </SheetHeader>
        {venture && money ? (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div className="flex flex-wrap gap-1">
              <StateBadge state={venture.state} />
              <CardBadges lastMonthOver={lastMonthOver} venture={venture} />
            </div>
            <RecordList>
              <Figure
                label={t("ventures.target")}
                value={taka(venture.targetCapitalBdt)}
              />
              <Figure
                label={t("ventures.held")}
                value={taka(venture.capitalInBdt)}
              />
              <Figure
                label={t("ventures.balance")}
                value={taka(money.balanceBdt)}
              />
              <Figure
                label={t("ventures.budgetsHeld")}
                value={t("ventures.budgetSplit", {
                  cattle: formatNumber(money.cattleBudgetHeldBdt, language),
                  running: formatNumber(money.runningBudgetHeldBdt, language),
                })}
              />
              <Figure
                label={t("ventures.outOfTheAccount")}
                value={`${taka(money.spentBdt)} · ${taka(money.paidOutBdt)}`}
              />
              {money.reimbursedBdt === 0 ? null : (
                <Figure
                  label={t("ventures.reimbursedSoFar")}
                  value={taka(money.reimbursedBdt)}
                />
              )}
              {money.openFloatBdt === 0 ? null : (
                <Figure
                  label={t("ventures.openFloat")}
                  value={taka(money.openFloatBdt)}
                />
              )}
              {money.advancedBdt === 0 ? null : (
                <Figure
                  label={t("ventures.owedToYou")}
                  value={taka(money.advancedBdt)}
                />
              )}
              <Figure
                label={t("ventures.signedFor")}
                value={t("ventures.unitsOfUnits", {
                  taken: formatNumber(money.signedFor.units, language),
                  units: formatNumber(venture.units, language),
                  people: formatNumber(money.signedFor.people, language),
                })}
              />
            </RecordList>
            <Terms venture={venture} />
            {venture.cancelledReason ? (
              <p className="text-muted-foreground text-sm">
                {venture.cancelledReason}
              </p>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
