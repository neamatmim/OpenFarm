import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  Banknote,
  FileText,
  Handshake,
  PenLine,
  Landmark,
  Gavel,
  PiggyBank,
  Receipt,
  Scale,
  ScrollText,
  Truck,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { AdvanceSheet } from "@/components/ventures/advance-sheet";
import { BankCheckSheet } from "@/components/ventures/bank-check-sheet";
import { BuyWhatIsLeftSheet } from "@/components/ventures/buy-what-is-left-sheet";
import { CallOffSheet } from "@/components/ventures/call-off-sheet";
import { CountFloatSheet } from "@/components/ventures/count-float-sheet";
import { DrawFloatSheet } from "@/components/ventures/draw-float-sheet";
import { InternalSaleSheet } from "@/components/ventures/internal-sale-sheet";
import { MovementsSheet } from "@/components/ventures/movements-sheet";
import { OpenVentureSheet } from "@/components/ventures/open-venture-sheet";
import { ReimburseSheet } from "@/components/ventures/reimburse-sheet";
import { SettlementSheet } from "@/components/ventures/settlement-sheet";
import { SignAgreementSheet } from "@/components/ventures/sign-agreement-sheet";
import { StatementsSheet } from "@/components/ventures/statements-sheet";
import { TakeCapitalSheet } from "@/components/ventures/take-capital-sheet";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { lastMonth } from "@/lib/months";
import { orpc } from "@/utils/orpc";

type Venture = Awaited<ReturnType<typeof orpc.ventures.list.call>>[number];

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
}: {
  bank:
    | {
        lastCheckedMonth: string | null;
        monthsOut: string[];
        monthsStale?: string[];
      }
    | undefined;
}) => {
  const { t } = useLanguage();
  // A fortnight-old cache was written before a month could go stale, and says nothing about one.
  const stale = bank?.monthsStale ?? [];
  const disagreed = (bank?.monthsOut ?? []).filter(
    (month) => !stale.includes(month)
  );
  if (stale.length > 0 || disagreed.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {stale.length > 0 ? (
          <StatusBadge tone="warning">
            {t("ventures.bankStale", { month: stale.join(", ") })}
          </StatusBadge>
        ) : null}
        {disagreed.length > 0 ? (
          <StatusBadge tone="warning">
            {t("ventures.bankDisagrees", { month: disagreed.join(", ") })}
          </StatusBadge>
        ) : null}
      </div>
    );
  }
  if (!bank?.lastCheckedMonth) {
    return (
      <StatusBadge tone="neutral">{t("ventures.bankNeverChecked")}</StatusBadge>
    );
  }
  // Named, and this way round, because the guard against untranslated JSX text takes a closing angle
  // bracket in an expression for the end of a tag.
  const readToTheLastMonthOver = lastMonth() <= bank.lastCheckedMonth;
  return readToTheLastMonthOver ? (
    <StatusBadge tone="success">
      {t("ventures.bankStraight", { month: bank.lastCheckedMonth })}
    </StatusBadge>
  ) : (
    <StatusBadge tone="neutral">
      {t("ventures.bankUnreadSince", { month: bank.lastCheckedMonth })}
    </StatusBadge>
  );
};

/**
 * Whether the Wind-up Period has run out with Animals still hers.
 *
 * The one condition, so the warning and the act it calls for cannot disagree — being told the run is
 * over while the button that ends it is not there would be worse than not being told. Written without a
 * closing angle bracket because the guard against untranslated JSX text reads one as the end of a tag.
 *
 * A fortnight-old cached answer was written before either figure existed and says nothing about either.
 */
const pastWindUp = (venture: Venture) =>
  venture.state === "selling" &&
  (venture.animalsStanding ?? 0) !== 0 &&
  (venture.windUpEndsOn ?? "9999-12-31") < farmDayOf(new Date());

/**
 * Said once the Wind-up Period has run out with animals still standing: the Farm is about to have to buy
 * whatever is left so the Venture can settle on time, and the Owner is owed that news while there are
 * still days to sell in rather than at the moment everybody's money is late.
 */
const PastWindUp = ({ venture }: { venture: Venture }) => {
  const { t, language } = useLanguage();
  return pastWindUp(venture) ? (
    <StatusBadge tone="warning">
      {t("ventures.pastWindUp", {
        standing: formatNumber(venture.animalsStanding ?? 0, language),
      })}
    </StatusBadge>
  ) : null;
};

/** One Venture: what it is after, what it holds, who has signed for it, and when it means to sell. */
/** What a Venture's card needs of the figures, whatever shape the answer it was drawn from had. A phone
 *  can be holding a fortnight-old cache written before any of this existed. */
