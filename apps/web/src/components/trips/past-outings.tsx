import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { useMutation, useQuery } from "@tanstack/react-query";

import { TakeItBack } from "@/components/animal/take-it-back";
import { useIsOwner } from "@/components/money";
import { Section } from "@/components/page";
import { BuyingTripCorrection } from "@/components/trips/trip-corrections";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { orpc } from "@/utils/orpc";

/** A Farm float's count taken back, with the Owner's reason: the cash it brought back goes back to who carried it. */
const UncountFarmFloat = ({ tripId }: { tripId: string }) => {
  const { t } = useLanguage();
  const uncount = useMutation(orpc.cash.uncountFloat.mutationOptions({}));
  return (
    <TakeItBack
      choice={t("ventures.uncountIt")}
      hint={t("cash.uncountHint")}
      onSave={(reason) => uncount.mutateAsync({ tripId, reason })}
      title={t("ventures.uncount")}
    />
  );
};

/**
 * The farm's latest buying outings: where each went, the day, what it cost and how many came home on it — each to put
 * right where it was written up wrong. Nothing while there are none.
 */
export const PastOutings = () => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const trips = useQuery(orpc.buyingTrips.list.queryOptions());
  const isOwner = useIsOwner();
  const past = trips.data ?? [];
  if (past.length === 0) {
    return null;
  }
  return (
    <Section id="buying-trips-past" title={t("intake.pastTrips")}>
      <ul className="flex flex-col">
        {past.map((one) => (
          <li
            className="border-border/60 flex items-start justify-between gap-3 border-b py-2.5 text-sm first:pt-0 last:border-b-0 last:pb-0"
            key={one.id}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{one.wentTo}</span>
              <span className="text-muted-foreground text-xs">
                {formatDate(one.wentOn, language, "date")}
              </span>
            </span>
            <span className="flex flex-col items-end gap-0.5 whitespace-nowrap tabular-nums">
              <span className="font-medium">{asMoney(one.costMoney)}</span>
              <span className="text-muted-foreground text-xs">
                {t("intake.cameHome", {
                  count: formatNumber(one.animals, language),
                })}
              </span>
              {/* Put right part by part; an answer kept from before the parts were listed has none to show. */}
              {one.parts ? (
                <BuyingTripCorrection trip={{ ...one, parts: one.parts }} />
              ) : null}
              {/* A Farm float counted home is taken back by the Owner, and counted again. */}
              {isOwner && (one.countedHome ?? false) ? (
                <UncountFarmFloat tripId={one.id} />
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
};
