import type { EarlyLosses } from "@OpenFarm/domain";
import { useQuery } from "@tanstack/react-query";

import { Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** One seller's, or one livestock market's, year: how many were bought, and how many were lost, fell ill or weighed short early. */
const LossLine = ({ row }: { row: EarlyLosses }) => {
  const { t } = useLanguage();
  return (
    <li className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <span className="font-medium">{row.name}</span>
      <span className="text-muted-foreground text-sm tabular-nums">
        {t("early.line", {
          bought: row.bought,
          died: row.died,
          culled: row.culled,
          diagnosed: row.diagnosed,
          // Missing from an answer a phone kept from before weights were counted: none.
          weighedShort: row.weighedShort ?? 0,
        })}
      </span>
    </li>
  );
};

/** A list of sellers or of livestock markets, under its heading; nothing at all where none lost an animal early. */
const LossList = ({ title, rows }: { title: string; rows: EarlyLosses[] }) =>
  rows.length === 0 ? null : (
    <div className="flex flex-col">
      <h4 className="text-muted-foreground text-xs font-medium">{title}</h4>
      <ul className="divide-y">
        {rows.map((row) => (
          <LossLine key={row.name} row={row} />
        ))}
      </ul>
    </div>
  );

/**
 * The animals bought over the last year that died, were culled or fell ill within their first thirty days, by who sold
 * them and by the livestock market — the most lost first. The Owner's: a pattern to ask a trader about, never written on the animal.
 */
export const EarlyLossesSection = () => {
  const { t } = useLanguage();
  const losses = useQuery(orpc.intakes.earlyLosses.queryOptions());
  if (!losses.data) {
    return null;
  }
  const { bySeller, byLivestockMarket } = losses.data;
  const none = bySeller.length === 0 && byLivestockMarket.length === 0;
  return (
    <Section description={t("early.hint")} title={t("early.title")}>
      {none ? (
        <p className="text-muted-foreground text-sm">{t("early.none")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <LossList rows={bySeller} title={t("early.bySeller")} />
          <LossList
            rows={byLivestockMarket}
            title={t("early.byLivestockMarket")}
          />
        </div>
      )}
    </Section>
  );
};
