import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRightLeft,
  Banknote,
  Beef,
  CalendarClock,
  Handshake,
  LayoutDashboard,
  PiggyBank,
  ScrollText,
  Target,
  Users,
  Wallet,
  Wheat,
} from "lucide-react";
import { useState } from "react";

import { EmptyState, Page, PageHeader } from "@/components/page";
import type { Figure, RowAction } from "@/components/page-kit";
import { PageTabs, RowMenu, SummaryFigures } from "@/components/page-kit";
import { InternalSaleSheet } from "@/components/ventures/internal-sale-sheet";
import { StageTrack } from "@/components/ventures/stage-track";
import { useVentureActs } from "@/components/ventures/use-venture-acts";
import { VentureAnimals } from "@/components/ventures/venture-animals";
import {
  CardBadges,
  PrimaryActs,
  WhatStopsHer,
  actsInTheMenu,
  moneyOf,
} from "@/components/ventures/venture-card";
import { VentureInvestors } from "@/components/ventures/venture-investors";
import { VentureMoney } from "@/components/ventures/venture-money";
import { VentureOverview } from "@/components/ventures/venture-overview";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { lastMonth } from "@/lib/months";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import { shortOfFloor } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

const TABS = ["overview", "investors", "animals", "money"] as const;
type Tab = (typeof TABS)[number];

/**
 * The four figures one Venture is read by, chosen by where it stands.
 *
 * Open, it is read against the money it is waiting on: what has come in, how far it still is from its Floor,
 * who has signed, and the day it has to be decided by. Running, against what it holds and what is left of each
 * budget, and how many animals it is keeping. Over, against what came in and what went back out.
 */
const useFiguresOf = (venture: Venture): Figure[] => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const money = moneyOf(venture);
  if (venture.state === "open") {
    const short = shortOfFloor(venture);
    return [
      {
        label: t("ventures.held"),
        value: taka(venture.capitalInBdt),
        hint: t("ventures.page.ofTarget", {
          target: taka(venture.targetCapitalBdt),
        }),
        icon: Banknote,
      },
      {
        label: t("ventures.page.toTheFloor"),
        value: short > 0 ? taka(short) : t("ventures.page.floorMet"),
        hint: t("ventures.ofTheFloor", { floor: taka(venture.floorBdt) }),
        icon: Target,
        tone: short > 0 ? "warning" : "success",
      },
      {
        label: t("ventures.signedFor"),
        value: t("ventures.page.unitsOf", {
          taken: formatNumber(money.signedFor.units, language),
          units: formatNumber(venture.units, language),
        }),
        hint: t("ventures.page.people", {
          people: formatNumber(money.signedFor.people, language),
        }),
        icon: Users,
      },
      {
        label: t("ventures.decideBy"),
        value: formatDate(startOfFarmDay(venture.decideBy), language, "date"),
        icon: CalendarClock,
      },
    ];
  }
  if (venture.state === "settled" || venture.state === "cancelled") {
    return [
      {
        label: t("ventures.held"),
        value: taka(venture.capitalInBdt),
        icon: Banknote,
      },
      {
        label: t("ventures.page.paidOut"),
        value: taka(money.paidOutBdt),
        icon: Handshake,
      },
      {
        label: t("ventures.balance"),
        value: taka(money.balanceBdt),
        icon: Wallet,
      },
    ];
  }
  return [
    {
      label: t("ventures.balance"),
      value: taka(money.balanceBdt),
      icon: Wallet,
    },
    {
      label: t("ventures.page.cattleLeft"),
      value: taka(money.cattleBudgetHeldBdt),
      icon: PiggyBank,
    },
    {
      label: t("ventures.page.runningLeft"),
      value: taka(money.runningBudgetHeldBdt),
      icon: Wheat,
      tone: venture.runningBudgetLow ? "warning" : "neutral",
    },
    {
      label: t("ventures.page.animalsStanding"),
      value: formatNumber(venture.animalsStanding ?? 0, language),
      icon: Beef,
    },
  ];
};

