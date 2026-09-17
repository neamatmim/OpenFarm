import { farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CircleCheck,
  Hourglass,
  Milk,
  Scale,
  Tractor,
  Wallet,
} from "lucide-react";

import {
  FatteningPanel,
  FeedPanel,
  HerdPanel,
  MoneyMonth,
  OpenWords,
  thisMonth,
  useTaka,
} from "@/components/home/farm-panels";
import { MilkWeek } from "@/components/home/milk-week";
import {
  FarmToday,
  OwnerDecisions,
  decisionsWaiting,
  moneyAwaitingTotal,
} from "@/components/home/owner-queue";
import { MORE_LINK } from "@/components/home/queue";
import {
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage, useT } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

type OwnerAnswer = Awaited<ReturnType<typeof orpc.home.owner.call>>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A figure still waiting for its list. */
const loading = <Skeleton className="h-8 w-28" />;

/** The milk figure: today's tank, read against yesterday — a whole day, where today may be half of one — and the
 *  week's average. */
const useMilkFigure = (tiles: OwnerAnswer["tiles"]): Figure => {
  const { t, language } = useLanguage();
  const now = new Date();
  const yesterday = farmDayOf(new Date(now.getTime() - DAY_MS));
  const yesterdays = tiles.days.find((one) => one.day === yesterday);
  const average = formatNumber(tiles.averageBulk, language, {
    maximumFractionDigits: 1,
  });
  return {
    label: t("owner.bulkToday"),
    value: t("owner.litres", {
      litres: formatNumber(tiles.bulkToday, language),
    }),
    hint: yesterdays
      ? t("owner.milkHint", {
          yesterday: formatNumber(yesterdays.litres, language),
          average,
        })
      : t("owner.average", { litres: average }),
    icon: Milk,
  };
};

/** The four figures the Owner judges the farm by: the milk, the month's money, the herd, and the money waiting on
 *  their word. Each is worked out from what was recorded; the two from other lists wait for them without holding up
 *  the rest. */
const useFarmFigures = (data: OwnerAnswer): Figure[] => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const milk = useMilkFigure(data.tiles);
  const money = useQuery(orpc.money.list.queryOptions({ input: thisMonth() }));
  const animals = useQuery(
    orpc.animals.list.queryOptions({ input: { includeExited: false } })
  );
  const rows = money.data?.events ?? [];
  const sum = (direction: "in" | "out") =>
    rows
      .filter((row) => row.direction === direction)
      .reduce((total, row) => total + row.amountBdt, 0);
  const net = sum("in") - sum("out");
  const herd = animals.data ?? [];
  const awaiting = data.needsYou.moneyAwaiting.length;
  return [
    milk,
    {
      label: t("owner.monthNet"),
      value: money.data ? taka(net) : loading,
      hint: money.data
        ? t("owner.inAndOut", { in: taka(sum("in")), out: taka(sum("out")) })
        : undefined,
      icon: Scale,
      tone: net < 0 ? "danger" : "neutral",
    },
    {
      label: t("owner.herd"),
      value: animals.data ? formatNumber(herd.length, language) : loading,
      hint: animals.data
        ? t("owner.bySide", {
            dairy: formatNumber(
              herd.filter((one) => one.side === "dairy").length,
              language
            ),
            fattening: formatNumber(
              herd.filter((one) => one.side === "fattening").length,
              language
            ),
          })
        : undefined,
      icon: Tractor,
    },
    {
      label: t("money.awaitingCount"),
      value: (
        <Link className={FIGURE_LINK} to="/money">
          {taka(moneyAwaitingTotal(data.needsYou))}
        </Link>
      ),
      hint: t("owner.entries", { count: formatNumber(awaiting, language) }),
      icon: Hourglass,
      tone: awaiting > 0 ? "warning" : "neutral",
    },
  ];
};

/** A figure that is a way to the list it counts. */
const FIGURE_LINK =
  "focus-visible:ring-ring rounded-md underline-offset-4 outline-none hover:underline focus-visible:ring-2";

