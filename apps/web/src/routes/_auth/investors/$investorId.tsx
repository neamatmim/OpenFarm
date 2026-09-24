import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
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
} from "@/components/investors/investor-agreements";
import {
  InvestorActs,
  InvestorProfile,
  phoneLink,
} from "@/components/investors/investor-profile";
import { InvestorSheet } from "@/components/investors/investor-sheet";
import type { Investor } from "@/components/investors/investor-types";
import {
  PortalStandingBadge,
  standingOf,
} from "@/components/investors/portal-access";
import {
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
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

const TABS = ["overview", "agreements", "money"] as const;
type Tab = (typeof TABS)[number];

/**
 * The four figures one Investor is read by: the capital the Farm holds of theirs now, the Units they hold in the
 * Ventures still running, what the Farm has paid them, and what their share of the profit has come to. Money still
 * in a Venture and money already home are counted apart, so neither passes for the other.
 */
const useFiguresOf = (
  investor: Investor,
  theirs: TheirAgreements | undefined
): Figure[] => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const loading = <Skeleton className="h-8 w-24" />;
  const agreements = theirs?.agreements ?? [];
  // Held until the Settlement's payout goes: a paper paid out has handed its capital back.
  const holding = agreements.filter((one) => !one.settlement?.paidOn);
  const heldBdt = holding.reduce((sum, one) => sum + one.capitalHeldBdt, 0);
  const paidBdt = (theirs?.movements ?? [])
    .filter((one) => one.kind === "payout")
    .reduce((sum, one) => sum + one.amountBdt, 0);
  const settled = agreements.filter((one) => one.settlement !== null);
  const heldOn = holding.filter((one) => one.capitalHeldBdt > 0).length;
  const profitBdt = settled.reduce(
    (sum, one) => sum + (one.settlement?.shareBdt ?? 0),
    0
  );
  return [
    {
      label: t("investors.page.heldNow"),
      value: theirs ? taka(heldBdt) : loading,
      hint:
        heldOn > 0
          ? t("investors.page.onPapers", { count: heldOn })
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
      label: t("investors.page.paidOut"),
      value: theirs ? taka(paidBdt) : loading,
      icon: Wallet,
    },
    {
      label: t("investors.page.profit"),
      value: theirs ? taka(profitBdt) : loading,
      hint:
        settled.length > 0
          ? t("investors.page.fromSettled", { count: settled.length })
          : t("investors.page.noneSettled"),
      icon: TrendingUp,
      tone: profitBdt < 0 ? "warning" : "neutral",
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
      <Link
        className="text-muted-foreground hover:text-foreground -mb-2 flex w-fit items-center gap-1 text-sm"
        to="/investors"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("investors.page.back")}
      </Link>
      <PageHeader
        actions={<InvestorActs onEdit={() => setEditing(true)} />}
        description={investor.address ?? undefined}
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
            replace: true,
            search: value === "overview" ? {} : { tab: value },
            to: "/investors/$investorId",
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
              <Loaded
                query={theirs}
                skeleton={<Skeleton className="h-40 rounded-xl" />}
              >
                <InvestorAgreements agreements={signed} investor={investor} />
              </Loaded>
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
  const { tab = "overview" } = Route.useSearch();
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
        <EmptyState icon={Users} title={t("investors.page.notFound")} />
        <Link className="text-primary w-fit text-sm underline" to="/investors">
          {t("investors.page.back")}
        </Link>
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

/** What the address may say about this page: which tab she is reading. */
interface InvestorSearch {
  tab?: Tab;
}

export const Route = createFileRoute("/_auth/investors/$investorId")({
  /** The Owner's alone, as the list of Investors is. */
  beforeLoad: onlyFor("owner"),
  component: InvestorPage,
  validateSearch: (search: Record<string, unknown>): InvestorSearch =>
    TABS.includes(search.tab as Tab) && search.tab !== "overview"
      ? { tab: search.tab as Tab }
      : {},
});
