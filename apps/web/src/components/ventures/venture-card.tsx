import { startOfFarmDay } from "@OpenFarm/domain";
import type { MessageKey, MessageParams } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Banknote,
  FileText,
  Gavel,
  Landmark,
  PenLine,
  PiggyBank,
  Receipt,
  Scale,
  ScrollText,
  ShoppingCart,
  TrendingUp,
  Truck,
  Wheat,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/page";
import type { RowAction } from "@/components/page-kit";
import { RowMenu } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { saidMonth } from "@/lib/months";
import type { Venture } from "@/lib/ventures";
import { monthsStillOut, pastWindUp } from "@/lib/ventures";

/** Where a Venture stands, in a word the Owner reads at a glance. */
const TONES = {
  open: "info",
  buying: "info",
  fattening: "info",
  selling: "info",
  settled: "success",
  cancelled: "neutral",
} as const;

const StateBadge = ({ state }: { state: Venture["state"] }) => {
  const { t } = useLanguage();
  return (
    <StatusBadge tone={TONES[state]}>
      {t(`ventures.state.${state}`)}
    </StatusBadge>
  );
};

/**
 * How a Venture's account stands against the bank: every month still out, and which of them went stale.
 *
 * The two are said separately because they are different problems — a stale month needs the statement
 * read again, a disagreeing one needs explaining — and both are said, because a Venture with one of each
 * has both to deal with. Straight with the bank is claimed only up to the last month that is over: an
 * account nobody has read since July is not straight in October, it is unread.
 */
const BankStanding = ({
  bank,
  lastMonthOver,
}: {
  bank: Venture["bank"];
  lastMonthOver: string;
}) => {
  const { t, language } = useLanguage();
  // A month is stored as 2026-08 and said as আগস্ট ২০২৬: the badge is a Bangla sentence, and a farm
  // reading it should not have to decode a date format in the middle of one.
  const said = (month: string) => saidMonth(month, language);
  const saidAll = (months: string[]) => months.map(said).join(", ");
  const { stale, disagreed } = monthsStillOut(bank);
  if (stale.length > 0 || disagreed.length > 0) {
    return (
      <>
        {stale.length > 0 ? (
          <StatusBadge tone="warning">
            {t("ventures.bankStale", { month: saidAll(stale) })}
          </StatusBadge>
        ) : null}
        {disagreed.length > 0 ? (
          <StatusBadge tone="warning">
            {t("ventures.bankDisagrees", { month: saidAll(disagreed) })}
          </StatusBadge>
        ) : null}
      </>
    );
  }
  if (!bank?.lastCheckedMonth) {
    return (
      <StatusBadge tone="neutral">{t("ventures.bankNeverChecked")}</StatusBadge>
    );
  }
  // Named, and this way round, because the guard against untranslated JSX text takes a closing angle
  // bracket in an expression for the end of a tag.
  const readToTheLastMonthOver = lastMonthOver <= bank.lastCheckedMonth;
  return readToTheLastMonthOver ? (
    <StatusBadge tone="success">
      {t("ventures.bankStraight", { month: said(bank.lastCheckedMonth) })}
    </StatusBadge>
  ) : (
    <StatusBadge tone="neutral">
      {t("ventures.bankUnreadSince", { month: said(bank.lastCheckedMonth) })}
    </StatusBadge>
  );
};

/** What a Venture's card needs of the figures, whatever shape the answer it was drawn from had. A phone
 *  can be holding a fortnight-old cache written before any of this existed. */
const moneyOf = (venture: Venture) => ({
  balanceBdt: venture.balanceBdt ?? 0,
  cattleBudgetHeldBdt: venture.cattleBudgetHeldBdt ?? 0,
  runningBudgetHeldBdt: venture.runningBudgetHeldBdt ?? 0,
  spentBdt: venture.spentBdt ?? 0,
  reimbursedBdt: venture.reimbursedBdt ?? 0,
  advancedBdt: venture.advancedBdt ?? 0,
  openFloatBdt: venture.openFloatBdt ?? 0,
  paidOutBdt: venture.paidOutBdt ?? 0,
  signedFor: venture.signedFor ?? { units: 0, people: 0 },
});

/**
 * Whether the run is still on.
 *
 * What is left of each budget is a question about a Venture that is still feeding animals. Once the
 * payouts have gone the balance is nearly nothing while the cattle side still counts its whole share,
 * so the figure turns deeply negative — a settled run read "৳-1,83,359 to feed with", which is not a
 * thing that happened to it. The server draws the same line for the low-budget warning, saying "one
 * whose run is over is not feeding anybody"; this is that line, one row further down the card.
 */
const stillRunning = (venture: Venture) =>
  venture.state === "buying" ||
  venture.state === "fattening" ||
  venture.state === "selling";

