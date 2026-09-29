import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { expectedGainSaid } from "@/components/feed/band-words";
import { Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

import { TagLink } from "./fattening-words";
import {
  BehindPenmatesBadge,
  GainStandingBadge,
  adjustmentSaid,
} from "./on-ration";

/** The days a gain is read over on a farm that has not said — the column's own default — for a farm answer cached
 *  before it had the figure. */
const GAIN_READ_DAYS_UNTOLD = 28;

/** How many are listed before the rest are asked for, as with the bulls in the wrong Pen. */
const SHOWN_AT_FIRST = 5;

type UnderRow = Awaited<
  ReturnType<typeof orpc.fattening.underExpectedGain.call>
>[number];

/** One bull falling short: how he stands, his gain and the readings it runs between, and what his Ration should give. */
const UnderLine = ({ row }: { row: UnderRow }) => {
  const { t, language } = useLanguage();
  // His own range — the Ration's, cut for his being deshi or female — and why, from a list cached before either.
  const range =
    expectedGainSaid(row.expectedGain ?? row.pen.expectedGain, {
      t,
      language,
    }) ?? "";
  const why = adjustmentSaid(row.adjustedFor, { t, language });
  const day = (at: Date) => formatDate(new Date(at), language, "date");
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <TagLink tagNumber={row.tagNumber} />
        {row.standing &&
        row.standing !== "within" &&
        row.standing !== "over" ? (
          <GainStandingBadge standing={row.standing} />
        ) : null}
        {row.underPenmates ? <BehindPenmatesBadge /> : null}
        {row.gain ? (
          <span className="text-sm tabular-nums">
            {t("gainOnRation.gained", {
              gain: t("gain.perDay", {
                kg: formatNumber(row.gain.dailyGainKg, language),
              }),
              days: formatNumber(row.gain.overDays, language),
              from: day(row.gain.from.weighedAt),
              to: day(row.gain.to.weighedAt),
            })}
          </span>
        ) : null}
      </div>
      <span className="text-muted-foreground text-xs">
        {t("gainOnRation.expects", {
          pen: row.pen.penName,
          ration: row.pen.rationName,
          range,
        })}
        {why ? ` (${why})` : ""}
      </span>
      {row.penmates ? (
        <span className="text-muted-foreground text-xs">
          {t("gainOnRation.penmates", {
            gain: t("gain.perDay", {
              kg: formatNumber(row.penmates.middleKg, language),
            }),
            count: formatNumber(row.penmates.animals, language),
          })}
        </span>
      ) : null}
    </li>
  );
};

/**
 * The bulls gaining under what their Pen's Ration is written to put on them, or losing weight — somebody's reason to
 * go and look at each. Nothing is drawn while none is, or no Ration says what it should give.
 */
export const UnderExpectedGain = () => {
  const { t, language } = useLanguage();
  const rows = useQuery(orpc.fattening.underExpectedGain.queryOptions());
  const farm = useQuery(orpc.farm.current.queryOptions());
  const [all, setAll] = useState(false);
  if (!rows.data?.length) {
    return null;
  }
  const readDays =
    farm.data && "gainReadDays" in farm.data
      ? farm.data.gainReadDays
      : GAIN_READ_DAYS_UNTOLD;
  const shown = all ? rows.data : rows.data.slice(0, SHOWN_AT_FIRST);
  const someHidden = shown.length < rows.data.length;
  return (
    <Section
      description={t("gainOnRation.hint", {
        days: formatNumber(readDays, language),
      })}
      title={t("gainOnRation.title")}
    >
      <ul className="divide-y">
        {shown.map((row) => (
          <UnderLine key={row.tagNumber} row={row} />
        ))}
      </ul>
      {someHidden ? (
        <Button
          className="self-start"
          onClick={() => setAll(true)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("band.showAll", {
            count: formatNumber(rows.data.length, language),
          })}
        </Button>
      ) : null}
    </Section>
  );
};
