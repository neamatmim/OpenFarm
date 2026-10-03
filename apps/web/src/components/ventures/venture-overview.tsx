import { isRunning, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

import { Section } from "@/components/page";
import { FigureTerm } from "@/components/page-kit";
import { VentureReturnsPanel } from "@/components/returns/returns-page";
import { InThePortal } from "@/components/ventures/in-the-portal";
import { PaidForBy } from "@/components/ventures/paid-for-by";
import { PlanAgainstActual } from "@/components/ventures/plan-against-actual";
import { RaisingBar } from "@/components/ventures/raising-bar";
import { VentureAccountPanel } from "@/components/ventures/venture-account";
import { Line, moneyOf } from "@/components/ventures/venture-card";
import { VenturePlanPanel } from "@/components/ventures/venture-plan";
import { VentureProjectionPanel } from "@/components/ventures/venture-projection";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";

/**
 * How far an Open Venture has got towards the money it is waiting on: what has come in, against the Floor it
 * may not start buying below and the target it is looking for. The Floor is marked on the bar, because that
 * is the line the button to start buying waits on.
 */
const TowardsTheFloor = ({ venture }: { venture: Venture }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <Section title={t("ventures.page.raising")}>
      <div className="flex flex-col gap-2">
        {/* Drawn for the eye; the line under it says the same in words, Floor and all, for everyone. */}
        <RaisingBar
          floorMoney={venture.floorMoney}
          inMoney={venture.capitalInMoney}
          targetMoney={venture.targetCapitalMoney}
        />
        <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-sm tabular-nums">
          <span className="text-foreground font-medium">
            {t("ventures.page.raised", { held: taka(venture.capitalInMoney) })}
          </span>
          <span>
            {t("ventures.page.floorAndTarget", {
              floor: taka(venture.floorMoney),
              target: taka(venture.targetCapitalMoney),
            })}
          </span>
        </div>
      </div>
    </Section>
  );
};

/**
 * Where its money is: what came in, what the account should hold, and every line that took it there — each
 * said in taka and on its own line, where the list's card had to fold three of them into one.
 */
const TheMoney = ({ venture }: { venture: Venture }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const money = moneyOf(venture);
  const running = isRunning(venture.state);
  return (
    <Section title={t("ventures.page.money")}>
      <div className="flex flex-col divide-y text-sm">
        <Line className="py-2" label={t("ventures.held")}>
          {taka(venture.capitalInMoney)}
        </Line>
        <Line className="py-2" label={t("ventures.balance")}>
          {taka(money.balanceMoney)}
        </Line>
        {running ? (
          <>
            <Line className="py-2" label={t("ventures.page.cattleLeft")}>
              {taka(money.cattleBudgetHeldMoney)}
            </Line>
            <Line className="py-2" label={t("ventures.page.runningLeft")}>
              {taka(money.runningBudgetHeldMoney)}
            </Line>
            {money.owedTheFarmMoney > 0 ? (
              <Line className="py-2" label={t("ventures.owedTheFarm")}>
                {taka(money.owedTheFarmMoney)}
              </Line>
            ) : null}
          </>
        ) : null}
        {venture.state === "open" ? null : (
          <>
            <Line className="py-2" label={t("ventures.page.spent")}>
              {taka(money.spentMoney)}
            </Line>
            <Line className="py-2" label={t("ventures.page.paidOut")}>
              {taka(money.paidOutMoney)}
            </Line>
          </>
        )}
        {money.openFloatMoney === 0 ? null : (
          <Line className="py-2" label={t("ventures.openFloat")}>
            {taka(money.openFloatMoney)}
          </Line>
        )}
        {money.reimbursedMoney === 0 ? null : (
          <Line className="py-2" label={t("ventures.reimbursedSoFar")}>
            {taka(money.reimbursedMoney)}
          </Line>
        )}
        {money.advancedMoney === 0 ? null : (
          <Line className="py-2" label={t("ventures.owedToYou")}>
            {taka(money.advancedMoney)}
          </Line>
        )}
      </div>
    </Section>
  );
};

