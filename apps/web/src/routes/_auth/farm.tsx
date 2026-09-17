import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CircleCheck,
  ClipboardCheck,
  Droplets,
  Milk,
  MilkOff,
} from "lucide-react";

import { MilkWeek } from "@/components/home/milk-week";
import { OwnerQueue } from "@/components/home/owner-queue";
import {
  EmptyState,
  Notice,
  Page,
  PageHeader,
  ProgressBar,
  Section,
  StatusBadge,
} from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage, useT } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

type OwnerTiles = Awaited<ReturnType<typeof orpc.home.owner.call>>["tiles"];

/** A figure that is a way to the list it counts. */
const FIGURE_LINK =
  "focus-visible:ring-ring rounded-md underline-offset-4 outline-none hover:underline focus-visible:ring-2";

/** The four figures the Owner judges a day by: the milk that went to the tank and the milk that could not, how much of
 *  the day's work is done, and how many cows' milk the farm may not sell. */
const useDayFigures = (tiles: OwnerTiles): Figure[] => {
  const { t, language } = useLanguage();
  const donePercent =
    tiles.workRaised === 0
      ? 0
      : Math.round((tiles.workDone / tiles.workRaised) * 100);
  const workDone = (
    <Link className={FIGURE_LINK} search={{}} to="/today">
      {t("home.progress", {
        done: formatNumber(tiles.workDone, language),
        raised: formatNumber(tiles.workRaised, language),
      })}
    </Link>
  );
  return [
    {
      label: t("owner.bulkToday"),
      value: t("owner.litres", {
        litres: formatNumber(tiles.bulkToday, language),
      }),
      hint: t("owner.average", {
        litres: formatNumber(tiles.averageBulk, language),
      }),
      icon: Milk,
    },
    {
      label: t("home.workDone"),
      value: workDone,
      hint: <ProgressBar label={t("home.workDone")} value={donePercent} />,
      icon: ClipboardCheck,
    },
    {
      label: t("owner.discardToday"),
      value: t("owner.litres", {
        litres: formatNumber(tiles.discardToday, language),
      }),
      hint: t("owner.discardHint"),
      icon: Droplets,
    },
    {
      label: t("home.cowsHeld"),
      value: (
        <Link className={FIGURE_LINK} to="/animals">
          {formatNumber(tiles.underWithdrawal, language)}
        </Link>
      ),
      hint: t("home.withdrawal"),
      icon: MilkOff,
      tone: tiles.underWithdrawal > 0 ? "warning" : "neutral",
    },
  ];
};

/** What the farm has lost lately, beside its milk: the number a farm lives by belongs with the Owner's other numbers. */
const Losses = ({ tiles }: { tiles: OwnerTiles }) => {
  const { t, language } = useLanguage();
  return (
    <Section title={t("owner.lossesTitle")}>
      <dl className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-sm">{t("owner.died")}</dt>
          <dd
            className={
              tiles.died > 0
                ? "text-danger text-2xl font-semibold tabular-nums"
                : "text-2xl font-semibold tabular-nums"
            }
          >
            {formatNumber(tiles.died, language)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-sm">{t("owner.culled")}</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {formatNumber(tiles.culled, language)}
          </dd>
        </div>
      </dl>
    </Section>
  );
};

/**
 * The Owner's home: the day's four figures, then the exception list, and beside it the week's milk and what the farm
 * has lost.
 *
 * An empty list means the farm is fine, and that is the whole point of it — a screen that
 * always has something on it is a screen that stops meaning anything. Nothing here is typed
 * by anybody: every figure is worked out from what was recorded.
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

/** The Owner's day once the farm has answered. */
const OwnerDay = ({
  data,
}: {
  data: Awaited<ReturnType<typeof orpc.home.owner.call>>;
}) => {
  const { t, language } = useLanguage();
  const { needsYou, tiles } = data;
  const figures = useDayFigures(tiles);
  const waiting =
    needsYou.overdue.length +
    needsYou.approvals.length +
    needsYou.proposals.length +
    needsYou.needsReview.length +
    needsYou.endingWithdrawal.length +
    needsYou.lowStock.length +
    needsYou.moneyAwaiting.length +
    (needsYou.registrationRenewal ? 1 : 0);

  return (
    <Page width="wide">
      <PageHeader
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
        <Section className="min-w-0" id="needs-you" title={t("owner.needsYou")}>
          {waiting === 0 ? (
            <EmptyState
              bare
              description={t("owner.allFineHint")}
              icon={CircleCheck}
              title={t("owner.allFine")}
            />
          ) : (
            <OwnerQueue needsYou={needsYou} />
          )}
        </Section>

        <div className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-20">
          <Section title={t("owner.weekTitle")}>
            <MilkWeek days={tiles.days} />
            <p className="text-muted-foreground text-sm">
              {t("owner.average", {
                litres: formatNumber(tiles.averageBulk, language),
              })}
            </p>
          </Section>
          <Losses tiles={tiles} />
        </div>
      </div>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/farm")({
  beforeLoad: onlyFor("owner"),
  component: OwnerHome,
});