const moneyOf = (venture: Venture) => ({
  balanceBdt: venture.balanceBdt ?? 0,
  cattleBudgetHeldBdt: venture.cattleBudgetHeldBdt ?? 0,
  runningBudgetHeldBdt: venture.runningBudgetHeldBdt ?? 0,
  spentBdt: venture.spentBdt ?? 0,
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

const VentureCard = ({
  venture,
  onSign,
  onTakeCapital,
  onCallOff,
  onDrawFloat,
  onCountFloat,
  onReimburse,
  onBuyWhatIsLeft,
  onSettle,
  onAdvance,
  onCheckTheBank,
  onSeeMovements,
  onStatements,
}: {
  venture: Venture;
  onSign: (venture: Venture) => void;
  onTakeCapital: (venture: Venture) => void;
  onCallOff: (venture: Venture) => void;
  onDrawFloat: (venture: Venture) => void;
  onCountFloat: (venture: Venture) => void;
  onReimburse: (venture: Venture) => void;
  onBuyWhatIsLeft: (venture: Venture) => void;
  onSettle: (venture: Venture) => void;
  onAdvance: (venture: Venture) => void;
  onCheckTheBank: (venture: Venture) => void;
  onSeeMovements: (venture: Venture) => void;
  onStatements: (venture: Venture) => void;
}) => {
  const { t, language } = useLanguage();
  const money = moneyOf(venture);
  const taka = (amount: number) => `৳${formatNumber(amount, language)}`;
  const day = (on: string) => formatDate(startOfFarmDay(on), language, "date");
  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl border p-4 text-sm md:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">
          {venture.name}
        </h3>
        <StateBadge state={venture.state} />
      </div>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <Line label={t("ventures.target")}>
          {taka(venture.targetCapitalBdt)}
        </Line>
        <Line label={t("ventures.held")}>
          <button
            aria-label={t("ventures.movements")}
            className="rounded-md outline-none hover:underline focus-visible:ring-2"
            onClick={() => onSeeMovements(venture)}
            type="button"
          >
            {taka(venture.capitalInBdt)}
          </button>
        </Line>
        <Line label={t("ventures.balance")}>{taka(money.balanceBdt)}</Line>
        {money.advancedBdt === 0 ? null : (
          <Line label={t("ventures.owedToYou")}>{taka(money.advancedBdt)}</Line>
        )}
        <span className="col-span-full">
          <BankStanding bank={venture.bank} />
        </span>
        <Line label={t("ventures.outOfTheAccount")}>
          {`${taka(money.spentBdt)} · ${taka(money.paidOutBdt)}`}
        </Line>
        {money.openFloatBdt === 0 ? null : (
          <Line label={t("ventures.openFloat")}>
            {taka(money.openFloatBdt)}
          </Line>
        )}
        {venture.runningBudgetLow ? (
          <span className="col-span-full">
            <StatusBadge tone="warning">{t("ventures.runningLow")}</StatusBadge>
          </span>
        ) : null}
        {stillRunning(venture) ? (
          <Line label={t("ventures.budgetsHeld")}>
            {t("ventures.budgetSplit", {
              cattle: formatNumber(money.cattleBudgetHeldBdt, language),
              running: formatNumber(money.runningBudgetHeldBdt, language),
            })}
          </Line>
        ) : null}
        <Line label={t("ventures.floor")}>{taka(venture.floorBdt)}</Line>
        <Line label={t("ventures.decideBy")}>{day(venture.decideBy)}</Line>
        <Line label={t("ventures.units")}>
          {t("ventures.unitsAt", {
            units: formatNumber(venture.units, language),
            price: formatNumber(venture.unitPriceBdt, language),
          })}
        </Line>
        <Line label={t("ventures.signedFor")}>
          {t("ventures.unitsOfUnits", {
            taken: formatNumber(money.signedFor.units, language),
            units: formatNumber(venture.units, language),
            people: formatNumber(money.signedFor.people, language),
          })}
        </Line>
        <Line label={t("ventures.budgets")}>
          {t("ventures.budgetSplit", {
            cattle: formatNumber(venture.cattleBudgetBdt, language),
            running: formatNumber(venture.runningBudgetBdt, language),
          })}
        </Line>
        <Line label={t("ventures.window")}>
          {`${day(venture.targetWindow.start)} – ${day(venture.targetWindow.end)}`}
        </Line>
        {venture.windUpEndsOn ? (
          <Line label={t("ventures.windUpEnds")}>
            {day(venture.windUpEndsOn)}
          </Line>
        ) : null}
      </div>
      <PastWindUp venture={venture} />
      {venture.cancelledReason ? (
        <p className="text-muted-foreground text-xs">
          {venture.cancelledReason}
        </p>
      ) : null}
      {venture.state === "open" ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={() => onCallOff(venture)}
            type="button"
            variant="ghost"
          >
            <XCircle aria-hidden data-icon="inline-start" />
            {t("ventures.callOff")}
          </Button>
          <Button
            onClick={() => onSign(venture)}
            type="button"
            variant="outline"
          >
            <PenLine aria-hidden data-icon="inline-start" />
            {t("ventures.sign")}
          </Button>
          <Button
            disabled={money.signedFor.people === 0}
            onClick={() => onTakeCapital(venture)}
            type="button"
            variant="outline"
          >
            <Banknote aria-hidden data-icon="inline-start" />
            {t("ventures.takeCapital")}
          </Button>
        </div>
      ) : null}
      {venture.state === "buying" ||
      venture.state === "fattening" ||
      venture.state === "selling" ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={() => onReimburse(venture)}
            type="button"
            variant="ghost"
          >
            <Receipt aria-hidden data-icon="inline-start" />
            {t("ventures.reimburse")}
          </Button>
          <Button
            onClick={() => onCheckTheBank(venture)}
            type="button"
            variant="ghost"
          >
            <Landmark aria-hidden data-icon="inline-start" />
            {t("ventures.checkTheBank")}
          </Button>
          <Button
            onClick={() => onAdvance(venture)}
            type="button"
            variant={venture.runningBudgetLow ? "default" : "ghost"}
          >
            <PiggyBank aria-hidden data-icon="inline-start" />
            {t("ventures.advance")}
          </Button>
          {pastWindUp(venture) ? (
            <Button
              onClick={() => onBuyWhatIsLeft(venture)}
              type="button"
              variant="default"
            >
              <Gavel aria-hidden data-icon="inline-start" />
              {t("ventures.buyWhatIsLeft")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {venture.state === "buying" ? (
        <div className="flex flex-wrap justify-end gap-2">
          {money.openFloatBdt === 0 ? null : (
            <Button
              onClick={() => onCountFloat(venture)}
              type="button"
              variant="ghost"
            >
              <ScrollText aria-hidden data-icon="inline-start" />
              {t("ventures.countFloat")}
            </Button>
          )}
          <Button
            onClick={() => onDrawFloat(venture)}
            type="button"
            variant="outline"
          >
            <Truck aria-hidden data-icon="inline-start" />
            {t("ventures.drawFloat")}
          </Button>
        </div>
      ) : null}
      {hasPapersToGive(venture) ? (
        <div className="flex flex-wrap justify-end gap-2">
          {/* Kept after the books are shut, not only while they are being shut: what a Venture was
              settled at, who has been paid and who has said so are the questions asked *afterwards*,
              and until now a settled run had no way back to any of them. */}
          {venture.state === "selling" || venture.state === "settled" ? (
            <Button
              onClick={() => onSettle(venture)}
              type="button"
              variant="ghost"
            >
              <Scale aria-hidden data-icon="inline-start" />
              {t("ventures.settlement")}
            </Button>
          ) : null}
          <Button
            onClick={() => onStatements(venture)}
            type="button"
            variant="ghost"
          >
            <FileText aria-hidden data-icon="inline-start" />
            {t("statements.title")}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

const Line = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex justify-between gap-2 py-0.5">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium tabular-nums">{children}</span>
  </div>
);

/**
 * The Ventures the farm is running: what each is after, what it holds, and when it means to sell. The
 * Owner's alone — a Venture is money between her and the people who trusted her with it.
 */
const VenturesPage = () => {
  const { t } = useLanguage();
  const [opening, setOpening] = useState(false);
  const [sellingInternally, setSellingInternally] = useState(false);
  const [signing, setSigning] = useState<Venture | null>(null);
  const [taking, setTaking] = useState<Venture | null>(null);
  const [callingOff, setCallingOff] = useState<Venture | null>(null);
  const [drawing, setDrawing] = useState<Venture | null>(null);
  const [counting, setCounting] = useState<Venture | null>(null);
  const [reimbursing, setReimbursing] = useState<Venture | null>(null);
  const [windingUp, setWindingUp] = useState<Venture | null>(null);
  const [settling, setSettling] = useState<Venture | null>(null);
  const [advancing, setAdvancing] = useState<Venture | null>(null);
  const [checking, setChecking] = useState<Venture | null>(null);
  const [seeing, setSeeing] = useState<Venture | null>(null);
  const [papering, setPapering] = useState<Venture | null>(null);
  const ventures = useQuery(orpc.ventures.list.queryOptions());
  const { statements } = Route.useSearch();
  const navigate = useNavigate();
  // The notice that her Investors are due a paper names the Venture and sends her here with it in the
  // address, so she lands on the buttons rather than going looking. Read off the list rather than kept
  // in state: the list is what arrives, and a Venture whose id the address names but the list does not
  // hold — a stale link, another farm's — opens nothing.
  const asked = statements
    ? (ventures.data?.find((one) => one.id === statements) ?? null)
    : null;
  return (
    <Page>
      <PageHeader
        actions={
          <>
            <Button
              onClick={() => setSellingInternally(true)}
              type="button"
              variant="outline"
            >
              <ArrowRightLeft aria-hidden data-icon="inline-start" />
              {t("ventures.sellInternally")}
            </Button>
            <Button onClick={() => setOpening(true)} type="button">
              <Handshake aria-hidden data-icon="inline-start" />
              {t("ventures.open")}
            </Button>
          </>
        }
        description={t("ventures.subtitle")}
        title={t("ventures.title")}
      />
      <Loaded
        query={ventures}
        skeleton={<Skeleton className="h-40 rounded-xl" />}
      >
        {(ventures.data ?? []).length === 0 ? (
          <EmptyState icon={Handshake} title={t("ventures.none")} />
        ) : (
          <Section id="ventures-list" title={t("ventures.running")}>
            <div className="grid gap-4 lg:grid-cols-2">
              {(ventures.data ?? []).map((one) => (
                <VentureCard
                  key={one.id}
                  onCallOff={setCallingOff}
                  onCountFloat={setCounting}
                  onAdvance={setAdvancing}
                  onCheckTheBank={setChecking}
                  onSeeMovements={setSeeing}
                  onStatements={setPapering}
                  onBuyWhatIsLeft={setWindingUp}
                  onSettle={setSettling}
                  onReimburse={setReimbursing}
                  onDrawFloat={setDrawing}
                  onSign={setSigning}
                  onTakeCapital={setTaking}
                  venture={one}
                />
              ))}
            </div>
          </Section>
        )}
      </Loaded>
      <OpenVentureSheet onOpenChange={setOpening} open={opening} />
      <InternalSaleSheet
        onOpenChange={setSellingInternally}
        open={sellingInternally}
      />
      <TakeCapitalSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setTaking(null);
          }
        }}
        open={taking !== null}
        venture={taking}
      />
      <MovementsSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setSeeing(null);
          }
        }}
        open={seeing !== null}
        venture={seeing}
      />
      <BankCheckSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setChecking(null);
          }
        }}
        open={checking !== null}
        venture={checking}
      />
      <AdvanceSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setAdvancing(null);
          }
        }}
        open={advancing !== null}
        venture={advancing}
      />
      <ReimburseSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setReimbursing(null);
          }
        }}
        open={reimbursing !== null}
        venture={reimbursing}
      />
      <SettlementSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setSettling(null);
          }
        }}
        open={settling !== null}
        venture={settling}
      />
      <BuyWhatIsLeftSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setWindingUp(null);
          }
        }}
        open={windingUp !== null}
        venture={windingUp}
      />
      <CountFloatSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setCounting(null);
          }
        }}
        open={counting !== null}
        venture={counting}
      />
      <DrawFloatSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setDrawing(null);
          }
        }}
        open={drawing !== null}
        venture={drawing}
      />
      <CallOffSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setCallingOff(null);
          }
        }}
        open={callingOff !== null}
        venture={callingOff}
      />
      <StatementsSheet
        onOpenChange={(next) => {
          if (next) {
            return;
          }
          setPapering(null);
          // The address said whose papers she came for; once the sheet is closed it has been answered.
          if (statements !== undefined) {
            navigate({ replace: true, search: {}, to: "/ventures" });
          }
        }}
        open={papering !== null || asked !== null}
        venture={papering ?? asked}
      />
      <SignAgreementSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setSigning(null);
          }
        }}
        open={signing !== null}
        venture={signing}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/ventures")({
  /** The Owner's alone: nobody else is shown a screen that would only refuse them. */
  beforeLoad: onlyFor("owner"),
  component: VenturesPage,
  /** Which Venture's papers she came for, when the notice that they are due sent her here. */
  validateSearch: (search: Record<string, unknown>): { statements?: string } =>
    typeof search.statements === "string" && search.statements !== ""
      ? { statements: search.statements }
      : {},
});