/**
 * The terms it was opened on, each under its own name: what a Unit costs and how many there are, the two
 * budgets, the Floor and the day it is decided by, the selling window and the day the Wind-up Period ends.
 * The list's card could only say them in one line, run together; here there is room to read them.
 */
const TheTerms = ({ venture }: { venture: Venture }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const day = (on: string) => formatDate(startOfFarmDay(on), language, "date");
  return (
    <Section title={t("ventures.page.terms")}>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <FigureTerm size="sm" label={t("ventures.units")}>
          {t("ventures.unitsAt", {
            units: formatNumber(venture.units, language),
            price: taka(venture.unitPriceMoney),
          })}
        </FigureTerm>
        <FigureTerm size="sm" label={t("ventures.target")}>
          {taka(venture.targetCapitalMoney)}
        </FigureTerm>
        {/* A Venture read before it could be paid by the month is one paid before buying. */}
        <FigureTerm
          className="sm:col-span-2"
          label={t("ventures.paidFor.label")}
          size="sm"
        >
          <PaidForBy
            paidFor={{
              unitPriceMoney: venture.unitPriceMoney,
              monthly: venture.monthly ?? null,
            }}
          />
        </FigureTerm>
        <FigureTerm size="sm" label={t("ventures.page.cattleBudget")}>
          {taka(venture.cattleBudgetMoney)}
        </FigureTerm>
        <FigureTerm size="sm" label={t("ventures.page.runningBudget")}>
          {taka(venture.runningBudgetMoney)}
        </FigureTerm>
        <FigureTerm size="sm" label={t("ventures.floor")}>
          {taka(venture.floorMoney)}
        </FigureTerm>
        <FigureTerm size="sm" label={t("ventures.decideBy")}>
          {day(venture.decideBy)}
        </FigureTerm>
        <FigureTerm size="sm" label={t("ventures.window")}>
          {`${day(venture.targetWindow.start)} – ${day(venture.targetWindow.end)}`}
        </FigureTerm>
        {venture.windUpEndsOn ? (
          <FigureTerm size="sm" label={t("ventures.windUpEnds")}>
            {day(venture.windUpEndsOn)}
          </FigureTerm>
        ) : null}
      </dl>
      {venture.cancelledReason ? (
        <p className="text-muted-foreground border-t pt-3 text-sm">
          {venture.cancelledReason}
        </p>
      ) : null}
    </Section>
  );
};

/**
 * A Venture read whole. While it is Open: how near it is to starting, whether Investors are shown it, and its Venture
 * Account first, since that is where Investors pay; then its money, terms, plan and what the plan says it makes. Once
 * it is buying: how it is doing first — what it is projected to make, what it has returned, and its plan against what
 * happened — then its money and terms, the plan itself, and the account that carries its buying, refunds and payouts.
 */
export const VentureOverview = ({ venture }: { venture: Venture }) => {
  const open = venture.state === "open";
  const moneyAndTerms = (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <TheMoney venture={venture} />
      <TheTerms venture={venture} />
    </div>
  );
  if (open) {
    return (
      <div className="flex flex-col gap-4">
        <TowardsTheFloor venture={venture} />
        <InThePortal venture={venture} />
        <VentureAccountPanel venture={venture} />
        {moneyAndTerms}
        <VentureReturnsPanel ventureId={venture.id} />
        <VenturePlanPanel venture={venture} />
        <VentureProjectionPanel venture={venture} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <VentureProjectionPanel venture={venture} />
      <VentureReturnsPanel ventureId={venture.id} />
      <PlanAgainstActual venture={venture} />
      {moneyAndTerms}
      <VenturePlanPanel venture={venture} />
      <VentureAccountPanel venture={venture} />
    </div>
  );
};
