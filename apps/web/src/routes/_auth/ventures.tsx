import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Handshake } from "lucide-react";
import { useState } from "react";

import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { OpenVentureSheet } from "@/components/ventures/open-venture-sheet";
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

/** One Venture: what it is after, what it holds, and when it means to sell. */
const VentureCard = ({ venture }: { venture: Venture }) => {
  const { t, language } = useLanguage();
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
        <Line label={t("ventures.floor")}>{taka(venture.floorBdt)}</Line>
        <Line label={t("ventures.decideBy")}>{day(venture.decideBy)}</Line>
        <Line label={t("ventures.units")}>
          {t("ventures.unitsAt", {
            units: formatNumber(venture.units, language),
            price: formatNumber(venture.unitPriceBdt, language),
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
  const ventures = useQuery(orpc.ventures.list.queryOptions());
  return (
    <Page>
      <PageHeader
        actions={
          <Button onClick={() => setOpening(true)} type="button">
            <Handshake aria-hidden data-icon="inline-start" />
            {t("ventures.open")}
          </Button>
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
                <VentureCard key={one.id} venture={one} />
              ))}
            </div>
          </Section>
        )}
      </Loaded>
      <OpenVentureSheet onOpenChange={setOpening} open={opening} />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/ventures")({
  /** The Owner's alone: nobody else is shown a screen that would only refuse them. */
  beforeLoad: onlyFor("owner"),
  component: VenturesPage,
});
