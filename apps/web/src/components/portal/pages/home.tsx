import { hasEnded } from "@OpenFarm/domain";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Handshake } from "lucide-react";

import { MORE_LINK } from "@/components/home/queue";
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
import { FiguresAsAt } from "@/components/portal/figures-as-at";
import {
  OpenVenturesOnHome,
  RaisingLine,
} from "@/components/portal/open-ventures";
import { HomeSkeleton } from "@/components/portal/portal-skeletons";
import {
  usePortalPlaces,
  useTheirPortfolio,
} from "@/components/portal/portal-source";
import {
  ComeAndSign,
  TheirRequestsOnHome,
} from "@/components/portal/requests-to-join";
import { StageMeter } from "@/components/portal/stage-meter";
import { StillToPay } from "@/components/portal/still-to-pay";
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
  const { to, params } = usePortalPlaces().venture(one.id).link;
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
            {/* The whole window, as the Venture's own page says it: its first day alone reads as a promised date. */}
            <dd className="font-medium">
              <SaidDate at={one.targetWindow.start} /> –{" "}
              <SaidDate at={one.targetWindow.end} />
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
};

/**
 * Their whole part, once it is read: the capital account first — what investors open a portal to see — then where it
 * sits and each Venture still running. Those that have finished, their money and their papers are places of their
 * own, in the menu.
 */
const Portfolio = ({ theirs }: { theirs: TheirAgreements }) => {
  const { t } = useLanguage();
  const { ventures } = usePortalPlaces();
  if (theirs.agreements.length === 0) {
    return (
      <EmptyState
        description={t("portal.noVenturesHint")}
        icon={Handshake}
        title={t("portal.noVentures")}
      />
    );
  }
  const running = theirs.agreements.filter(
    (one) => !hasEnded(one.venture.state)
  );
  // With nothing running, the list opens on what has finished rather than on "none running" again.
  const allSearch = running.length === 0 ? { tab: "finished" as const } : {};
  return (
    <>
      <StillToPay theirs={theirs} />
      <CapitalAccount theirs={theirs} />
      <Allocation theirs={theirs} />
      <Section
        action={
          <Link
            className={cn(MORE_LINK, "text-sm")}
            params={ventures.link.params}
            search={allSearch}
            to={ventures.link.to}
          >
            {t("portal.ventures.all")}
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        }
        plain
        title={t("portal.yourVentures")}
      >
        {running.length > 0 ? (
          <ul
            className={cn("grid gap-3", running.length > 1 && "md:grid-cols-2")}
          >
            {running.map((one) => (
              <VentureCard
                alone={running.length === 1}
                key={one.id}
                one={one}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("portal.ventures.noneRunning")}
          </p>
        )}
      </Section>
    </>
  );
};

/** An Investor's home in the portal: what their money comes to, where it is, each Venture it is in, and what they
 *  have asked to join. */
export const PortalHome = () => {
  const { t } = useLanguage();
  const theirs = useTheirPortfolio();
  const notInAnyYet = theirs.data?.agreements.length === 0;
  return (
    <Page>
      <PageHeader
        description={t("portal.homeHint")}
        meta={
          theirs.data ? (
            <FiguresAsAt readAt={theirs.dataUpdatedAt} />
          ) : undefined
        }
        title={t("portal.homeTitle")}
      />
      {/* The one answer they have to act on comes first: the farm will sign with them. */}
      <ComeAndSign />
      {/* Somebody in no Venture yet reads what the farm is raising capital for, and what they have asked, before being
          told they are in none; everybody else is told of offers in one line, with their own money straight after. */}
      {notInAnyYet ? (
        <>
          <OpenVenturesOnHome />
          <TheirRequestsOnHome />
        </>
      ) : (
        <RaisingLine />
      )}
      <Loaded query={theirs} skeleton={<HomeSkeleton />}>
        {theirs.data ? <Portfolio theirs={theirs.data} /> : null}
      </Loaded>
      {notInAnyYet ? null : (
        <>
          <TheirRequestsOnHome />
          <OpenVenturesOnHome />
        </>
      )}
    </Page>
  );
};
