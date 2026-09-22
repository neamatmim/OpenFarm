import { hasEnded } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { toast } from "sonner";

import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
} from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import { AdvanceSheet } from "@/components/ventures/advance-sheet";
import { AmendSheet } from "@/components/ventures/amend-sheet";
import { BankCheckSheet } from "@/components/ventures/bank-check-sheet";
import { BuyWhatIsLeftSheet } from "@/components/ventures/buy-what-is-left-sheet";
import { CallOffSheet } from "@/components/ventures/call-off-sheet";
import { CountFloatSheet } from "@/components/ventures/count-float-sheet";
import { DrawFloatSheet } from "@/components/ventures/draw-float-sheet";
import { EconomicsSheet } from "@/components/ventures/economics-sheet";
import { InternalSaleSheet } from "@/components/ventures/internal-sale-sheet";
import { MovementsSheet } from "@/components/ventures/movements-sheet";
import { OpenVentureSheet } from "@/components/ventures/open-venture-sheet";
import { ReimburseSheet } from "@/components/ventures/reimburse-sheet";
import { SettlementSheet } from "@/components/ventures/settlement-sheet";
import { SignAgreementSheet } from "@/components/ventures/sign-agreement-sheet";
import { StatementsSheet } from "@/components/ventures/statements-sheet";
import { TakeCapitalSheet } from "@/components/ventures/take-capital-sheet";
import type { VentureActs } from "@/components/ventures/venture-card";
import { VentureDetailsSheet } from "@/components/ventures/venture-details-sheet";
import { VenturesTable } from "@/components/ventures/ventures-table";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { lastMonth } from "@/lib/months";
import { sayWhy } from "@/lib/saying";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import { venturesNeedingHer } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

const TABS = ["running", "settled", "cancelled"] as const;
type Tab = (typeof TABS)[number];

/**
 * The acts that open a sheet about one Venture — which is every act but the two that are a single
 * mutation each, said and done with no form to fill.
 *
 * Taken from `VentureActs` rather than listed again, so a new act is a compiler error here until it is
 * either given a sheet or named as one of the two that needs none.
 */
type ActOnOneVenture = Exclude<
  keyof VentureActs,
  "startBuying" | "startFattening"
>;

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
  /**
   * Which sheet is over the list, and the Venture it was opened on.
   *
   * One slot, because one sheet is open at a time. Fifteen separate slots could each hold a Venture at
   * once, and the page has no meaning for two — nor for a sheet holding last week's Venture behind the
   * one on show, which is what a slot nobody cleared amounted to.
   */
  const [staged, setStaged] = useState<{
    act: ActOnOneVenture;
    venture: Venture;
  } | null>(null);
  const ventures = useQuery(orpc.ventures.list.queryOptions());
  const queryClient = useQueryClient();
  /**
   * Moving a Venture along. Two acts with no form to fill: she says buying has started, and later that
   * it is over. Until now neither had a button at all and a Venture opened on a screen could never
   * leave Open — so nothing downstream of it could happen either.
   */
  const moved = (said: MessageKey) => ({
    onError: (error: unknown) => toast.error(sayWhy(error, t)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.ventures.key() });
      toast.success(t(said));
    },
  });
  const moving = useMutation(
    orpc.ventures.startBuying.mutationOptions(moved("ventures.buyingStarted"))
  );
  const fattening = useMutation(
    orpc.ventures.startFattening.mutationOptions(
      moved("ventures.fatteningStarted")
    )
  );
  const opens = (act: ActOnOneVenture) => (venture: Venture) =>
    setStaged({ act, venture });
  const acts: VentureActs = {
    details: opens("details"),
    sign: opens("sign"),
    takeCapital: opens("takeCapital"),
    callOff: opens("callOff"),
    drawFloat: opens("drawFloat"),
    countFloat: opens("countFloat"),
    reimburse: opens("reimburse"),
    buyWhatIsLeft: opens("buyWhatIsLeft"),
    settle: opens("settle"),
    advance: opens("advance"),
    checkTheBank: opens("checkTheBank"),
    seeMovements: opens("seeMovements"),
    statements: opens("statements"),
    economics: opens("economics"),
    amend: opens("amend"),
    startBuying: (one) => moving.mutate({ id: one.id }),
    startFattening: (one) => fattening.mutate({ id: one.id }),
  };
  /** The Venture a sheet is showing, which is a Venture only while that sheet is the one on show. */
  const stagedOn = (act: ActOnOneVenture): Venture | null =>
    staged?.act === act ? staged.venture : null;
  /** Closing is the sheets' only say over what is staged; opening is the cards'. */
  const closes = (wanted: boolean) => {
    if (!wanted) {
      setStaged(null);
    }
  };
  /** Everything a sheet about one Venture is given. */
  const staging = (act: ActOnOneVenture) => ({
    onOpenChange: closes,
    open: staged?.act === act,
    venture: stagedOn(act),
  });
  const { tab = "running", statements } = Route.useSearch();
  const navigate = useNavigate();
  const all = ventures.data ?? [];
  const on = (which: Tab) => all.filter((one) => tabOf(one) === which);
  const figures = useVentureFigures(ventures.data);
  // The notice that her Investors are due a paper names the Venture and sends her here with it in the
  // address, so she lands on the buttons rather than going looking. Read off the list rather than kept
  // in state: the list is what arrives, and a Venture whose id the address names but the list does not
  // hold — a stale link, another farm's — opens nothing.
  const asked = statements
    ? (all.find((one) => one.id === statements) ?? null)
    : null;
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
      <VentureDetailsSheet
        lastMonthOver={lastMonth()}
        onOpenChange={closes}
        venture={stagedOn("details")}
      />
      <OpenVentureSheet onOpenChange={setOpening} open={opening} />
      <InternalSaleSheet
        onOpenChange={setSellingInternally}
        open={sellingInternally}
      />
      <TakeCapitalSheet {...staging("takeCapital")} />
      <MovementsSheet {...staging("seeMovements")} />
      <BankCheckSheet {...staging("checkTheBank")} />
      <AdvanceSheet {...staging("advance")} />
      <ReimburseSheet {...staging("reimburse")} />
      <SettlementSheet {...staging("settle")} />
      <BuyWhatIsLeftSheet {...staging("buyWhatIsLeft")} />
      <CountFloatSheet {...staging("countFloat")} />
      <DrawFloatSheet {...staging("drawFloat")} />
      <CallOffSheet {...staging("callOff")} />
      <AmendSheet {...staging("amend")} />
      <EconomicsSheet {...staging("economics")} />
      <StatementsSheet
        onOpenChange={(next) => {
          if (next) {
            return;
          }
          setStaged(null);
          // The address said whose papers she came for; once the sheet is closed it has been answered —
          // and the tab she was reading is kept, because closing a sheet is not leaving the page.
          if (statements !== undefined) {
            navigate({
              replace: true,
              search: tab === "running" ? {} : { tab },
              to: "/ventures",
            });
          }
        }}
        // The one sheet with two ways in: her own button, and a notice that named the Venture in the
        // address. Whichever brought her, the sheet is the same one.
        open={staged?.act === "statements" || asked !== null}
        venture={stagedOn("statements") ?? asked}
      />
      <SignAgreementSheet {...staging("sign")} />
    </Page>
  );
};

/** What the address may say about this page: which tab she is reading, and whose papers she came for. */
interface VenturesSearch {
  tab?: Tab;
  statements?: string;
}

export const Route = createFileRoute("/_auth/ventures")({
  /** The Owner's alone: nobody else is shown a screen that would only refuse them. */
  beforeLoad: onlyFor("owner"),
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
