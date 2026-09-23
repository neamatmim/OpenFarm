import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";

import { StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/** How many days before a Lot's last day the store starts saying so, until the farm sets its own. */
export const EXPIRY_WARN_DAYS = 30;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Where a Lot stands against its last day: past it, within the warning, or clear of it — or no day printed. */
export type ExpiryStanding = "expired" | "soon" | "fine" | "none";

/**
 * Where a Lot stands against the day it may be used until, on the farm's own calendar.
 *
 * Expired is the day after its last: a box that says 31 August may still be used on 31 August. The days are
 * YYYY-MM-DD, which sort as text.
 */
export const expiryStanding = (
  expiresOn: string | null | undefined,
  { now = new Date(), warnDays = EXPIRY_WARN_DAYS } = {}
): ExpiryStanding => {
  if (!expiresOn) {
    return "none";
  }
  const today = farmDayOf(now);
  const warnFrom = farmDayOf(new Date(now.getTime() + warnDays * ONE_DAY_MS));
  // Named, because the guard against untranslated JSX text reads an angle bracket in a comparison as a tag.
  const pastIt = expiresOn < today;
  const withinTheWarning = expiresOn <= warnFrom;
  if (pastIt) {
    return "expired";
  }
  return withinTheWarning ? "soon" : "fine";
};

/**
 * A Lot's number and last day, as a list cell reads them: the day, and beside it whether it has gone or is going.
 * A dash where neither was written down.
 */
export const LotAndExpiry = ({
  lotNumber,
  expiresOn,
  warnDays = EXPIRY_WARN_DAYS,
}: {
  lotNumber: string | null | undefined;
  expiresOn: string | null | undefined;
  warnDays?: number;
}) => {
  const { t, language } = useLanguage();
  if (!(lotNumber || expiresOn)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const standing = expiryStanding(expiresOn, { warnDays });
  return (
    <span className="flex flex-col items-start gap-1">
      {lotNumber ? (
        <span className="font-mono text-xs">{lotNumber}</span>
      ) : null}
      {expiresOn ? (
        <span className="flex flex-wrap items-center gap-1 text-sm whitespace-nowrap">
          {formatDate(startOfFarmDay(expiresOn), language, "date")}
          {standing === "expired" ? (
            <StatusBadge tone="danger">{t("lots.expired")}</StatusBadge>
          ) : null}
          {standing === "soon" ? (
            <StatusBadge tone="warning">{t("lots.expiresSoon")}</StatusBadge>
          ) : null}
        </span>
      ) : null}
    </span>
  );
};