/**
 * Whether anybody is owed one of the three papers.
 *
 * Asked of the Agreements rather than of the Venture's state, because the first of the three is wanted
 * while it is still Open — capital arrives before an animal is bought — and the last of them is wanted
 * after it has settled. A run that was called off has refunded every taka and owes nobody a paper.
 */
const hasPapersToGive = (venture: Venture) =>
  moneyOf(venture).signedFor.people !== 0 && venture.state !== "cancelled";

/**
 * Whether the terms can still move.
 *
 * Once a Settlement is approved every Investor has been paid on the split and the window as they then
 * stood, so the farm refuses an amendment — and a button that can only ever be refused is worse than no
 * button, because somebody fills the whole form before hearing it.
 */
const termsCanStillMove = (venture: Venture) => venture.state !== "settled";

/** Everything one card can ask the page to open. One object rather than sixteen props, so a new act is
 *  one line here and one line there rather than a fourth row of buttons. */
export interface VentureActs {
  sign: (venture: Venture) => void;
  takeCapital: (venture: Venture) => void;
  callOff: (venture: Venture) => void;
  drawFloat: (venture: Venture) => void;
  countFloat: (venture: Venture) => void;
  reimburse: (venture: Venture) => void;
  buyWhatIsLeft: (venture: Venture) => void;
  settle: (venture: Venture) => void;
  advance: (venture: Venture) => void;
  checkTheBank: (venture: Venture) => void;
  seeMovements: (venture: Venture) => void;
  statements: (venture: Venture) => void;
  economics: (venture: Venture) => void;
  amend: (venture: Venture) => void;
  startBuying: (venture: Venture) => void;
  startFattening: (venture: Venture) => void;
}

const Line = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex justify-between gap-2 py-0.5">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium tabular-nums">{children}</span>
  </div>
);

/**
 * Why the button that moves a Venture along is dim, and what pressing it will cost her.
 *
 * Its own component because the card was over the complexity the linter allows, and because these are
 * one idea: the act is there, and here is what stands in front of it. A dim button is not a reason.
 */
const WhatStopsHer = ({ venture }: { venture: Venture }) => {
  const { t, language } = useLanguage();
  if (venture.state === "open") {
    const short = venture.floorBdt - venture.capitalInBdt;
    return (
      <p className="text-muted-foreground text-right text-sm">
        {short > 0
          ? t("ventures.floorNotMetYet", {
              short: formatNumber(short, language),
            })
          : t("ventures.startBuyingHint")}
      </p>
    );
  }
  if (venture.state === "buying" && moneyOf(venture).openFloatBdt !== 0) {
    return (
      <p className="text-muted-foreground text-right text-sm">
        {t("ventures.floatStillOut")}
      </p>
    );
  }
  return null;
};

/**
 * The few figures the card is read by, chosen by where the Venture stands.
 *
 * A run still Open is read against what it is looking for and what it may not start below; one that is
 * running is read against what its account holds and what is left to feed with; one that is over is read
 * against what went out of it. The rest of the terms are said once, quietly, under them.
 */
const MoneyLines = ({
  venture,
  onSeeMovements,
}: {
  venture: Venture;
  onSeeMovements: () => void;
}) => {
  const { t, language } = useLanguage();
  const money = moneyOf(venture);
  const taka = (amount: number) => `৳${formatNumber(amount, language)}`;
  const held = (
    <button
      aria-label={t("ventures.movements")}
      className="rounded-md outline-none hover:underline focus-visible:ring-2"
      onClick={onSeeMovements}
      type="button"
    >
      {taka(venture.capitalInBdt)}
    </button>
  );
  return (
    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
      <Line label={t("ventures.held")}>{held}</Line>
      {venture.state === "open" ? (
        <Line label={t("ventures.target")}>
          {taka(venture.targetCapitalBdt)}
        </Line>
      ) : (
        <Line label={t("ventures.balance")}>{taka(money.balanceBdt)}</Line>
      )}
      <Line label={t("ventures.signedFor")}>
        {t("ventures.unitsOfUnits", {
          taken: formatNumber(money.signedFor.units, language),
          units: formatNumber(venture.units, language),
          people: formatNumber(money.signedFor.people, language),
        })}
      </Line>
      {stillRunning(venture) ? (
        <Line label={t("ventures.budgetsHeld")}>
          {t("ventures.budgetSplit", {
            cattle: formatNumber(money.cattleBudgetHeldBdt, language),
            running: formatNumber(money.runningBudgetHeldBdt, language),
          })}
        </Line>
      ) : null}
      {money.openFloatBdt === 0 ? null : (
        <Line label={t("ventures.openFloat")}>{taka(money.openFloatBdt)}</Line>
      )}
      {money.advancedBdt === 0 ? null : (
        <Line label={t("ventures.owedToYou")}>{taka(money.advancedBdt)}</Line>
      )}
      {venture.state === "open" ? null : (
        <Line label={t("ventures.outOfTheAccount")}>
          {`${taka(money.spentBdt)} · ${taka(money.paidOutBdt)}`}
        </Line>
      )}
      {money.reimbursedBdt === 0 ? null : (
        <Line label={t("ventures.reimbursedSoFar")}>
          {taka(money.reimbursedBdt)}
        </Line>
      )}
    </div>
  );
};

