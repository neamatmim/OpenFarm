import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  Banknote,
  Handshake,
  PenLine,
  PiggyBank,
  Receipt,
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
import { CallOffSheet } from "@/components/ventures/call-off-sheet";
import { CountFloatSheet } from "@/components/ventures/count-float-sheet";
import { DrawFloatSheet } from "@/components/ventures/draw-float-sheet";
import { InternalSaleSheet } from "@/components/ventures/internal-sale-sheet";
import { OpenVentureSheet } from "@/components/ventures/open-venture-sheet";
import { ReimburseSheet } from "@/components/ventures/reimburse-sheet";
import { SignAgreementSheet } from "@/components/ventures/sign-agreement-sheet";
import { TakeCapitalSheet } from "@/components/ventures/take-capital-sheet";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
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

const VentureCard = ({
  venture,
  onSign,
  onTakeCapital,
  onCallOff,
  onDrawFloat,
  onCountFloat,
  onReimburse,
  onAdvance,
}: {
  venture: Venture;
  onSign: (venture: Venture) => void;
  onTakeCapital: (venture: Venture) => void;
  onCallOff: (venture: Venture) => void;
  onDrawFloat: (venture: Venture) => void;
  onCountFloat: (venture: Venture) => void;
  onReimburse: (venture: Venture) => void;
  onAdvance: (venture: Venture) => void;
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
        <Line label={t("ventures.held")}>{taka(venture.capitalInBdt)}</Line>
        <Line label={t("ventures.balance")}>{taka(money.balanceBdt)}</Line>
        {money.advancedBdt === 0 ? null : (
          <Line label={t("ventures.owedToYou")}>{taka(money.advancedBdt)}</Line>
        )}
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
        <Line label={t("ventures.budgetsHeld")}>
          {t("ventures.budgetSplit", {
            cattle: formatNumber(money.cattleBudgetHeldBdt, language),
            running: formatNumber(money.runningBudgetHeldBdt, language),
          })}
        </Line>
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
      </div>
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
            onClick={() => onAdvance(venture)}
            type="button"
            variant={venture.runningBudgetLow ? "default" : "ghost"}
          >
            <PiggyBank aria-hidden data-icon="inline-start" />
            {t("ventures.advance")}
          </Button>
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
  const [advancing, setAdvancing] = useState<Venture | null>(null);
  const ventures = useQuery(orpc.ventures.list.queryOptions());
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
});
