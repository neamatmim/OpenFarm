import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";

import { Loaded, Section } from "@/components/page";
import { FigureTerm } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useKg } from "@/lib/kg";
import { useRange } from "@/lib/range";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";
import type { client } from "@/utils/orpc";

type Read = Awaited<ReturnType<typeof client.ventures.projection>>;

/** What the projection comes to, at both ends, with what it is worked from. */
const Figures = ({ read }: { read: Read }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const kg = useKg();
  const range = useRange();
  const { basis, projection } = read;
  if (!(basis && projection)) {
    return (
      <p className="text-muted-foreground text-sm">{t("projection.none")}</p>
    );
  }
  const day = formatDate(new Date(basis.setAt), language, "date");
  // Fewer at the low end by the deaths the plan expects. An answer this phone kept from before has one weight only.
  const highKg = Math.round(projection.kgAtSale);
  const lowKg = Math.round(projection.low.kgAtSale ?? projection.kgAtSale);
  return (
    <>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <FigureTerm label={t("projection.profit")}>
          {range(
            taka(projection.low.profitBdt),
            taka(projection.high.profitBdt)
          )}
        </FigureTerm>
        <FigureTerm label={t("projection.perUnit")}>
          {range(
            taka(projection.low.perUnitBdt),
            taka(projection.high.perUnitBdt)
          )}
        </FigureTerm>
        <FigureTerm label={t("projection.prices")}>
          {range(taka(basis.saleLowBdtPerKg), taka(basis.saleHighBdtPerKg))}
        </FigureTerm>
        <FigureTerm label={t("projection.kgAtSale")}>
          {range(kg(lowKg), kg(highKg))}
        </FigureTerm>
        <FigureTerm label={t("projection.charged")}>
          {taka(projection.chargedBdt)}
        </FigureTerm>
        {projection.realisedBdt > 0 ? (
          <FigureTerm label={t("projection.realised")}>
            {taka(projection.realisedBdt)}
          </FigureTerm>
        ) : null}
      </dl>
      {projection.low.profitBdt < 0 ? (
        <p className="text-warning text-sm">{t("projection.lossAtLow")}</p>
      ) : null}
      {/* An answer this phone kept from before a plan version was said has none: the line is left out. */}
      {typeof basis.planVersion === "number" ? (
        <p className="text-muted-foreground text-xs">
          {t("projection.fromPlan", {
            version: formatNumber(basis.planVersion, language),
            day,
          })}
        </p>
      ) : null}
    </>
  );
};

/**
 * A Venture's Projection on the Owner's page (ADR 0010): what it might make at the sale prices its plan expects, and
 * which version of the plan it is worked from. The prices are set in the plan, not here. Nothing for one that is
 * settled or called off.
 */
export const VentureProjectionPanel = ({ venture }: { venture: Venture }) => {
  const { t } = useLanguage();
  const read = useQuery(
    orpc.ventures.projection.queryOptions({ input: { ventureId: venture.id } })
  );
  if (venture.state === "settled" || venture.state === "cancelled") {
    return null;
  }
  return (
    <Section description={t("projection.hint")} title={t("projection.title")}>
      <Loaded query={read}>
        {read.data ? <Figures read={read.data} /> : null}
      </Loaded>
    </Section>
  );
};
