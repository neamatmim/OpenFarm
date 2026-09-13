import { formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useReadsMoney } from "@/components/money";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const Line = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex justify-between gap-2">
    <span className="text-muted-foreground">{label}</span>
    <span>{children}</span>
  </div>
);

/** What the figures leave out, said only when there is something left out. */
const Note = ({
  amount,
  word,
}: {
  amount: number;
  word: "costs.unpricedNote" | "costs.uncostedNote" | "costs.unallocatedNote";
}) => {
  const { t, language } = useLanguage();
  return amount > 0 ? (
    <p className="text-muted-foreground text-xs">
      {t(word, { amount: formatNumber(amount, language) })}
    </p>
  ) : null;
};

/** Taka in the reader's digits. */
const useTaka = () => {
  const { language } = useLanguage();
  return (amount: number) => `৳${formatNumber(amount, language)}`;
};

/** Feed, doses and the Vet, however much of each there was — and what the figures leave out. */
const WhatWasSpent = ({
  costs,
}: {
  costs: {
    feedBdt: number;
    unpricedKg: number;
    medicineBdt: number;
    uncostedDoses: number;
    vetBdt: number;
  };
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <>
      <Line label={t("costs.feed")}>{taka(costs.feedBdt)}</Line>
      <Line label={t("costs.medicine")}>{taka(costs.medicineBdt)}</Line>
      <Line label={t("costs.vet")}>{taka(costs.vetBdt)}</Line>
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
  return (
    <section className="surface space-y-1 p-4 text-sm">
      <h2 className="text-lg font-semibold">{t("costs.title")}</h2>
      <WhatWasSpent costs={her} />
      {her.side === "fattening" ? (
        <>
          <Line label={t("costs.bought")}>{orDash(her.purchaseBdt)}</Line>
          <Line label={t("costs.sold")}>{orDash(her.saleBdt)}</Line>
          <Line label={t("costs.margin")}>
            {her.marginBdt === null ? t("costs.notSold") : taka(her.marginBdt)}
          </Line>
          <Line label={t("costs.costOfGain")}>{orDash(her.costOfGainBdt)}</Line>
        </>
      ) : null}
      {her.lactation ? (
        <>
          <h3 className="pt-2 font-medium">{t("costs.thisLactation")}</h3>
          <WhatWasSpent costs={her.lactation} />
          <Line label={t("costs.litres")}>
            {formatNumber(her.lactation.litresToBulk, language)}
          </Line>
          <Line label={t("costs.perLitre")}>
            {orDash(her.lactation.costPerLitreBdt)}
          </Line>
        </>
      ) : null}
    </section>
  );
};

/**
 * A period by Side: what each Side's animals were fed, dosed and visited for in it, what a litre of the
 * Dairy side's milk cost — and, apart, the fattening animals sold in it with each one's whole-life Margin.
 */
export const CostsBySide = ({ from, to }: { from: string; to: string }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const report = useQuery(
    orpc.costs.bySide.queryOptions({ input: { from, to } })
  );
  if (!report.data) {
    return null;
  }
  const { dairy, fattening, soldFattening, unallocated } = report.data;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("costs.bySide")}</h2>
      <div className="surface space-y-1 p-4 text-sm">
        <h3 className="font-medium">{t("animals.side.dairy")}</h3>
        <WhatWasSpent costs={dairy} />
        <Line label={t("costs.litres")}>
          {formatNumber(dairy.litresToBulk, language)}
        </Line>
        <Line label={t("costs.perLitre")}>
          {dairy.costPerLitreBdt === null ? "—" : taka(dairy.costPerLitreBdt)}
        </Line>
      </div>
      <div className="surface space-y-1 p-4 text-sm">
        <h3 className="font-medium">{t("animals.side.fattening")}</h3>
        <WhatWasSpent costs={fattening} />
      </div>
      <div className="surface space-y-1 p-4 text-sm">
        <h3 className="font-medium">{t("costs.soldInPeriod")}</h3>
        {soldFattening.animals.map((one) => (
          <Line key={one.tagNumber} label={one.tagNumber}>
            {one.marginBdt === null ? "—" : taka(one.marginBdt)}
          </Line>
        ))}
        <Line label={t("costs.margin")}>{taka(soldFattening.marginBdt)}</Line>
      </div>
      <Note amount={unallocated.feedBdt} word="costs.unallocatedNote" />
    </section>
  );
};
