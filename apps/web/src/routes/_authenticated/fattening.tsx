import { formatNumber } from "@OpenFarm/i18n";
import { buttonVariants } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Beef,
  CircleCheck,
  CircleHelp,
  ClipboardPlus,
  TriangleAlert,
} from "lucide-react";

import { MarketPrice } from "@/components/fattening/animal-prices";
import type {
  KeepingFilter,
  StandingFilter,
} from "@/components/fattening/fattening-board";
import {
  FATTENING_BOARD_ID,
  FatteningBoard,
  KEEPING_FILTERS,
  STANDING_FILTERS,
} from "@/components/fattening/fattening-board";
import type { BoardRow } from "@/components/fattening/fattening-types";
import { ORDER, standingOf } from "@/components/fattening/fattening-types";
import { NextEid } from "@/components/fattening/next-eid";
import { OutOfBand } from "@/components/fattening/out-of-band";
import { UnderExpectedGain } from "@/components/fattening/under-expected-gain";
import { EmptyState, Notice, Page, PageHeader } from "@/components/page";
import { SummaryFigures } from "@/components/page-kit";
import { RunningSeasonsStrip } from "@/components/returns/returns-page";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/** The four figures the fattening side is judged by: how many are on it, how many will miss their target, how many
 *  will make it, and how many have no rate to judge by yet. */
const BoardFigures = ({
  rows,
  standing,
  onPick,
}: {
  rows: BoardRow[];
  standing: StandingFilter;
  /** Shows the board as a figure counts it: every animal, or those of one standing. */
  onPick: (value: StandingFilter) => void;
}) => {
  const { t, language } = useLanguage();
  const count = (which: keyof typeof ORDER) =>
    rows.filter((row) => standingOf(row.onTrack) === which).length;
  const behind = count("behind");
  const onTrack = count("onTrack");
  return (
    <SummaryFigures
      figures={[
        {
          label: t("gain.onSide"),
          value: formatNumber(rows.length, language),
          hint: t("gain.kpi.onSideHint"),
          icon: Beef,
          onSelect: () => onPick("all"),
        },
        {
          label: t("gain.behind"),
          value: formatNumber(behind, language),
          hint: t("gain.kpi.behindHint"),
          icon: TriangleAlert,
          tone: behind > 0 ? "warning" : "neutral",
          onSelect: () => onPick("behind"),
          selected: standing === "behind",
        },
        {
          label: t("gain.onTrack"),
          value: formatNumber(onTrack, language),
          hint: t("gain.kpi.onTrackHint"),
          icon: CircleCheck,
          tone: onTrack > 0 ? "success" : "neutral",
          onSelect: () => onPick("onTrack"),
          selected: standing === "onTrack",
        },
        {
          label: t("gain.noRate"),
          value: formatNumber(count("unknown"), language),
          hint: t("gain.kpi.noRateHint"),
          icon: CircleHelp,
          onSelect: () => onPick("unknown"),
          selected: standing === "unknown",
        },
      ]}
    />
  );
};

/** The one thing done from this page that is not reading it: taking another animal in. */
const IntakeButton = () => {
  const { t } = useLanguage();
  return (
    <Link className={buttonVariants()} to="/intakes">
      <ClipboardPlus aria-hidden data-icon="inline-start" />
      {t("nav.intake")}
    </Link>
  );
};

/**
 * The fattening side at a glance: who will make their weight by their Target Window and who
 * will not.
 *
 * Nothing here was typed: every figure is worked out from the Intake and the Weigh-ins. The figures sit on top, and
 * the board beneath them is filtered by where an animal stands, by Pen, or by her tag.
 */
const FatteningPage = () => {
  const { t } = useLanguage();
  const board = useQuery(orpc.fattening.list.queryOptions({ input: {} }));
  const { keeping = "all", standing = "all" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // Each filter kept in the address beside the other, and "all" as no filter at all.
  const onStanding = (value: StandingFilter) =>
    navigate({
      replace: true,
      // A filter changed is the same page read differently: the reader stays where they are.
      resetScroll: false,
      search: (before) => ({
        ...before,
        standing: value === "all" ? undefined : value,
      }),
    });
  // A figure pressed shows the board as it counts it, and the board itself, wherever the page was.
  const pick = async (value: StandingFilter) => {
    await onStanding(value);
    // After the board has drawn itself filtered, or the page settles back where the router left it.
    requestAnimationFrame(() =>
      document
        .querySelector(`#${FATTENING_BOARD_ID}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  const header = (
    <PageHeader
      actions={<IntakeButton />}
      description={t("gain.subtitle")}
      title={t("nav.fattening")}
    />
  );

  if (!board.data) {
    return (
      <Page>
        {header}
        {board.isError ? (
          <Notice title={t("common.loadFailed")} tone="danger" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {["a", "b", "c", "d"].map((key) => (
                <Skeleton className="h-28 rounded-xl" key={key} />
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </>
        )}
      </Page>
    );
  }

  const rows = board.data.toSorted(
    (a, b) => ORDER[standingOf(a.onTrack)] - ORDER[standingOf(b.onTrack)]
  );

  if (rows.length === 0) {
    return (
      <Page>
        {header}
        <NextEid />
        <EmptyState
          action={<IntakeButton />}
          description={t("gain.emptyHint")}
          icon={Beef}
          title={t("gain.empty")}
        />
      </Page>
    );
  }

  return (
    <Page>
      {header}
      <BoardFigures onPick={pick} rows={rows} standing={standing} />
      {/* What the board is read against, in one band so the board itself is near the top: the market price and the Eid
          it is aimed at stacked, the Season at today's price beside them — about as tall as the two, so neither side
          leaves a gap. A card the reader may not see (the Owner's) leaves none either: what is left takes the width. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex flex-col gap-4 empty:hidden lg:flex-1">
          <MarketPrice compact />
          <NextEid compact />
        </div>
        <RunningSeasonsStrip className="lg:flex-1" />
      </div>
      <OutOfBand />
      <UnderExpectedGain />
      <FatteningBoard
        keeping={keeping}
        onKeeping={(value) =>
          navigate({
            replace: true,
            resetScroll: false,
            search: (before) => ({
              ...before,
              keeping: value === "all" ? undefined : value,
            }),
          })
        }
        onStanding={onStanding}
        rows={rows}
        standing={standing}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/fattening")({
  beforeLoad: onlyFor("runsTheFarm"),
  component: FatteningPage,
  // Which of the Owner's answers to keep or sell the board was filtered to, so the farm's home can link to one; and
  // where the animals stand, so the figures above can show the board as they count it.
  validateSearch: (
    search: Record<string, unknown>
  ): {
    keeping?: Exclude<KeepingFilter, "all">;
    standing?: Exclude<StandingFilter, "all">;
  } => {
    const keeping = KEEPING_FILTERS.find((one) => one === search.keeping);
    const standing = STANDING_FILTERS.find((one) => one === search.standing);
    return {
      ...(keeping === undefined || keeping === "all" ? {} : { keeping }),
      ...(standing === undefined || standing === "all" ? {} : { standing }),
    };
  },
});
