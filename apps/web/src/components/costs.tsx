import { formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

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

/**
 * What one animal has cost and earned over her time on the farm: her share of the Pens' feed, her doses,
 * and — for a fattening animal — her margin, or for a cow what a litre of hers cost. Every figure worked
 * out from the records, none typed.
 */
export const WhatSheCost = ({ tagNumber }: { tagNumber: string }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const me = useQuery(orpc.people.me.queryOptions());
  // What she cost is money, and money is the Owner's and the Manager's alone.
  const readsMoney =
    me.data?.roles.some((role) => role === "owner" || role === "manager") ??
    false;
  const costs = useQuery({
    ...orpc.costs.ofAnimal.queryOptions({ input: { tagNumber } }),
    enabled: readsMoney,
  });
  if (!costs.data) {
    return null;
  }
  const her = costs.data;
  return (
    <section className="space-y-1 rounded-lg border p-3 text-sm">
      <h2 className="font-medium">{t("costs.title")}</h2>
      <Line label={t("costs.feed")}>{taka(her.feedBdt)}</Line>
      {her.unpricedKg > 0 ? (
        <Line label={t("costs.unpriced")}>
          {t("costs.kg", { kg: formatNumber(her.unpricedKg, language) })}
        </Line>
      ) : null}
      <Line label={t("costs.medicine")}>{taka(her.medicineBdt)}</Line>
      {her.uncostedDoses > 0 ? (
        <Line label={t("costs.uncosted")}>
          {formatNumber(her.uncostedDoses, language)}
        </Line>
      ) : null}
      {her.side === "fattening" ? (
        <>
          {her.purchaseBdt === null ? null : (
            <Line label={t("costs.bought")}>{taka(her.purchaseBdt)}</Line>
          )}
          {her.saleBdt === null ? null : (
            <Line label={t("costs.sold")}>{taka(her.saleBdt)}</Line>
          )}
          <Line label={t("costs.margin")}>
            {her.marginBdt === null ? t("costs.notSold") : taka(her.marginBdt)}
          </Line>
        </>
      ) : (
        <>
          <Line label={t("costs.litres")}>
            {formatNumber(her.litresToBulk, language)}
          </Line>
          <Line label={t("costs.perLitre")}>
            {her.costPerLitreBdt === null ? "—" : taka(her.costPerLitreBdt)}
          </Line>
        </>
      )}
    </section>
  );
};

/** A period by Side: which side of the farm makes money. */
export const CostsBySide = ({ from, to }: { from: string; to: string }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const report = useQuery(
    orpc.costs.bySide.queryOptions({ input: { from, to } })
  );
  if (!report.data) {
    return null;
  }
  const { dairy, fattening, unallocatedFeedBdt } = report.data;
  return (
    <section className="space-y-3">
      <h2 className="font-medium">{t("costs.bySide")}</h2>
      <div className="space-y-1 rounded-lg border p-3 text-sm">
        <h3 className="font-medium">{t("animals.side.dairy")}</h3>
        <Line label={t("costs.feed")}>{taka(dairy.feedBdt)}</Line>
        <Line label={t("costs.medicine")}>{taka(dairy.medicineBdt)}</Line>
        <Line label={t("costs.litres")}>
          {formatNumber(dairy.litresToBulk, language)}
        </Line>
        <Line label={t("costs.perLitre")}>
          {dairy.costPerLitreBdt === null ? "—" : taka(dairy.costPerLitreBdt)}
        </Line>
      </div>
      <div className="space-y-1 rounded-lg border p-3 text-sm">
        <h3 className="font-medium">{t("animals.side.fattening")}</h3>
        <Line label={t("costs.feed")}>{taka(fattening.feedBdt)}</Line>
        <Line label={t("costs.medicine")}>{taka(fattening.medicineBdt)}</Line>
        {fattening.sold.map((one) => (
          <Line key={one.tagNumber} label={one.tagNumber}>
            {one.marginBdt === null ? "—" : taka(one.marginBdt)}
          </Line>
        ))}
        <Line label={t("costs.margin")}>{taka(fattening.marginBdt)}</Line>
      </div>
      <Note
        amount={dairy.unpricedKg + fattening.unpricedKg}
        word="costs.unpricedNote"
      />
      <Note
        amount={dairy.uncostedDoses + fattening.uncostedDoses}
        word="costs.uncostedNote"
      />
      <Note amount={unallocatedFeedBdt} word="costs.unallocatedNote" />
    </section>
  );
};
