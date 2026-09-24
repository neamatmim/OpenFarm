import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Handshake } from "lucide-react";

import { SaidDate } from "@/components/list-cells";
import { EmptyState, Loaded, PageHeader, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

type HisVenture = Awaited<ReturnType<typeof orpc.portal.ventures.call>>[number];

/** One Venture they are in: its name and where it stands, their Units and capital, and the terms in force. */
const VentureCard = ({ one }: { one: HisVenture }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <li>
      <Link
        className="surface hover:border-primary/40 focus-visible:ring-ring flex items-center gap-4 p-4 outline-none focus-visible:ring-2 md:p-5"
        params={{ agreementId: one.agreementId }}
        to="/portal/ventures/$agreementId"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{one.venture.name}</span>
            <StatusBadge tone="neutral">
              {t(`ventures.state.${one.venture.state}`)}
            </StatusBadge>
          </div>
          <dl className="text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs">{t("portal.units")}</dt>
              <dd className="text-foreground font-medium tabular-nums">
                {t("portal.unitsHeld", { count: one.units })}
              </dd>
            </div>
            <div>
              <dt className="text-xs">{t("portal.capital")}</dt>
              <dd className="text-foreground font-medium tabular-nums">
                {taka(one.capitalBdt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs">{t("portal.split")}</dt>
              <dd className="text-foreground font-medium tabular-nums">
                {t("portal.splitLine", {
                  investors: one.investorsPercent,
                  farm: 100 - one.investorsPercent,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs">{t("portal.window")}</dt>
              <dd className="text-foreground font-medium">
                <SaidDate at={one.targetWindowStart} />
              </dd>
            </div>
          </dl>
        </div>
        <ChevronRight aria-hidden className="text-muted-foreground size-5" />
      </Link>
    </li>
  );
};

/** Every Venture this Investor is in, the latest first. */
const PortalHome = () => {
  const { t } = useLanguage();
  const ventures = useQuery(orpc.portal.ventures.queryOptions());
  return (
    <>
      <PageHeader
        description={t("portal.homeHint")}
        title={t("portal.homeTitle")}
      />
      <Loaded
        query={ventures}
        skeleton={<Skeleton className="h-40 rounded-xl" />}
      >
        {ventures.data?.length === 0 ? (
          <EmptyState icon={Handshake} title={t("portal.noVentures")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {(ventures.data ?? []).map((one) => (
              <VentureCard key={one.agreementId} one={one} />
            ))}
          </ul>
        )}
      </Loaded>
    </>
  );
};

export const Route = createFileRoute("/portal/_in/")({
  component: PortalHome,
});
