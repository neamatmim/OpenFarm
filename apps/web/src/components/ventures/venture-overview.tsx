import { isRunning, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

import { Section } from "@/components/page";
import { InThePortal } from "@/components/ventures/in-the-portal";
import { PlanAgainstActual } from "@/components/ventures/plan-against-actual";
import { VentureAccountPanel } from "@/components/ventures/venture-account";
import { Line, moneyOf } from "@/components/ventures/venture-card";
import { VenturePlanPanel } from "@/components/ventures/venture-plan";
import { VentureProjectionPanel } from "@/components/ventures/venture-projection";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";

const PERCENT = 100;

/** A share of a whole as a width, never past the end of the bar however far past it the money went. */
const widthOf = (part: number, whole: number) =>
  `${Math.min(PERCENT, Math.max(0, whole > 0 ? (part / whole) * PERCENT : 0))}%`;

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
        <div
          aria-hidden
          className="bg-muted relative h-3 overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full rounded-full"
            style={{
              width: widthOf(venture.capitalInBdt, venture.targetCapitalBdt),
            }}
          />
          <div
            aria-hidden
            className="bg-foreground/70 absolute inset-y-0 w-0.5"
            style={{
              left: widthOf(venture.floorBdt, venture.targetCapitalBdt),
            }}
          />
        </div>
        <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-sm tabular-nums">
          <span className="text-foreground font-medium">
            {t("ventures.page.raised", { held: taka(venture.capitalInBdt) })}
          </span>
          <span>
            {t("ventures.page.floorAndTarget", {
              floor: taka(venture.floorBdt),
              target: taka(venture.targetCapitalBdt),
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
          {taka(venture.capitalInBdt)}
        </Line>
        <Line className="py-2" label={t("ventures.balance")}>
          {taka(money.balanceBdt)}
        </Line>
        {running ? (
          <>
            <Line className="py-2" label={t("ventures.page.cattleLeft")}>
              {taka(money.cattleBudgetHeldBdt)}
            </Line>
            <Line className="py-2" label={t("ventures.page.runningLeft")}>
              {taka(money.runningBudgetHeldBdt)}
            </Line>
          </>
        ) : null}
        {venture.state === "open" ? null : (
          <>
            <Line className="py-2" label={t("ventures.page.spent")}>
              {taka(money.spentBdt)}
            </Line>
            <Line className="py-2" label={t("ventures.page.paidOut")}>
              {taka(money.paidOutBdt)}
            </Line>
          </>
        )}
        {money.openFloatBdt === 0 ? null : (
          <Line className="py-2" label={t("ventures.openFloat")}>
            {taka(money.openFloatBdt)}
          </Line>
        )}
        {money.reimbursedBdt === 0 ? null : (
          <Line className="py-2" label={t("ventures.reimbursedSoFar")}>
            {taka(money.reimbursedBdt)}
          </Line>
        )}
        {money.advancedBdt === 0 ? null : (
          <Line className="py-2" label={t("ventures.owedToYou")}>
            {taka(money.advancedBdt)}
          </Line>
        )}
      </div>
    </Section>
  );
};

/** One term of the run: what it is called, and what it says. */
const Term = ({ label, children }: { label: string; children: string }) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="text-sm font-medium break-words tabular-nums">{children}</dd>
  </div>
);

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
        <Term label={t("ventures.units")}>
          {t("ventures.unitsAt", {
            units: formatNumber(venture.units, language),
            price: taka(venture.unitPriceBdt),
          })}
        </Term>
        <Term label={t("ventures.target")}>
          {taka(venture.targetCapitalBdt)}
        </Term>
        <Term label={t("ventures.page.cattleBudget")}>
          {taka(venture.cattleBudgetBdt)}
        </Term>
        <Term label={t("ventures.page.runningBudget")}>
          {taka(venture.runningBudgetBdt)}
        </Term>
        <Term label={t("ventures.floor")}>{taka(venture.floorBdt)}</Term>
        <Term label={t("ventures.decideBy")}>{day(venture.decideBy)}</Term>
        <Term label={t("ventures.window")}>
          {`${day(venture.targetWindow.start)} – ${day(venture.targetWindow.end)}`}
        </Term>
        {venture.windUpEndsOn ? (
          <Term label={t("ventures.windUpEnds")}>
            {day(venture.windUpEndsOn)}
          </Term>
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

/** A Venture read whole: how near it is to starting and whether Investors are shown it, while it is Open; its Venture
 *  Account; where its money is; and its terms. */
export const VentureOverview = ({ venture }: { venture: Venture }) => (
  <div className="flex flex-col gap-4">
    {venture.state === "open" ? (
      <>
        <TowardsTheFloor venture={venture} />
        <InThePortal venture={venture} />
      </>
    ) : null}
    {/* Whatever it is doing: the same account carries its buying, its refunds and its payouts. */}
    <VentureAccountPanel venture={venture} />
    <VenturePlanPanel venture={venture} />
    <PlanAgainstActual venture={venture} />
    <VentureProjectionPanel venture={venture} />
    <div className="grid gap-4 lg:grid-cols-2">
      <TheMoney venture={venture} />
      <TheTerms venture={venture} />
    </div>
  </div>
);
