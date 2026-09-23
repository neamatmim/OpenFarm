import { startOfFarmDay } from "@OpenFarm/domain";
import type { ExpiryStanding } from "@OpenFarm/domain/lots";
import { formatDate } from "@OpenFarm/i18n";

import { Nothing } from "@/components/list-cells";
import { StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/**
 * A Lot's number and last day, as a list cell reads them: the day, and beside it whether it has gone or is going.
 * A dash where neither was written down.
 *
 * Whether it has gone or is going is the farm's to say — on its own day, by the warning it set — and arrives with
 * the Lot. A row kept from before the farm said so shows the day alone until it is read again.
 */
export const LotAndExpiry = ({
  lotNumber,
  expiresOn,
  standing,
}: {
  lotNumber: string | null | undefined;
  expiresOn: string | null | undefined;
  standing: ExpiryStanding | undefined;
}) => {
  const { t, language } = useLanguage();
  if (!(lotNumber || expiresOn)) {
    return <Nothing />;
  }
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
