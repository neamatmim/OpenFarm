import { formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { HerCull } from "@/components/culling/cull-list";
import { HerPrice } from "@/components/fattening/animal-prices";
import { categoryName, useReadsMoney } from "@/components/money";
import { Notice, SUBHEADING } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { usePerHeadPerDay, useMoney, useMoneyRate } from "@/lib/money";
import { orpc } from "@/utils/orpc";

const Line = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="border-border/60 flex justify-between gap-2 border-b py-2 last:border-b-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium tabular-nums">{children}</span>
  </div>
);

/** What the figures leave out, said only when there is something left out. */
const Note = ({
  amount,
  word,
}: {
  amount: number;
  word:
    | "costs.unpricedNote"
    | "costs.uncostedNote"
    | "costs.unallocatedNote"
    | "costs.strayTripNote"
    | "costs.strayHerdNote";
}) => {
  const { t, language } = useLanguage();
  return amount > 0 ? (
    <p className="text-muted-foreground text-xs">
      {t(word, { amount: formatNumber(amount, language) })}
    </p>
  ) : null;
};

/**
 * Feed, doses, the Vet, the Market toll, the Trips and the Herd Costs — however much of each there was, and what
 * the figures leave out.
 */
const WhatWasSpent = ({
  costs,
}: {
  costs: {
    feedMoney: number;
    unpricedKg: number;
    medicineMoney: number;
    uncostedDoses: number;
    vetMoney: number;
    // An answer kept on the phone from before these existed carries none of them: default them, or a
    // fortnight of cached answers draws ৳NaN.
    marketTollMoney?: number;
    tripMoney?: number;
    herdMoney?: number;
  };
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  return (
    <>
      <Line label={t("costs.feed")}>{asMoney(costs.feedMoney)}</Line>
      <Line label={t("costs.medicine")}>{asMoney(costs.medicineMoney)}</Line>
      <Line label={t("costs.vet")}>{asMoney(costs.vetMoney)}</Line>
      <Line label={t("costs.market_toll")}>
        {asMoney(costs.marketTollMoney ?? 0)}
      </Line>
      <Line label={t("costs.trips")}>{asMoney(costs.tripMoney ?? 0)}</Line>
      <Line label={t("costs.herd")}>{asMoney(costs.herdMoney ?? 0)}</Line>
      <Note amount={costs.unpricedKg} word="costs.unpricedNote" />
      <Note amount={costs.uncostedDoses} word="costs.uncostedNote" />
    </>
  );
};

/**
 * What one animal has cost and earned: her share of the Pens' feed, her doses and the Vet's visits over
 * her time on the farm, and — for a fattening animal — what she was bought and sold for, her Margin and
 * what each kilogram she put on cost; for a cow in milk, what this Lactation has cost a liter. Every figure
 * worked out from the records, none typed. The Owner's and the Manager's alone.
 */
export const WhatSheCost = ({ tagNumber }: { tagNumber: string }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const rate = useMoneyRate();
  const readsMoney = useReadsMoney();
  const costs = useQuery({
    ...orpc.costs.forAnimal.queryOptions({ input: { tagNumber } }),
    enabled: readsMoney,
  });
  if (!costs.data) {
    return null;
  }
  const her = costs.data;
  const orDash = (amount: number | null) =>
    amount === null ? "—" : asMoney(amount);
  // A cost of gain and a cost per liter are rates, not sums: rounded to the taka, two different ones
  // print the same.
  const rateOrDash = (amount: number | null) =>
    amount === null ? "—" : rate(amount);
  return (
    <section className="surface flex flex-col p-4 text-sm md:p-5">
      <h2 className="mb-2 text-base font-semibold">{t("costs.title")}</h2>
      <WhatWasSpent costs={her} />
      {her.side === "fattening" ? (
        <>
          <Line label={t("costs.bought")}>{orDash(her.purchaseMoney)}</Line>
          <Line label={t("costs.sold")}>{orDash(her.saleMoney)}</Line>
          <Line label={t("costs.margin")}>
            {her.marginMoney === null
              ? t("costs.notSold")
              : asMoney(her.marginMoney)}
          </Line>
          <Line label={t("costs.costOfGain")}>
            {rateOrDash(her.costOfGainMoney)}
          </Line>
          {/* What she might fetch now, against all that — the Owner's alone, and only while she is unsold. */}
          {her.saleMoney === null ? <HerPrice tagNumber={tagNumber} /> : null}
        </>
      ) : null}
      {her.lactation ? (
        <>
          <h3 className={cn(SUBHEADING, "pt-4 pb-1")}>
            {t("costs.thisLactation")}
          </h3>
          <WhatWasSpent costs={her.lactation} />
          <Line label={t("costs.liters")}>
            {formatNumber(her.lactation.litersToBulk, language)}
          </Line>
          <Line label={t("costs.perLiter")}>
            {rateOrDash(her.lactation.costPerLiterMoney)}
          </Line>
        </>
      ) : null}
      {/* Whether she gives the farm a reason to let her go — the Owner's alone. */}
      {her.side === "dairy" ? <HerCull tagNumber={tagNumber} /> : null}
    </section>
  );
};

/** One part of the period's costs, on its own card with its name. */
const CostCard = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="surface flex flex-col p-4 text-sm md:p-5">
    <h3 className="mb-1 text-base font-semibold">{title}</h3>
    {children}
  </section>
);

