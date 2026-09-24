import { formatNumber } from "@OpenFarm/i18n";
import { buttonVariants } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Beef,
  CircleCheck,
  CircleHelp,
  ClipboardPlus,
  TriangleAlert,
} from "lucide-react";

import { FatteningBoard } from "@/components/fattening/fattening-board";
import type { BoardRow } from "@/components/fattening/fattening-types";
import { ORDER, standingOf } from "@/components/fattening/fattening-types";
import { NextEid } from "@/components/fattening/next-eid";
import { OutOfBand } from "@/components/fattening/out-of-band";
import { EmptyState, Notice, Page, PageHeader } from "@/components/page";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/** The four figures the fattening side is judged by: how many are on it, how many will miss their target, how many
 *  will make it, and how many have no rate to judge by yet. */
const BoardFigures = ({ rows }: { rows: BoardRow[] }) => {
  const { t, language } = useLanguage();
  const count = (standing: keyof typeof ORDER) =>
    rows.filter((row) => standingOf(row.onTrack) === standing).length;
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
        },
        {
          label: t("gain.behind"),
          value: formatNumber(behind, language),
          hint: t("gain.kpi.behindHint"),
          icon: TriangleAlert,
          tone: behind > 0 ? "warning" : "neutral",
        },
        {
          label: t("gain.onTrack"),
          value: formatNumber(onTrack, language),
          hint: t("gain.kpi.onTrackHint"),
          icon: CircleCheck,
          tone: onTrack > 0 ? "success" : "neutral",
        },
        {
          label: t("gain.noRate"),
          value: formatNumber(count("unknown"), language),
          hint: t("gain.kpi.noRateHint"),
          icon: CircleHelp,
        },
      ]}
    />
  );
};

/** The one thing done from this page that is not reading it: taking another animal in. */
const IntakeButton = () => {
  const { t } = useLanguage();
  return (
    <Link className={buttonVariants()} to="/admin/intake">
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
  const board = useQuery(orpc.fattening.board.queryOptions({ input: {} }));

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
      <BoardFigures rows={rows} />
      <NextEid />
      <OutOfBand />
      <FatteningBoard rows={rows} />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/fattening")({
  beforeLoad: onlyFor("runsTheFarm"),
  component: FatteningPage,
});
