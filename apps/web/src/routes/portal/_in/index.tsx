import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Banknote,
  ChevronRight,
  Handshake,
  TrendingUp,
  Wallet,
} from "lucide-react";

import type { TheirAgreements } from "@/components/investors/investor-agreements";
import {
  InvestorMoney,
  portfolioOf,
} from "@/components/investors/investor-agreements";
import { SaidDate } from "@/components/list-cells";
import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
} from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { SummaryFigures } from "@/components/page-kit";
import { StateBadge } from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

type HisAgreement = TheirAgreements["agreements"][number];

/** The three figures their whole part is read by, the same sums the Owner's page of them shows. */
const useFigures = (theirs: TheirAgreements): Figure[] => {
  const { t } = useLanguage();
  const taka = useTaka();
  const sums = portfolioOf(theirs);
  return [
    {
      label: t("portal.heldNow"),
      value: taka(sums.heldBdt),
      hint: sums.heldOn
        ? t("investors.page.onPapers", { count: sums.heldOn })
        : undefined,
      icon: Banknote,
    },
    {
      label: t("portal.paidOut"),
      value: taka(sums.paidOutBdt),
      icon: Wallet,
    },
    {
      label: t("portal.profit"),
      value: taka(sums.profitBdt),
      hint: sums.settled
        ? t("investors.page.fromSettled", { count: sums.settled })
        : t("investors.page.noneSettled"),
      icon: TrendingUp,
      tone: sums.profitBdt < 0 ? "warning" : "neutral",
    },
  ];
};

/** One Venture they are in: its name and where it stands, their Units and capital, and the terms in force. */
const VentureCard = ({ one }: { one: HisAgreement }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <li>
      <Link
        className="surface hover:border-primary/40 focus-visible:ring-ring flex items-center gap-4 p-4 outline-none focus-visible:ring-2 md:p-5"
        params={{ agreementId: one.id }}
        to="/portal/ventures/$agreementId"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{one.venture.name}</span>
            <StateBadge state={one.venture.state} />
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
                {taka(one.capitalHeldBdt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs">{t("portal.split")}</dt>
              <dd className="text-foreground font-medium tabular-nums">
                {t("portal.splitLine", {
                  investors: one.investorsPercent,
                  farm: one.farmPercent,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs">{t("portal.window")}</dt>
              <dd className="text-foreground font-medium">
                <SaidDate at={one.targetWindow.start} />
              </dd>
            </div>
          </dl>
        </div>
        <ChevronRight aria-hidden className="text-muted-foreground size-5" />
      </Link>
    </li>
  );
};

/** Their whole part, once it is read: what it comes to, each Venture, and every taka of theirs that moved. */
const Portfolio = ({ theirs }: { theirs: TheirAgreements }) => {
  const { t } = useLanguage();
  const figures = useFigures(theirs);
  if (theirs.agreements.length === 0) {
    return <EmptyState icon={Handshake} title={t("portal.noVentures")} />;
  }
  return (
    <>
      <SummaryFigures figures={figures} />
      <Section title={t("portal.yourVentures")}>
        <ul className="flex flex-col gap-3">
          {theirs.agreements.map((one) => (
            <VentureCard key={one.id} one={one} />
          ))}
        </ul>
      </Section>
      <InvestorMoney
        agreements={theirs.agreements}
        inThePortal
        movements={theirs.movements}
      />
    </>
  );
};

/** An Investor's home in the portal: what their money comes to, the Ventures it is in, and where it has moved. */
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
        skeleton={<Skeleton className="h-40 rounded-xl" />}
      >
        {theirs.data ? <Portfolio theirs={theirs.data} /> : null}
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute("/portal/_in/")({
  component: PortalHome,
});
