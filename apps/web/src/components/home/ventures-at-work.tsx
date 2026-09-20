import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { Handshake } from "lucide-react";

import { RecordList, RecordRow, Section, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

/**
 * The Ventures whose cattle the Manager is looking after: what each was given to buy and to feed with,
 * what is left of it, and how many of its animals are still standing.
 *
 * Whose money it is, how many people put it in and what any of them is owed are not here and never
 * arrive — `ventures.running` is narrow on the server, so there is nothing on this screen to be careful
 * about drawing. The Owner sees the same panel, because she may do anything he does; she has the whole
 * of it on her own Ventures page besides.
 *
 * Nothing at all on a farm with no Venture, and nothing while none of them is buying, fattening or
 * selling — a Venture still Open has bought no animal, and one that is over has none left to feed.
 */
export const VenturesAtWork = () => {
  const { t, language } = useLanguage();
  const ventures = useQuery(orpc.ventures.running.queryOptions());
  const taka = useTaka();
  const rows = ventures.data ?? [];
  if (rows.length === 0) {
    return null;
  }
  return (
    <Section
      className="min-w-0"
      description={t("venturesAtWork.hint")}
      id="ventures-at-work"
      title={t("venturesAtWork.title")}
    >
      <RecordList>
        {rows.map((one) => (
          <RecordRow
            key={one.id}
            leading={
              <Handshake aria-hidden className="text-muted-foreground size-5" />
            }
            meta={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {t("venturesAtWork.feedingLeft", {
                    left: taka(one.runningBudgetHeldBdt),
                  })}
                </span>
                <span>
                  {t("venturesAtWork.spent", { spent: taka(one.spentBdt) })}
                </span>
                <span>
                  {t("venturesAtWork.standing", {
                    standing: formatNumber(one.animalsStanding, language),
                  })}
                </span>
                <span>
                  {t("venturesAtWork.sellingBy", {
                    day: formatDate(
                      startOfFarmDay(one.targetWindow.end),
                      language,
                      "date"
                    ),
                  })}
                </span>
              </span>
            }
            title={one.name}
            trailing={
              one.runningBudgetLow ? (
                <StatusBadge tone="warning">
                  {t("venturesAtWork.runningLow")}
                </StatusBadge>
              ) : null
            }
          />
        ))}
      </RecordList>
    </Section>
  );
};
