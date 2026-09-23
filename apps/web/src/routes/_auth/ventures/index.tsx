import { hasEnded } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  Banknote,
  CircleAlert,
  Handshake,
  Scale,
  Wallet,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
} from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import { InternalSaleSheet } from "@/components/ventures/internal-sale-sheet";
import { OpenVentureSheet } from "@/components/ventures/open-venture-sheet";
import { useVentureActs } from "@/components/ventures/use-venture-acts";
import type { VentureActs } from "@/components/ventures/venture-card";
import { VenturesTable } from "@/components/ventures/ventures-table";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { lastMonth } from "@/lib/months";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import { venturesNeedingHer } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

const TABS = ["running", "settled", "cancelled"] as const;
type Tab = (typeof TABS)[number];

/**
 * Which tab a Venture belongs on: the runs still on, the ones whose books are shut, and the ones that
 * never started.
 *
 * Deliberately not the domain's `isRunning`, which is about a Venture that is spending — this tab
 * counts an Open one too, because a Venture taking capital is very much the Owner's business. The two
 * differ by exactly that state, and each says so, which is the part that used to be left unsaid.
 */
const tabOf = (venture: Venture): Tab =>
  hasEnded(venture.state) ? venture.state : "running";

/**
 * The four figures the Ventures are read by: how many runs are on, what their Investors have put in, what
 * their accounts should be holding, and how many of them want the Owner today.
 *
 * All four are of the runs on the Running tab alone. A settled Venture's capital was paid back out
 * months ago, and adding it to what the farm is holding would say the accounts hold money that has gone.
 */
const useVentureFigures = (ventures: Venture[] | undefined): Figure[] => {
  const { t, language } = useLanguage();
  // Everything the Running tab holds, Open runs included: a tile that counts four while the tab under it
  // draws five is a page arguing with itself, and an Open Venture's capital is in the account already.
  const running = (ventures ?? []).filter((one) => tabOf(one) === "running");
  const held = running.reduce((sum, one) => sum + one.capitalInBdt, 0);
  const balance = running.reduce((sum, one) => sum + (one.balanceBdt ?? 0), 0);
  const needHer = venturesNeedingHer(ventures).length;
  const loading = <Skeleton className="h-8 w-24" />;
  const taka = useTaka();
  return [
    {
      label: t("ventures.figure.running"),
      value: ventures ? formatNumber(running.length, language) : loading,
      icon: Handshake,
    },
    {
      label: t("ventures.figure.held"),
      value: ventures ? taka(held) : loading,
      icon: Banknote,
    },
    {
      label: t("ventures.figure.balance"),
      value: ventures ? taka(balance) : loading,
      icon: Wallet,
    },
    {
      label: t("ventures.figure.needsYou"),
      value: ventures ? formatNumber(needHer, language) : loading,
      icon: CircleAlert,
      tone: needHer > 0 ? "warning" : "neutral",
    },
  ];
};

/** The Ventures on one tab, as a table where there is room and as cards on a phone. */
const VentureList = ({
  ventures,
  acts,
  emptyWord,
}: {
  ventures: Venture[];
  acts: VentureActs;
  emptyWord: MessageKey;
}) => {
  const { t } = useLanguage();
  if (ventures.length === 0) {
    return <EmptyState bare icon={Handshake} title={t(emptyWord)} />;
  }
  return (
    <Section>
      <VenturesTable
        acts={acts}
        lastMonthOver={lastMonth()}
        ventures={ventures}
      />
    </Section>
  );
};

/**
 * The Ventures the farm is running: what each is after, what it holds, and when it means to sell. The
 * Owner's alone — a Venture is money between her and the people who trusted her with it.
 *
 * Tabbed by where a run stands, because a farm that has run Ventures for a few seasons has more settled
 * ones than live ones, and the live ones are what she came for. The tab is kept in the address, so the
 * page comes back as it was left.
 */
const VenturesPage = () => {
  const { t } = useLanguage();
  const [opening, setOpening] = useState(false);
  const [sellingInternally, setSellingInternally] = useState(false);
  const { tab = "running" } = Route.useSearch();
  const navigate = useNavigate();
  const ventures = useQuery(orpc.ventures.list.queryOptions());
  const all = ventures.data ?? [];
  const on = (which: Tab) => all.filter((one) => tabOf(one) === which);
  const figures = useVentureFigures(ventures.data);
  const { acts, sheets } = useVentureActs();
  return (
    <Page>
      <PageHeader
        actions={
          <>
            <Button
              onClick={() => setSellingInternally(true)}
              type="button"
              variant="outline"
            >
              <ArrowRightLeft aria-hidden data-icon="inline-start" />
              {t("ventures.sellInternally")}
            </Button>
            <Button onClick={() => setOpening(true)} type="button">
              <Handshake aria-hidden data-icon="inline-start" />
              {t("ventures.open")}
            </Button>
          </>
        }
        description={t("ventures.subtitle")}
        title={t("ventures.title")}
      />
      <SummaryFigures figures={figures} />
      <Loaded
        query={ventures}
        skeleton={<Skeleton className="h-40 rounded-xl" />}
      >
        {all.length === 0 ? (
          <EmptyState icon={Handshake} title={t("ventures.none")} />
        ) : (
          <PageTabs
            onChange={(value) =>
              navigate({
                replace: true,
                search: value === "running" ? {} : { tab: value },
                to: "/ventures",
              })
            }
            tabs={[
              {
                value: "running",
                label: t("ventures.tab.running"),
                icon: Handshake,
                content: (
                  <VentureList
                    acts={acts}
                    emptyWord="ventures.noneRunning"
                    ventures={on("running")}
                  />
                ),
              },
              {
                value: "settled",
                label: t("ventures.state.settled"),
                icon: Scale,
                content: (
                  <VentureList
                    acts={acts}
                    emptyWord="ventures.noneSettled"
                    ventures={on("settled")}
                  />
                ),
              },
              {
                value: "cancelled",
                label: t("ventures.state.cancelled"),
                icon: XCircle,
                content: (
                  <VentureList
                    acts={acts}
                    emptyWord="ventures.noneCalledOff"
                    ventures={on("cancelled")}
                  />
                ),
              },
            ]}
            value={tab}
          />
        )}
      </Loaded>
      <OpenVentureSheet onOpenChange={setOpening} open={opening} />
      <InternalSaleSheet
        onOpenChange={setSellingInternally}
        open={sellingInternally}
      />
      {sheets}
    </Page>
  );
};

/** What the address may say about this page: which tab she is reading — and, from an older notice, whose papers
 *  she came for, which now live in that Venture's Investors tab. */
interface VenturesSearch {
  tab?: Tab;
  statements?: string;
}

export const Route = createFileRoute("/_auth/ventures/")({
  /** The Owner's alone: nobody else is shown a screen that would only refuse them. */
  beforeLoad: ({ context, search }) => {
    onlyFor("owner")({ context });
    // A notice raised before each Investor's papers moved into his row still sends her here with the Venture in
    // the address: she is taken to where they are now.
    if (search.statements) {
      throw redirect({
        params: { ventureId: search.statements },
        search: { tab: "investors" },
        to: "/ventures/$ventureId",
      });
    }
  },
  component: VenturesPage,
  validateSearch: (search: Record<string, unknown>): VenturesSearch => {
    const said: VenturesSearch = {};
    if (TABS.includes(search.tab as Tab) && search.tab !== "running") {
      said.tab = search.tab as Tab;
    }
    if (typeof search.statements === "string" && search.statements !== "") {
      said.statements = search.statements;
    }
    return said;
  },
});
