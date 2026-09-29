import type { GainStanding } from "@OpenFarm/domain";
import { isShortOfExpected } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  TrendingDown,
} from "lucide-react";

import { expectedGainSaid } from "@/components/feed/band-words";
import { Nothing } from "@/components/list-cells";
import type { Tone } from "@/components/page";
import { StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

import type { BoardRow } from "./fattening-types";

/**
 * A fattening animal's gain on her Pen's Ration against what the Ration is written to put on her — its Expected Gain —
 * said the same way on the board, on a phone's card, and in the list of the ones falling short.
 */

/** What the board says of her on her Ration; nothing where the Ration says no gain — or the board was cached before
 *  it said any. */
type OnRation = NonNullable<BoardRow["onRation"]>;
const onRationOf = (row: BoardRow): OnRation | null => row.onRation ?? null;

/** Whether she weighs outside the weights her Ration is written for, and so is not judged by its Expected Gain. False
 *  on a board cached before it said. */
const outsideBandOf = (onRation: OnRation): boolean =>
  onRation.outsideBand ?? false;

const STANDING_LOOK: Record<
  GainStanding,
  {
    tone: Tone;
    icon: LucideIcon;
    word:
      | "gainOnRation.losing"
      | "gainOnRation.under"
      | "gainOnRation.within"
      | "gainOnRation.over";
  }
> = {
  losing: { tone: "danger", icon: TrendingDown, word: "gainOnRation.losing" },
  under: { tone: "warning", icon: ArrowDownRight, word: "gainOnRation.under" },
  within: { tone: "success", icon: Check, word: "gainOnRation.within" },
  over: { tone: "success", icon: ArrowUpRight, word: "gainOnRation.over" },
};

/** Her standing against her Ration as a badge. */
export const GainStandingBadge = ({ standing }: { standing: GainStanding }) => {
  const { t } = useLanguage();
  const look = STANDING_LOOK[standing];
  return (
    <StatusBadge icon={look.icon} tone={look.tone}>
      {t(look.word)}
    </StatusBadge>
  );
};

/** The badge beside her target's, only when she is gaining under her Ration or losing: the board's warnings. */
export const ShortOfRationBadge = ({ row }: { row: BoardRow }) => {
  const standing = onRationOf(row)?.standing ?? null;
  return standing !== null && isShortOfExpected(standing) ? (
    <GainStandingBadge standing={standing} />
  ) : null;
};

/** Her gain on her Ration as a cell of the board: the rate over its days, and what the Ration should give beneath —
 *  or that it is too soon to say. A dash where the Ration says no gain. */
export const OnRationFigures = ({ row }: { row: BoardRow }) => {
  const { t, language } = useLanguage();
  const onRation = onRationOf(row);
  if (!onRation) {
    return <Nothing />;
  }
  const range = expectedGainSaid(onRation.expectedGain, { t, language }) ?? "";
  return (
    <div className="flex flex-col items-end gap-0.5 whitespace-nowrap">
      {onRation.gain ? (
        <>
          <span className="font-medium">
            {t("gain.perDay", {
              kg: formatNumber(onRation.gain.dailyGainKg, language),
            })}
          </span>
          <span className="text-muted-foreground text-xs">
            {t("correct.spanDays", {
              days: formatNumber(onRation.gain.overDays, language),
            })}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground text-xs">
          {t("gainOnRation.tooSoon")}
        </span>
      )}
      <span className="text-muted-foreground text-xs">
        {t(
          outsideBandOf(onRation)
            ? "gainOnRation.outsideBand"
            : "gainOnRation.expectsShort",
          { range }
        )}
      </span>
    </div>
  );
};

/** The same in one muted line for a phone's card; nothing where the Ration says no gain. */
export const OnRationLine = ({ row }: { row: BoardRow }) => {
  const { t, language } = useLanguage();
  const onRation = onRationOf(row);
  if (!onRation) {
    return null;
  }
  const range = expectedGainSaid(onRation.expectedGain, { t, language }) ?? "";
  const gain = onRation.gain
    ? t("gain.perDay", {
        kg: formatNumber(onRation.gain.dailyGainKg, language),
      })
    : t("gainOnRation.tooSoon");
  const against = outsideBandOf(onRation)
    ? t("gainOnRation.outsideBand")
    : t("gainOnRation.expectsShort", { range });
  return (
    <span className="text-muted-foreground text-xs">
      {`${t("gainOnRation.onRation")} ${gain} · ${against}`}
    </span>
  );
};
