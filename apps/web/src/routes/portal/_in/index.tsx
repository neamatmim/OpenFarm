import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Handshake } from "lucide-react";

import type { TheirAgreements } from "@/components/investors/investor-agreements";
import { InvestorMoney } from "@/components/investors/investor-agreements";
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
import { PortalPapers } from "@/components/portal/portal-papers";
import { StageMeter } from "@/components/portal/stage-meter";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

type HisAgreement = TheirAgreements["agreements"][number];

/** One Venture they are in: its name, how far along its road it is, their Units and capital, and the terms in force.
 *  The whole card leads to the Venture's own page. */
const VentureCard = ({ one }: { one: HisAgreement }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <li>
      <Link
        className="surface hover:border-primary/40 focus-visible:ring-ring flex h-full flex-col gap-4 p-4 outline-none focus-visible:ring-2 md:p-5"
        params={{ agreementId: one.id }}
        to="/portal/ventures/$agreementId"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-base font-semibold">{one.venture.name}</span>
          <ChevronRight
            aria-hidden
            className="text-muted-foreground mt-0.5 size-5 shrink-0"
          />
        </div>
        <StageMeter state={one.venture.state} />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
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
 * Every paper of theirs, two clicks from the moment they sign in: each Venture's joining letter and progress
 * statement, and its settlement statement once there is one — made as the Owner would print it.
 */
const TheirPapers = ({ agreements }: { agreements: HisAgreement[] }) => {
  const { t } = useLanguage();
  const papered = agreements.filter((one) => one.venture.state !== "cancelled");
  if (papered.length === 0) {
    return null;
  }
  return (
    <Section description={t("portal.papersHint")} title={t("portal.papers")}>
      <ul className="flex flex-col divide-y">
        {papered.map((one) => (
          <li
            className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between"
            key={one.id}
          >
            <span className="text-sm font-medium">{one.venture.name}</span>
            <PortalPapers
              agreementId={one.id}
              hasCapital={one.capitalHeldBdt > 0 || one.settlement !== null}
              settled={one.settlement !== null}
              size="sm"
            />
          </li>
        ))}
      </ul>
    </Section>
  );
};

/** Their whole part, once it is read: the account first, then where it sits, each Venture, their papers, and every
 *  taka of theirs that moved. */
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
            <VentureCard key={one.id} one={one} />
          ))}
        </ul>
      </Section>
      <TheirPapers agreements={theirs.agreements} />
      <InvestorMoney
        agreements={theirs.agreements}
        inThePortal
        movements={theirs.movements}
      />
    </>
  );
};

/** An Investor's home in the portal: what their money comes to, where it is, and everything of theirs to read. */
const PortalHome = () => {
  const { t } = useLanguage();
  const theirs = useQuery(orpc.portal.portfolio.queryOptions());
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
    </Page>
  );
};

export const Route = createFileRoute("/portal/_in/")({
  component: PortalHome,
});
