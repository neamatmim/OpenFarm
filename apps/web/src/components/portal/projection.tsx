import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { Section, StatusBadge } from "@/components/page";
import type { OpenVenture } from "@/components/portal/open-ventures";
import { usePreviewing } from "@/components/portal/portal-source";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { client } from "@/utils/orpc";

type HisProjection = NonNullable<
  Awaited<ReturnType<typeof client.portal.venture>>["projection"]
>;
type OfferedProjection = NonNullable<OpenVenture["projection"]>;

/** A figure's range, low to high, under its name, and set larger than the facts about it. */
const Range = ({
  label,
  low,
  high,
}: {
  label: string;
  low: number;
  high: number;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">
        {t("projection.range", { low: taka(low), high: taka(high) })}
      </dd>
    </div>
  );
};

/** What every projection says with it: that it is an estimate, a loss where the low price comes to one, and — for
 *  the Owner in the Preview — that Investors see it only when it is shown. */
const Said = ({
  hint,
  loss,
  deathsPercent,
  children,
}: {
  hint: string;
  loss: boolean;
  /** Missing from an answer this phone kept from before a plan could expect deaths: read as none. */
  deathsPercent: number | undefined;
  children: ReactNode;
}) => {
  const { t, language } = useLanguage();
  const deaths = deathsPercent ?? 0;
  const allowsForDeaths = deaths > 0;
  const previewing = usePreviewing() !== null;
  return (
    <Section
      description={hint}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t("portal.projection.title")}
          <StatusBadge icon={Info} tone="warning">
            {t("portal.projection.notAPromise")}
          </StatusBadge>
        </span>
      }
    >
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
      {allowsForDeaths ? (
        <p className="text-muted-foreground text-sm">
          {t("portal.projection.deaths", {
            percent: t("portal.percent", {
              percent: formatNumber(deaths, language),
            }),
          })}
        </p>
      ) : null}
      {loss ? (
        <p className="text-warning text-sm">{t("portal.projection.loss")}</p>
      ) : null}
      {previewing ? (
        <p className="text-muted-foreground border-t pt-3 text-xs">
          {t("portal.projection.preview")}
        </p>
      ) : null}
    </Section>
  );
};

/**
 * What one of their Ventures might come to for their own Units (ADR 0010): their share of the profit and what they
 * would be paid, at the low and the high of the farm's expected sale prices — said as an estimate, with where it
 * comes from beside it. Nothing when there is none to show.
 */
export const HisProjectionSection = ({
  projection,
}: {
  projection: HisProjection | null;
}) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  if (!projection) {
    return null;
  }
  return (
    <Said
      hint={t("portal.projection.hint", {
        low: taka(projection.saleLowBdtPerKg),
        high: taka(projection.saleHighBdtPerKg),
        day: formatDate(new Date(projection.setAt), language, "date"),
      })}
      deathsPercent={projection.deathsPercent}
      loss={projection.low.profitBdt < 0}
    >
      <Range
        high={projection.high.shareBdt}
        label={t("portal.projection.yourShare")}
        low={projection.low.shareBdt}
      />
      <Range
        high={projection.high.payoutBdt}
        label={t("portal.projection.yourPayout")}
        low={projection.low.payoutBdt}
      />
    </Said>
  );
};

/**
 * What a Unit of an offered Venture might make (ADR 0010), at the low and the high of the farm's expected sale prices,
 * with the plan it is worked from said in full — an estimate, never a promise. Nothing when there is none to show.
 */
export const OfferProjectionSection = ({
  projection,
}: {
  projection: OfferedProjection | null;
}) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  if (!projection) {
    return null;
  }
  const kg = (value: number | null) =>
    t("portal.kg", { kg: formatNumber(value ?? 0, language) });
  return (
    <Said
      hint={t("portal.projection.offerHint", {
        buy: taka(projection.buyBdtPerKg ?? 0),
        weight: kg(projection.buyWeightKg),
        gain: kg(projection.dailyGainKg),
        low: taka(projection.saleLowBdtPerKg),
        high: taka(projection.saleHighBdtPerKg),
        day: formatDate(new Date(projection.setAt), language, "date"),
      })}
      deathsPercent={projection.deathsPercent}
      loss={projection.low.profitBdt < 0}
    >
      <Range
        high={projection.high.perUnitBdt}
        label={t("portal.projection.perUnit")}
        low={projection.low.perUnitBdt}
      />
    </Said>
  );
};
