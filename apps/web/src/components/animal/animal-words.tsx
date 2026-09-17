import type { AnimalState } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { Beef, Lock, Milk } from "lucide-react";

import type { Tone } from "@/components/page";
import { StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/**
 * How an animal is said wherever she is listed or looked up: her State as a badge, her Side with its icon, her age
 * from the day she was born, and what is holding her back. Said once here so the herd and her own page agree.
 */

/** A State's loudness: in quarantine or gone is worth a glance, ready for sale is good news, the rest is plain. */
const STATE_TONE: Partial<Record<AnimalState, Tone>> = {
  quarantine: "warning",
  ready_for_sale: "success",
  milking: "info",
  died: "danger",
  culled: "danger",
};

export const StateBadge = ({ state }: { state: string }) => {
  const { t } = useLanguage();
  return (
    <StatusBadge tone={STATE_TONE[state as AnimalState] ?? "neutral"}>
      {t(`state.${state}` as MessageKey)}
    </StatusBadge>
  );
};

/** Her Side, with the milk can or the beef beside the word. */
export const SideWord = ({ side }: { side: "dairy" | "fattening" }) => {
  const { t } = useLanguage();
  const Icon = side === "dairy" ? Milk : Beef;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon aria-hidden className="text-muted-foreground size-4" />
      {t(`animals.side.${side}`)}
    </span>
  );
};

/** Whatever Withdrawal is holding her, each as its own badge; nothing at all when she is clear. */
export const HeldBadges = ({
  milkHeld,
  meatHeld,
}: {
  milkHeld: boolean;
  meatHeld: boolean;
}) => {
  const { t } = useLanguage();
  if (!(milkHeld || meatHeld)) {
    return null;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {milkHeld ? (
        <StatusBadge icon={Lock} tone="warning">
          {t("animals.milkHeld")}
        </StatusBadge>
      ) : null}
      {meatHeld ? (
        <StatusBadge icon={Lock} tone="warning">
          {t("animals.meatHeld")}
        </StatusBadge>
      ) : null}
    </span>
  );
};

const MONTHS_IN_A_YEAR = 12;
/** Under two years a calf or a heifer is counted in months. */
const MONTHS_BEFORE_YEARS = 24;

/** Whole months from the day she was born to today. */
export const monthsOld = (birthDate: Date | string, now = new Date()) => {
  const born = new Date(birthDate);
  const months =
    (now.getFullYear() - born.getFullYear()) * MONTHS_IN_A_YEAR +
    (now.getMonth() - born.getMonth()) -
    (now.getDate() < born.getDate() ? 1 : 0);
  return Math.max(0, months);
};

/** Her age in the farm's words — months under two years, as the farm talks about a calf or a heifer, years after —
 *  or nothing for an animal whose birth nobody wrote down. */
export const ageWords = (
  t: ReturnType<typeof useLanguage>["t"],
  birthDate: Date | string | null
): string | null => {
  if (birthDate === null) {
    return null;
  }
  const months = monthsOld(birthDate);
  if (months < MONTHS_BEFORE_YEARS) {
    return t("intake.months", { months });
  }
  return t("animals.ageYears", {
    years: Math.floor(months / MONTHS_IN_A_YEAR),
    months: months % MONTHS_IN_A_YEAR,
  });
};

/** Whether a Withdrawal still holds her, as of when the list is drawn. */
export const stillHeld = (until: Date | string | null): boolean =>
  until !== null && new Date(until).getTime() > Date.now();
