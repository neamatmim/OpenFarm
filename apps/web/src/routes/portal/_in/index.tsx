import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, FileText, Handshake, ScrollText } from "lucide-react";

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
import { PageTabs } from "@/components/page-kit";
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

const TABS = ["ventures", "money", "papers"] as const;
type Tab = (typeof TABS)[number];

/**
 * Their whole part, once it is read: the capital account first and always — what investors open a portal to see —
 * then one view at a time, as investor portals divide it: where it sits and each Venture, every taka that moved, and
 * every paper.
 */
const Portfolio = ({ theirs, tab }: { theirs: TheirAgreements; tab: Tab }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  if (theirs.agreements.length === 0) {
    return <EmptyState icon={Handshake} title={t("portal.noVentures")} />;
  }
  return (
    <>
      <CapitalAccount theirs={theirs} />
      <PageTabs
        onChange={(value) =>
          navigate({
            replace: true,
            search: value === "ventures" ? {} : { tab: value },
            to: "/portal",
          })
        }
        tabs={[
          {
            value: "ventures",
            label: t("portal.yourVentures"),
            icon: Handshake,
            content: (
              <div className="flex flex-col gap-4">
                <Allocation theirs={theirs} />
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
              </div>
            ),
          },
          {
            value: "money",
            label: t("portal.tab.money"),
            icon: ScrollText,
            content: (
              <InvestorMoney
                agreements={theirs.agreements}
                inThePortal
                movements={theirs.movements}
              />
            ),
          },
          {
            value: "papers",
            label: t("portal.papers"),
            icon: FileText,
            content: <TheirPapers agreements={theirs.agreements} />,
          },
        ]}
        value={tab}
      />
    </>
  );
};

/** An Investor's home in the portal: what their money comes to, where it is, and everything of theirs to read. */
const PortalHome = () => {
  const { t } = useLanguage();
  const { tab = "ventures" } = Route.useSearch();
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
        {theirs.data ? <Portfolio tab={tab} theirs={theirs.data} /> : null}
      </Loaded>
    </Page>
  );
};

/** What the address may say about this page: which of its views is open. */
interface PortfolioSearch {
  tab?: Tab;
}

export const Route = createFileRoute("/portal/_in/")({
  component: PortalHome,
  validateSearch: (search: Record<string, unknown>): PortfolioSearch =>
    TABS.includes(search.tab as Tab) && search.tab !== "ventures"
      ? { tab: search.tab as Tab }
      : {},
});
