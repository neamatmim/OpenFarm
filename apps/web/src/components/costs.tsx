import { formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { HerCull } from "@/components/culling/cull-list";
import { HerPrice } from "@/components/fattening/animal-prices";
import { useReadsMoney } from "@/components/money";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka, useTakaToThePaisa } from "@/lib/taka";
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
 * Feed, doses, the Vet, the Hasil, the Trips and the Herd Costs — however much of each there was, and what
 * the figures leave out.
 */
const WhatWasSpent = ({
  costs,
}: {
  costs: {
    feedBdt: number;
    unpricedKg: number;
    medicineBdt: number;
    uncostedDoses: number;
    vetBdt: number;
    // An answer kept on the phone from before these existed carries none of them: default them, or a
    // fortnight of cached answers draws ৳NaN.
    hasilBdt?: number;
    tripBdt?: number;
    herdBdt?: number;
  };
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <>
      <Line label={t("costs.feed")}>{taka(costs.feedBdt)}</Line>
      <Line label={t("costs.medicine")}>{taka(costs.medicineBdt)}</Line>
      <Line label={t("costs.vet")}>{taka(costs.vetBdt)}</Line>
      <Line label={t("costs.hasil")}>{taka(costs.hasilBdt ?? 0)}</Line>
      <Line label={t("costs.trips")}>{taka(costs.tripBdt ?? 0)}</Line>
      <Line label={t("costs.herd")}>{taka(costs.herdBdt ?? 0)}</Line>
      <Note amount={costs.unpricedKg} word="costs.unpricedNote" />
      <Note amount={costs.uncostedDoses} word="costs.uncostedNote" />
    </>
  );
};

/**
 * What one animal has cost and earned: her share of the Pens' feed, her doses and the Vet's visits over
 * her time on the farm, and — for a fattening animal — what she was bought and sold for, her Margin and
 * what each kilogram she put on cost; for a cow in milk, what this Lactation has cost a litre. Every figure
 * worked out from the records, none typed. The Owner's and the Manager's alone.
 */
export const WhatSheCost = ({ tagNumber }: { tagNumber: string }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const rate = useTakaToThePaisa();
  const readsMoney = useReadsMoney();
  const costs = useQuery({
    ...orpc.costs.ofAnimal.queryOptions({ input: { tagNumber } }),
    enabled: readsMoney,
  });
  if (!costs.data) {
    return null;
  }
  const her = costs.data;
  const orDash = (amount: number | null) =>
    amount === null ? "—" : taka(amount);
  // A cost of gain and a cost per litre are rates, not sums: rounded to the taka, two different ones
  // print the same.
  const rateOrDash = (amount: number | null) =>
    amount === null ? "—" : rate(amount);
  return (
    <section className="surface flex flex-col p-4 text-sm md:p-5">
      <h2 className="mb-2 text-base font-semibold tracking-tight">
        {t("costs.title")}
      </h2>
      <WhatWasSpent costs={her} />
      {her.side === "fattening" ? (
        <>
          <Line label={t("costs.bought")}>{orDash(her.purchaseBdt)}</Line>
          <Line label={t("costs.sold")}>{orDash(her.saleBdt)}</Line>
          <Line label={t("costs.margin")}>
            {her.marginBdt === null ? t("costs.notSold") : taka(her.marginBdt)}
          </Line>
          <Line label={t("costs.costOfGain")}>
            {rateOrDash(her.costOfGainBdt)}
          </Line>
          {/* What she might fetch now, against all that — the Owner's alone, and only while she is unsold. */}
          {her.saleBdt === null ? <HerPrice tagNumber={tagNumber} /> : null}
        </>
      ) : null}
      {her.lactation ? (
        <>
          <h3 className="pt-4 pb-1 font-semibold">
            {t("costs.thisLactation")}
          </h3>
          <WhatWasSpent costs={her.lactation} />
          <Line label={t("costs.litres")}>
            {formatNumber(her.lactation.litresToBulk, language)}
          </Line>
          <Line label={t("costs.perLitre")}>
            {rateOrDash(her.lactation.costPerLitreBdt)}
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
    <h3 className="mb-1 text-base font-semibold tracking-tight">{title}</h3>
    {children}
  </section>
);

/**
 * A period by Side: what each Side's animals were fed, dosed and visited for in it, what a litre of the
 * Dairy side's milk cost — and, apart, the fattening animals sold in it with each one's whole-life Margin.
 */
export const CostsBySide = ({ from, to }: { from: string; to: string }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const rate = useTakaToThePaisa();
  const report = useQuery(
    orpc.costs.bySide.queryOptions({ input: { from, to } })
  );
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
          <Line label={t("costs.litres")}>
            {formatNumber(dairy.litresToBulk, language)}
          </Line>
          <Line label={t("costs.perLitre")}>
            {dairy.costPerLitreBdt === null ? "—" : rate(dairy.costPerLitreBdt)}
          </Line>
        </CostCard>
        <CostCard title={t("animals.side.fattening")}>
          <WhatWasSpent costs={fattening} />
        </CostCard>
        <CostCard title={t("costs.soldInPeriod")}>
          {soldFattening.animals.map((one) => (
            <Line key={one.tagNumber} label={one.tagNumber}>
              {one.marginBdt === null ? "—" : taka(one.marginBdt)}
            </Line>
          ))}
          <Line label={t("costs.margin")}>
            <span className="font-semibold">
              {taka(soldFattening.marginBdt)}
            </span>
          </Line>
        </CostCard>
      </div>
      <Note amount={unallocated.feedBdt} word="costs.unallocatedNote" />
      <Note amount={unallocated.tripBdt ?? 0} word="costs.strayTripNote" />
      <Note amount={unallocated.herdBdt ?? 0} word="costs.strayHerdNote" />
    </div>
  );
};