/** One Venture, read whole: where it is on its road, what stands in its way, and its money, people and animals. */
const TheVenture = ({ venture, tab }: { venture: Venture; tab: Tab }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { acts, sheets } = useVentureActs();
  const figures = useFiguresOf(venture);
  const [movingIn, setMovingIn] = useState(false);
  // A run buying or fattening may take a bull on from the Farm or another run: offered here with this one chosen.
  const takesAnimals =
    venture.state === "buying" || venture.state === "fattening";
  const menu: RowAction[] = [
    ...actsInTheMenu(venture, acts, t),
    ...(takesAnimals
      ? [
          {
            label: t("ventures.sellInternally"),
            icon: ArrowRightLeft,
            handleSelect: () => setMovingIn(true),
          },
        ]
      : []),
  ];
  return (
    <Page>
      <Link
        className="text-muted-foreground hover:text-foreground -mb-2 flex w-fit items-center gap-1 text-sm"
        to="/ventures"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("ventures.page.back")}
      </Link>
      <PageHeader
        actions={
          <>
            <PrimaryActs acts={acts} venture={venture} />
            <RowMenu
              actions={menu}
              label={t("ventures.moreFor", { venture: venture.name })}
            />
          </>
        }
        meta={<CardBadges lastMonthOver={lastMonth()} venture={venture} />}
        title={venture.name}
      />
      <div className="flex flex-col gap-2">
        <StageTrack state={venture.state} />
        <div className="[&_p]:text-left">
          <WhatStopsHer venture={venture} />
        </div>
      </div>
      <SummaryFigures figures={figures} />
      <PageTabs
        onChange={(value) =>
          navigate({
            params: { ventureId: venture.id },
            replace: true,
            search: value === "overview" ? {} : { tab: value },
            to: "/ventures/$ventureId",
          })
        }
        tabs={[
          {
            value: "overview",
            label: t("ventures.page.tab.overview"),
            icon: LayoutDashboard,
            content: <VentureOverview venture={venture} />,
          },
          {
            value: "investors",
            label: t("ventures.page.tab.investors"),
            icon: Users,
            content: <VentureInvestors acts={acts} venture={venture} />,
          },
          {
            value: "animals",
            label: t("ventures.page.tab.animals"),
            icon: Beef,
            content: <VentureAnimals venture={venture} />,
          },
          {
            value: "money",
            label: t("ventures.movements"),
            icon: ScrollText,
            content: <VentureMoney venture={venture} />,
          },
        ]}
        value={tab}
      />
      {sheets}
      <InternalSaleSheet
        key={venture.id}
        onOpenChange={setMovingIn}
        open={movingIn}
        startWith={{ toVentureId: venture.id }}
      />
    </Page>
  );
};

/**
 * One Venture's own page — the one the list's name and the Owner's own page lead to, where there is room to
 * read it whole rather than in a sheet over the list. Read off the same list the Ventures page is, so the two
 * cannot disagree about it; an address naming a Venture the list does not hold opens nothing but a way back.
 */
const VenturePage = () => {
  const { t } = useLanguage();
  const { ventureId } = Route.useParams();
  const { tab = "overview" } = Route.useSearch();
  const ventures = useQuery(orpc.ventures.list.queryOptions());
  if (ventures.isPending) {
    return (
      <Page>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </Page>
    );
  }
  const venture = (ventures.data ?? []).find((one) => one.id === ventureId);
  if (!venture) {
    return (
      <Page>
        <EmptyState icon={Handshake} title={t("ventures.page.notFound")} />
        <Link className="text-primary w-fit text-sm underline" to="/ventures">
          {t("ventures.page.back")}
        </Link>
      </Page>
    );
  }
  return <TheVenture tab={tab} venture={venture} />;
};

/** What the address may say about this page: which tab she is reading. */
interface VentureSearch {
  tab?: Tab;
}

export const Route = createFileRoute("/_auth/ventures/$ventureId")({
  /** The Owner's alone, as every Venture is. */
  beforeLoad: onlyFor("owner"),
  component: VenturePage,
  validateSearch: (search: Record<string, unknown>): VentureSearch =>
    TABS.includes(search.tab as Tab) && search.tab !== "overview"
      ? { tab: search.tab as Tab }
      : {},
});