/**
 * The terms, said once and quietly: what a Unit costs and how many there are, the two budgets, the floor
 * and the day it is decided by, the selling window, and the day the Wind-up Period ends.
 *
 * Under the figures rather than among them, because these do not change while the run is on — the Owner
 * reads them when she is asked about them, not every time she opens the page.
 */
const Terms = ({ venture }: { venture: Venture }) => {
  const { t, language } = useLanguage();
  const day = (on: string) => formatDate(startOfFarmDay(on), language, "date");
  const said = [
    `${t("ventures.units")}: ${t("ventures.unitsAt", {
      units: formatNumber(venture.units, language),
      price: formatNumber(venture.unitPriceBdt, language),
    })}`,
    `${t("ventures.budgets")}: ${t("ventures.budgetSplit", {
      cattle: formatNumber(venture.cattleBudgetBdt, language),
      running: formatNumber(venture.runningBudgetBdt, language),
    })}`,
    `${t("ventures.floor")}: ৳${formatNumber(venture.floorBdt, language)}`,
    `${t("ventures.decideBy")}: ${day(venture.decideBy)}`,
    `${t("ventures.window")}: ${day(venture.targetWindow.start)} – ${day(
      venture.targetWindow.end
    )}`,
  ];
  if (venture.windUpEndsOn) {
    said.push(`${t("ventures.windUpEnds")}: ${day(venture.windUpEndsOn)}`);
  }
  return (
    <p className="text-muted-foreground border-t pt-2 text-xs">
      {said.join(" · ")}
    </p>
  );
};

/** What is wrong, or worth knowing, about this run: the bank, a Running Budget nearly gone, and animals
 *  still standing with the Wind-up Period over. */
const CardBadges = ({
  venture,
  lastMonthOver,
}: {
  venture: Venture;
  lastMonthOver: string;
}) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-wrap gap-1">
      <BankStanding bank={venture.bank} lastMonthOver={lastMonthOver} />
      {venture.runningBudgetLow ? (
        <StatusBadge tone="warning">{t("ventures.runningLow")}</StatusBadge>
      ) : null}
      {pastWindUp(venture) ? (
        <StatusBadge tone="warning">
          {t("ventures.pastWindUp", {
            standing: formatNumber(venture.animalsStanding ?? 0, language),
          })}
        </StatusBadge>
      ) : null}
    </div>
  );
};

/**
 * The one or two acts a run is waiting for, by where it stands: the act that moves it along, and the one
 * beside it somebody reaches for in the same breath. Everything else a Venture can do is in the menu at
 * the head of the card, so a card is never four rows of buttons again.
 */
const PrimaryActs = ({
  venture,
  acts,
}: {
  venture: Venture;
  acts: VentureActs;
}) => {
  const { t } = useLanguage();
  const money = moneyOf(venture);
  if (venture.state === "open") {
    return (
      <>
        <Button
          onClick={() => acts.sign(venture)}
          type="button"
          variant="outline"
        >
          <PenLine aria-hidden data-icon="inline-start" />
          {t("ventures.sign")}
        </Button>
        <Button
          disabled={venture.capitalInBdt < venture.floorBdt}
          onClick={() => acts.startBuying(venture)}
          type="button"
        >
          <ShoppingCart aria-hidden data-icon="inline-start" />
          {t("ventures.startBuying")}
        </Button>
      </>
    );
  }
  if (venture.state === "buying") {
    return (
      <>
        <Button
          onClick={() => acts.drawFloat(venture)}
          type="button"
          variant="outline"
        >
          <Truck aria-hidden data-icon="inline-start" />
          {t("ventures.drawFloat")}
        </Button>
        <Button
          disabled={money.openFloatBdt !== 0}
          onClick={() => acts.startFattening(venture)}
          type="button"
        >
          <Wheat aria-hidden data-icon="inline-start" />
          {t("ventures.startFattening")}
        </Button>
      </>
    );
  }
  if (venture.state === "fattening" || venture.state === "selling") {
    return (
      <>
        <Button
          onClick={() => acts.reimburse(venture)}
          type="button"
          variant="outline"
        >
          <Receipt aria-hidden data-icon="inline-start" />
          {t("ventures.reimburse")}
        </Button>
        {pastWindUp(venture) ? (
          <Button onClick={() => acts.buyWhatIsLeft(venture)} type="button">
            <Gavel aria-hidden data-icon="inline-start" />
            {t("ventures.buyWhatIsLeft")}
          </Button>
        ) : null}
        {venture.state === "selling" ? (
          <Button onClick={() => acts.settle(venture)} type="button">
            <Scale aria-hidden data-icon="inline-start" />
            {t("ventures.settlement")}
          </Button>
        ) : null}
      </>
    );
  }
  if (venture.state === "settled") {
    return (
      <Button
        onClick={() => acts.settle(venture)}
        type="button"
        variant="outline"
      >
        <Scale aria-hidden data-icon="inline-start" />
        {t("ventures.settlement")}
      </Button>
    );
  }
  return null;
};

