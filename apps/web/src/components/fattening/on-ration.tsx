import type { GainAdjustment, GainStanding } from "@OpenFarm/domain";
import { isShortOfExpected } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  TrendingDown,
  Users,
} from "lucide-react";

import { expectedGainSaid } from "@/components/feed/band-words";
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

type Words = Pick<ReturnType<typeof useLanguage>, "t" | "language">;

/** Why her range is not the Ration's as written — deshi, female, or nobody wrote her breed — in the reader's words, or
 *  nothing for a crossbred bull. Nothing too on a board cached before ranges were cut. */
export const adjustmentSaid = (
  adjustedFor: GainAdjustment | undefined,
  { t, language }: Words
): string | null => {
  if (!adjustedFor) {
    return null;
  }
  const said = [
    adjustedFor.deshiPercent === null
      ? null
      : t("gainOnRation.forDeshi", {
          percent: formatNumber(adjustedFor.deshiPercent, language),
        }),
    adjustedFor.femalePercent === null
      ? null
      : t("gainOnRation.forFemale", {
          percent: formatNumber(adjustedFor.femalePercent, language),
        }),
    adjustedFor.breedRecorded ? null : t("gainOnRation.breedUnknown"),
  ].filter((part) => part !== null);
  return said.length === 0 ? null : said.join(", ");
};

/** What she is judged against, said: her range and why it is hers, or that her weight is outside the Ration's. */
const againstSaid = (onRation: OnRation, words: Words): string => {
  if (outsideBandOf(onRation)) {
    return words.t("gainOnRation.outsideBand");
  }
  const range = expectedGainSaid(onRation.expectedGain, words) ?? "";
  const why = adjustmentSaid(onRation.adjustedFor, words);
  const should = words.t("gainOnRation.expectsShort", { range });
  return why ? `${should} (${why})` : should;
};

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

/** Gaining well under his penmates, as a badge. */
export const BehindPenmatesBadge = () => {
  const { t } = useLanguage();
  return (
    <StatusBadge icon={Users} tone="warning">
      {t("gainOnRation.underPenmates")}
    </StatusBadge>
  );
};

/** The badge beside her target's, when she is gaining under her Ration or losing — or, within it, behind her
 *  penmates: the board's warnings. */
export const ShortOfRationBadge = ({ row }: { row: BoardRow }) => {
  const onRation = onRationOf(row);
  const standing = onRation?.standing ?? null;
  if (standing !== null && isShortOfExpected(standing)) {
    return <GainStandingBadge standing={standing} />;
  }
  // Within his Ration's range, and behind the Pen he stands in. False on a board cached before it said.
  return onRation?.underPenmates ? <BehindPenmatesBadge /> : null;
};

/** What she is judged against on her Ration, alone, for a cell that already says her rate; nothing where the Ration
 *  says no gain. */
export const OnRationVerdict = ({ row }: { row: BoardRow }) => {
  const { t, language } = useLanguage();
  const onRation = onRationOf(row);
  if (!onRation) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-xs">
      {againstSaid(onRation, { t, language })}
    </span>
  );
};
