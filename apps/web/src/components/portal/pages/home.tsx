import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Handshake } from "lucide-react";

import type { TheirAgreements } from "@/components/investors/investor-agreements";
import { SaidDate } from "@/components/list-cells";
import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
} from "@/components/page";
import {
  Allocation,
  CapitalAccount,
} from "@/components/portal/capital-account";
import { OpenVenturesOnHome } from "@/components/portal/open-ventures";
import {
  usePortalPlaces,
  useTheirPortfolio,
} from "@/components/portal/portal-source";
import { TheirRequestsOnHome } from "@/components/portal/requests-to-join";
import { StageMeter } from "@/components/portal/stage-meter";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";

type HisAgreement = TheirAgreements["agreements"][number];

/** One Venture they are in: its name, how far along its road it is, their Units and capital, and the terms in force.
 *  The whole card leads to the Venture's own page. */
const VentureCard = ({
  one,
  alone = false,
}: {
  one: HisAgreement;
  /** The only card, with the row to itself: its four facts side by side rather than two by two. */
  alone?: boolean;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const { to, params } = usePortalPlaces().venture(one.id);
  return (
    <li>
      <Link
        className="surface hover:border-primary/40 focus-visible:ring-ring flex h-full flex-col gap-4 p-4 outline-none focus-visible:ring-2 md:p-5"
        params={params}
        to={to}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-base font-semibold">{one.venture.name}</span>
          <ChevronRight
            aria-hidden
            className="text-muted-foreground mt-0.5 size-5 shrink-0"
          />
        </div>
        <StageMeter state={one.venture.state} />
        <dl
          className={cn(
            "grid grid-cols-2 gap-x-6 gap-y-3 text-sm",
            alone && "sm:grid-cols-4"
          )}
        >
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">
              {t("portal.capital")}
            </dt>
            <dd className="font-semibold tabular-nums">
              {taka(one.capitalHeldBdt)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">
              {t("portal.units")}
            </dt>
            <dd className="font-medium tabular-nums">
              {t("portal.unitsHeld", { count: one.units })}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">
              {t("portal.split")}
            </dt>
            <dd className="font-medium tabular-nums">
              {t("portal.splitLine", {
                investors: one.investorsPercent,
                farm: one.farmPercent,
              })}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">
              {t("portal.window")}
            </dt>
            <dd className="font-medium">
              <SaidDate at={one.targetWindow.start} />
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
};

/**
 * Their whole part, once it is read: the capital account first — what investors open a portal to see — then where it
 * sits and each Venture. Their money and their papers are places of their own, in the menu.
 */
const Portfolio = ({ theirs }: { theirs: TheirAgreements }) => {
  const { t } = useLanguage();
  if (theirs.agreements.length === 0) {
    return <EmptyState icon={Handshake} title={t("portal.noVentures")} />;
  }
  return (
    <>
      <CapitalAccount theirs={theirs} />
      <Allocation theirs={theirs} />
      <Section title={t("portal.yourVentures")}>
        <ul
          className={cn(
            "grid gap-3",
            theirs.agreements.length > 1 && "md:grid-cols-2"
          )}
        >
          {theirs.agreements.map((one) => (
            <VentureCard
              alone={theirs.agreements.length === 1}
              key={one.id}
              one={one}
            />
          ))}
        </ul>
      </Section>
    </>
  );
};

/** An Investor's home in the portal: what their money comes to, where it is, each Venture it is in, and what they
 *  have asked to join. */
export const PortalHome = () => {
  const { t } = useLanguage();
  const theirs = useTheirPortfolio();
  return (
    <Page>
      <PageHeader
        description={t("portal.homeHint")}
        title={t("portal.homeTitle")}
      />
      <Loaded
        query={theirs}
        skeleton={<Skeleton className="h-48 rounded-xl" />}
      >
        {theirs.data ? <Portfolio theirs={theirs.data} /> : null}
      </Loaded>
      <TheirRequestsOnHome />
      <OpenVenturesOnHome />
    </Page>
  );
};