/**
 * The Owner's home: the figures the farm is judged by, then what only the Owner can settle — and below it the farm
 * going about its day — and beside them the week's milk, the month's money, the herd, the fattening side and the store,
 * each a way into its own page.
 *
 * An empty list of decisions means the farm is fine, and that is the whole point of it — a screen that always has
 * something on it is a screen that stops meaning anything. Nothing here is typed by anybody: every figure is worked out
 * from what was recorded.
 */
const OwnerHome = () => {
  const t = useT();
  const home = useQuery(orpc.home.owner.queryOptions());

  // Cached first, error second. A phone with no signal has the farm as it last knew it,
  // and a screen that throws that away to show the word "error" has taken away the only
  // thing it had — the sync banner above already says how old it is.
  if (!home.data) {
    return (
      <Page width="wide">
        <PageHeader title={t("owner.title")} />
        {home.isError ? (
          <Notice title={t("common.error")} tone="danger" />
        ) : (
          <Skeleton className="h-64 rounded-xl" />
        )}
      </Page>
    );
  }
  return <OwnerDay data={home.data} />;
};

/** The week's milk, with what the week averages and what today could not send to the tank. */
const MilkPanel = ({ tiles }: { tiles: OwnerAnswer["tiles"] }) => {
  const { t, language } = useLanguage();
  return (
    <Section
      action={
        <Link className={MORE_LINK} to="/milk">
          <OpenWords />
        </Link>
      }
      title={t("owner.weekTitle")}
    >
      <MilkWeek average={tiles.averageBulk} days={tiles.days} />
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="border-foreground/50 w-5 border-t border-dashed"
          />
          {t("owner.average", {
            litres: formatNumber(tiles.averageBulk, language, {
              maximumFractionDigits: 1,
            }),
          })}
        </span>
        <span className={tiles.discardToday > 0 ? "text-warning" : undefined}>
          {t("owner.discardToday")}:{" "}
          {t("owner.litres", {
            litres: formatNumber(tiles.discardToday, language),
          })}
        </span>
      </div>
    </Section>
  );
};

/** The Owner's day once the farm has answered. */
const OwnerDay = ({ data }: { data: OwnerAnswer }) => {
  const { t, language } = useLanguage();
  const { needsYou, tiles } = data;
  const figures = useFarmFigures(data);
  const waiting = decisionsWaiting(needsYou);

  return (
    <Page width="wide">
      <PageHeader
        actions={
          <Button nativeButton={false} render={<Link to="/money" />}>
            <Wallet aria-hidden data-icon="inline-start" />
            {t("nav.money")}
          </Button>
        }
        description={t("owner.subtitle")}
        eyebrow={formatDate(new Date(), language, "date")}
        meta={
          waiting > 0 ? (
            <StatusBadge tone="warning">
              {t("owner.waitingCount", {
                count: formatNumber(waiting, language),
              })}
            </StatusBadge>
          ) : (
            <StatusBadge tone="success">{t("owner.allFine")}</StatusBadge>
          )
        }
        title={t("owner.title")}
      />

      <SummaryFigures figures={figures} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section id="needs-you" title={t("owner.needsYou")}>
            {waiting === 0 ? (
              <EmptyState
                bare
                description={t("owner.allFineHint")}
                icon={CircleCheck}
                title={t("owner.allFine")}
              />
            ) : (
              <OwnerDecisions needsYou={needsYou} />
            )}
          </Section>
          <Section
            description={t("owner.onTheFarmHint")}
            title={t("owner.onTheFarm")}
          >
            <FarmToday needsYou={needsYou} tiles={tiles} />
          </Section>
          <MoneyMonth />
        </div>

        <div className="grid min-w-0 items-start gap-6 md:grid-cols-2 xl:grid-cols-1">
          <MilkPanel tiles={tiles} />
          <HerdPanel culled={tiles.culled} died={tiles.died} />
          <FatteningPanel />
          <FeedPanel />
        </div>
      </div>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/farm")({
  beforeLoad: onlyFor("owner"),
  component: OwnerHome,
});
