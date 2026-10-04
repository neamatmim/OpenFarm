import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { buttonVariants } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Banknote,
  Handshake,
  IdCard,
  LayoutDashboard,
  Phone,
  ScrollText,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import type { TheirAgreements } from "@/components/investors/investor-agreements";
import {
  InvestorAgreements,
  InvestorMoney,
  portfolioOf,
} from "@/components/investors/investor-agreements";
import {
  InvestorActs,
  InvestorProfile,
} from "@/components/investors/investor-profile";
import { InvestorRequests } from "@/components/investors/investor-requests";
import { InvestorSheet } from "@/components/investors/investor-sheet";
import type { Investor } from "@/components/investors/investor-types";
import { phoneLink } from "@/components/investors/phone-link";
import {
  PortalStandingBadge,
  standingOf,
} from "@/components/investors/portal-access";
import {
  BackLink,
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  StatusBadge,
} from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { initialsOf } from "@/lib/initials";
import { useMoney } from "@/lib/money";
import { TAB_SWITCH, useTabOfPath } from "@/lib/path-tabs";
import { orpc } from "@/utils/orpc";

const TABS = ["overview", "agreements", "money"] as const;
type Tab = (typeof TABS)[number];

/** Each tab at its own address, the first at the Investor's own. */
const TAB_PATHS = {
  overview: "/investors/$investorId",
  agreements: "/investors/$investorId/agreements",
  money: "/investors/$investorId/money",
} as const satisfies Record<Tab, string>;

/**
 * The four figures one Investor is read by: the capital the Farm holds of theirs now, the Units they hold in the
 * Ventures still running, their Settlement payouts — with any capital refunded from a cancelled Venture said apart,
 * as their own portal says it — and what their share of the profit has come to. Money still in a Venture and money
 * already home are counted apart, so neither passes for the other.
 */
const useFiguresOf = (
  investor: Investor,
  theirs: TheirAgreements | undefined
): Figure[] => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const loading = <Skeleton className="h-8 w-24" />;
  const sums = theirs ? portfolioOf(theirs) : null;
  return [
    {
      label: t("investors.page.heldNow"),
      value: sums ? asMoney(sums.heldMoney) : loading,
      hint: sums?.heldOn
        ? t("investors.page.onPapers", { count: sums.heldOn })
        : undefined,
      icon: Banknote,
    },
    {
      label: t("investors.unitsHeld"),
      value: formatNumber(investor.unitsHeld, language),
      hint: t("investors.page.inRunning"),
      icon: IdCard,
    },
    {
      label: t("money.payouts"),
      value: sums ? asMoney(sums.paidOutMoney) : loading,
      // Capital refunded is not a payout: said beside it, as the portal's money page counts it apart.
      hint: sums?.returnedMoney
        ? t("money.refundedApart", { amount: asMoney(sums.returnedMoney) })
        : undefined,
      icon: Wallet,
    },
    {
      label: t("investors.page.profit"),
      value: sums ? asMoney(sums.profitMoney) : loading,
      hint: sums?.settled
        ? t("investors.page.fromSettled", { count: sums.settled })
        : t("investors.page.noneSettled"),
      icon: TrendingUp,
      tone: (sums?.profitMoney ?? 0) < 0 ? "warning" : "neutral",
    },
  ];
};