/**
 * Everything else the run can do, in the menu at the head of the card.
 *
 * Each act is asked for on its own terms — whether there is a Float out, whether anybody has signed —
 * rather than off the state alone, because starting from the state is how the Statements button and the
 * Settlement button each came to be drawn for the wrong runs.
 */
const actsInTheMenu = (
  venture: Venture,
  acts: VentureActs,
  t: (key: MessageKey, params?: MessageParams) => string
): RowAction[] => {
  const money = moneyOf(venture);
  const inTheMenu: RowAction[] = [
    {
      label: t("ventures.movements"),
      icon: ScrollText,
      handleSelect: () => acts.seeMovements(venture),
    },
  ];
  if (venture.state === "open") {
    inTheMenu.push({
      label: t("ventures.takeCapital"),
      icon: Banknote,
      disabled: money.signedFor.people === 0,
      handleSelect: () => acts.takeCapital(venture),
    });
  }
  if (venture.state === "buying" && money.openFloatBdt !== 0) {
    inTheMenu.push({
      label: t("ventures.countFloat"),
      icon: ScrollText,
      handleSelect: () => acts.countFloat(venture),
    });
  }
  if (stillRunning(venture)) {
    inTheMenu.push(
      {
        label: t("ventures.checkTheBank"),
        icon: Landmark,
        handleSelect: () => acts.checkTheBank(venture),
      },
      {
        label: t("ventures.advance"),
        icon: PiggyBank,
        handleSelect: () => acts.advance(venture),
      }
    );
  }
  if (venture.state === "buying") {
    inTheMenu.push({
      label: t("ventures.reimburse"),
      icon: Receipt,
      handleSelect: () => acts.reimburse(venture),
    });
  }
  if (hasPapersToGive(venture)) {
    inTheMenu.push(
      {
        label: t("ventures.economics"),
        icon: TrendingUp,
        handleSelect: () => acts.economics(venture),
      },
      {
        label: t("statements.title"),
        icon: FileText,
        handleSelect: () => acts.statements(venture),
      }
    );
    if (termsCanStillMove(venture)) {
      inTheMenu.push({
        label: t("ventures.amend"),
        icon: PenLine,
        handleSelect: () => acts.amend(venture),
      });
    }
  }
  if (venture.state === "open") {
    inTheMenu.push({
      label: t("ventures.callOff"),
      icon: XCircle,
      destructive: true,
      handleSelect: () => acts.callOff(venture),
    });
  }
  return inTheMenu;
};

/**
 * One Venture: what it is called and where it stands, the few figures it is judged by, what is wrong with
 * it, and the act it is waiting for. Everything else it can do is in the menu beside its name.
 */
export const VentureCard = ({
  venture,
  acts,
  lastMonthOver,
}: {
  venture: Venture;
  acts: VentureActs;
  /** The last month that is over, so "straight with the bank" is claimed only up to it. */
  lastMonthOver: string;
}) => {
  const { t } = useLanguage();
  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4 text-sm md:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">
          {venture.name}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <StateBadge state={venture.state} />
          <RowMenu
            actions={actsInTheMenu(venture, acts, t)}
            label={t("ventures.moreFor", { venture: venture.name })}
          />
        </div>
      </div>
      <MoneyLines
        onSeeMovements={() => acts.seeMovements(venture)}
        venture={venture}
      />
      <CardBadges lastMonthOver={lastMonthOver} venture={venture} />
      {venture.cancelledReason ? (
        <p className="text-muted-foreground text-xs">
          {venture.cancelledReason}
        </p>
      ) : null}
      <Terms venture={venture} />
      <WhatStopsHer venture={venture} />
      <div className="flex flex-wrap justify-end gap-2">
        <PrimaryActs acts={acts} venture={venture} />
      </div>
    </div>
  );
};
