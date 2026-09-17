import type { GainBasis } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import { TrendingDown } from "lucide-react";

import { StatusBadge, TagChip } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

import type { BoardRow } from "./fattening-types";
import {
  STANDING_LOOK,
  isSlowing,
  standingOf,
  stateLookOf,
} from "./fattening-types";

/**
 * How a fattening animal is said on every list of that side — the board, the suggestions for sale, the day's sales:
 * her Tag Number that opens her page, her State and where she stands against her target as badges, and a rate as a
 * short line. Said once here so the three pages agree.
 */

/** Her Tag Number, which opens her own page. */
export const TagLink = ({ tagNumber }: { tagNumber: string }) => (
  <Link
    className="focus-visible:ring-ring w-fit rounded-md outline-none hover:underline focus-visible:ring-2"
    params={{ tagNumber }}
    to="/animals/$tagNumber"
  >
    <TagChip>{tagNumber}</TagChip>
  </Link>
);

/** Her State on the fattening side, as a badge. */
export const StateBadge = ({ state }: { state: string }) => {
  const { t } = useLanguage();
  const look = stateLookOf(state);
  return (
    <StatusBadge icon={look.icon} tone={look.tone}>
      {t(`state.${state}` as MessageKey)}
    </StatusBadge>
  );
};

/** Whether she makes her target, and — when her last two weighings are slower than her whole stay — that too. */
export const StandingBadges = ({ row }: { row: BoardRow }) => {
  const { t } = useLanguage();
  const look = STANDING_LOOK[standingOf(row.onTrack)];
  return (
    <span className="flex flex-wrap gap-1">
      <StatusBadge icon={look.icon} tone={look.tone}>
        {t(look.word)}
      </StatusBadge>
      {isSlowing(row) ? (
        <StatusBadge icon={TrendingDown} tone="warning">
          {t("gain.slowing")}
        </StatusBadge>
      ) : null}
    </span>
  );
};

/** Both rates in one muted line for a phone's card, each named, and nothing where there is no rate yet. */
export const RatesLine = ({
  sinceIntake,
  recent,
}: {
  sinceIntake: GainBasis | null;
  recent: GainBasis | null;
}) => {
  const { t, language } = useLanguage();
  const rate = (label: MessageKey, basis: GainBasis | null) =>
    basis
      ? `${t(label)} ${t("gain.perDay", {
          kg: formatNumber(basis.dailyGainKg, language),
        })}`
      : null;
  const parts = [
    rate("gain.sinceIntake", sinceIntake),
    rate("gain.recent", recent),
  ].filter((part) => part !== null);
  return (
    <span className="text-muted-foreground text-xs">
      {parts.length === 0 ? t("gain.needsTwo") : parts.join(" · ")}
    </span>
  );
};