/** One Investor, read whole: who they are, what they signed, and every taka of theirs that moved. */
const TheInvestor = ({
  investor,
  portalOpen,
  tab,
}: {
  investor: Investor;
  portalOpen: boolean;
  tab: Tab;
}) => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const theirs = useQuery(
    orpc.investors.agreements.queryOptions({ input: { id: investor.id } })
  );
  const figures = useFiguresOf(investor, theirs.data);
  const signed = theirs.data?.agreements ?? [];
  return (
    <Page>
      <BackLink to="/investors">{t("nav.investors")}</BackLink>
      <PageHeader
        actions={
          <InvestorActs investor={investor} onEdit={() => setEditing(true)} />
        }
        description={investor.address ?? undefined}
        leading={
          <span
            aria-hidden
            className="bg-primary/10 text-primary hidden size-14 shrink-0 place-items-center rounded-full text-lg font-semibold sm:grid"
          >
            {initialsOf(investor.name)}
          </span>
        }
        meta={
          <>
            {investor.retiredAt ? (
              <StatusBadge tone="neutral">
                {t("investors.retiredOn", {
                  day: formatDate(new Date(investor.retiredAt), language),
                })}
              </StatusBadge>
            ) : null}
            {standingOf(investor) === "none" ? null : (
              <PortalStandingBadge investor={investor} />
            )}
            <span className="inline-flex items-center gap-1">
              <Phone aria-hidden className="size-4" />
              {phoneLink(investor.phone)}
            </span>
          </>
        }
        title={investor.name}
      />
      <SummaryFigures figures={figures} />
      <PageTabs
        onChange={(value) =>
          navigate({
            params: { investorId: investor.id },
            ...TAB_SWITCH,
            to: TAB_PATHS[value],
          })
        }
        tabs={[
          {
            value: "overview",
            label: t("investors.page.tab.overview"),
            icon: LayoutDashboard,
            content: (
              <InvestorProfile investor={investor} portalOpen={portalOpen} />
            ),
          },
          {
            value: "agreements",
            label: t("investors.page.tab.agreements"),
            icon: Handshake,
            content: (
              <div className="flex flex-col gap-4">
                <Loaded
                  query={theirs}
                  skeleton={<Skeleton className="h-40 rounded-xl" />}
                >
                  <InvestorAgreements agreements={signed} investor={investor} />
                </Loaded>
                {/* Read on its own: somebody may have asked on Ventures they have not signed for. */}
                <InvestorRequests investorId={investor.id} />
              </div>
            ),
          },
          {
            value: "money",
            label: t("investors.page.tab.money"),
            icon: ScrollText,
            content: (
              <Loaded
                query={theirs}
                skeleton={<Skeleton className="h-40 rounded-xl" />}
              >
                <InvestorMoney
                  agreements={signed}
                  movements={theirs.data?.movements ?? []}
                />
              </Loaded>
            ),
          },
        ]}
        value={tab}
      />
      <InvestorSheet
        investor={editing ? investor : null}
        onOpenChange={setEditing}
        open={editing}
      />
    </Page>
  );
};

/**
 * One Investor's own page — the one the list's name leads to, where there is room to read them whole rather than in
 * a sheet over the list. Read off the same list the Investors page is, so the two cannot disagree about who they
 * are; an address naming somebody the list does not hold opens nothing but a way back.
 */
const InvestorPage = () => {
  const { t } = useLanguage();
  const { investorId } = Route.useParams();
  const tab = useTabOfPath(TAB_PATHS, { investorId }) ?? "overview";
  const investors = useQuery(orpc.investors.list.queryOptions());
  if (investors.isPending) {
    return (
      <Page>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </Page>
    );
  }
  const investor = (investors.data?.people ?? []).find(
    (one) => one.id === investorId
  );
  if (!investor) {
    return (
      <Page>
        <EmptyState
          action={
            <Link
              className={buttonVariants({ variant: "outline" })}
              to="/investors"
            >
              {t("investors.page.back")}
            </Link>
          }
          icon={Users}
          title={t("investors.page.notFound")}
        />
      </Page>
    );
  }
  return (
    <TheInvestor
      investor={investor}
      portalOpen={investors.data?.portalOpen ?? false}
      tab={tab}
    />
  );
};

export const Route = createFileRoute("/_authenticated/investors/$investorId")({
  /** The Owner's alone, as the list of Investors is. */
  beforeLoad: onlyFor("owner"),
  component: InvestorPage,
});