type Overheads = Awaited<
  ReturnType<typeof orpc.costs.bySide.call>
>["overheads"];

/**
 * What running the place cost in the period — wages, rent, electricity — by Category, and what that comes to a head a
 * day over every day an animal stood here (CONTEXT.md: **Overhead**). On its own card, under the Sides, because no
 * Side carries it: said so on the card, so nobody adds it to a Side's figure or reads it into a Margin.
 */
const OverheadsCard = ({ overheads }: { overheads: Overheads }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const perHead = usePerHeadPerDay();
  return (
    <CostCard title={t("costs.overheads")}>
      <p className="text-muted-foreground pb-1 text-xs">
        {t("costs.overheadsHint")}
      </p>
      {overheads.lines.map((line) => (
        <Line key={line.categoryId} label={categoryName(line, language)}>
          {asMoney(line.amount)}
        </Line>
      ))}
      <Line label={t("costs.overheadsTotal")}>
        <span className="font-semibold">{asMoney(overheads.totalMoney)}</span>
      </Line>
      <Line label={t("costs.perHeadPerDay")}>
        {perHead(overheads.perHeadPerDayMoney)}
      </Line>
      <p className="text-muted-foreground pt-2 text-xs">
        {t("costs.headDays", {
          days: formatNumber(overheads.headDays, language),
        })}
      </p>
    </CostCard>
  );
};

type StoreShortfall = Awaited<
  ReturnType<typeof orpc.costs.bySide.call>
>["storeShortfall"];

/**
 * What the period's Stock Counts found missing, and found over, at the store's price when counted. Its own card beside
 * the Overheads, because it is in neither: feed bought and never eaten is in no Side's costs, and it was not the place
 * or the people.
 */
const StoreShortfallCard = ({ shortfall }: { shortfall: StoreShortfall }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  return (
    <CostCard title={t("costs.storeShortfall")}>
      <p className="text-muted-foreground pb-1 text-xs">
        {t("costs.storeShortfallHint")}
      </p>
      <Line label={t("costs.storeShort")}>
        <span
          className={
            shortfall.shortMoney > 0 ? "text-danger font-semibold" : undefined
          }
        >
          {asMoney(shortfall.shortMoney)}
        </span>
      </Line>
      <Line label={t("costs.storeOver")}>{asMoney(shortfall.overMoney)}</Line>
      <p className="text-muted-foreground pt-2 text-xs">
        {t("costs.storeCounts", { count: shortfall.counts })}
      </p>
    </CostCard>
  );
};

/**
 * A period by Side: what each Side's animals were fed, dosed and visited for in it, what a liter of the
 * Dairy side's milk cost — and, apart, the fattening animals sold in it with each one's whole-life Margin.
 */
export const CostsBySide = ({ from, to }: { from: string; to: string }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const rate = useMoneyRate();
  const report = useQuery(
    orpc.costs.bySide.queryOptions({ input: { from, to } })
  );
  // A period the farm refuses — backwards, or longer than any year — says why, as the register does, rather than
  // loading for ever.
  if (report.isError) {
    return (
      <Notice
        title={wordedRefusal(report.error, t) ?? t("common.error")}
        tone="danger"
      />
    );
  }
  if (!report.data) {
    return <Skeleton className="h-64 rounded-xl" />;
  }
  const { dairy, fattening, soldFattening, unallocated } = report.data;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t("costs.bySideHint")}</p>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <CostCard title={t("animals.side.dairy")}>
          <WhatWasSpent costs={dairy} />
          <Line label={t("costs.liters")}>
            {formatNumber(dairy.litersToBulk, language)}
          </Line>
          <Line label={t("costs.perLiter")}>
            {dairy.costPerLiterMoney === null
              ? "—"
              : rate(dairy.costPerLiterMoney)}
          </Line>
        </CostCard>
        <CostCard title={t("animals.side.fattening")}>
          <WhatWasSpent costs={fattening} />
        </CostCard>
        <CostCard title={t("costs.soldInPeriod")}>
          {soldFattening.animals.map((one) => (
            <Line key={one.tagNumber} label={one.tagNumber}>
              {one.marginMoney === null ? "—" : asMoney(one.marginMoney)}
            </Line>
          ))}
          <Line label={t("costs.margin")}>
            <span className="font-semibold">
              {asMoney(soldFattening.marginMoney)}
            </span>
          </Line>
        </CostCard>
      </div>
      {/* Missing from an answer a phone kept from before there were Overheads. */}
      {report.data.overheads ? (
        // In the Sides' grid, so its lines read at a card's width and not across the whole page.
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <OverheadsCard overheads={report.data.overheads} />
          {/* Missing from an answer a phone kept from before the counts were priced. */}
          {report.data.storeShortfall ? (
            <StoreShortfallCard shortfall={report.data.storeShortfall} />
          ) : null}
        </div>
      ) : null}
      <Note amount={unallocated.feedMoney} word="costs.unallocatedNote" />
      <Note amount={unallocated.tripMoney ?? 0} word="costs.strayTripNote" />
      <Note amount={unallocated.herdMoney ?? 0} word="costs.strayHerdNote" />
    </div>
  );
};
