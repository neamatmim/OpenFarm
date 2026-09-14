import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Beef,
  CircleCheck,
  CircleHelp,
  ClipboardPlus,
  MapPin,
  Scale,
  TrendingDown,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";

import { GainColumn } from "@/components/gain";
import type { Tone } from "@/components/page";
import {
  EmptyState,
  Notice,
  Page,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  StatTile,
  StatusBadge,
  TagChip,
} from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/** Short of the target first, then the ones with no rate to judge, then the rest: a screen that
 *  lists everything in tag order is a screen nobody reads twice. */
const ORDER = { behind: 0, unknown: 1, onTrack: 2 };
type Standing = keyof typeof ORDER;
const standingOf = (onTrack: boolean | null): Standing => {
  if (onTrack === false) {
    return "behind";
  }
  return onTrack === null ? "unknown" : "onTrack";
};

const STANDING_LOOK: Record<
  Standing,
  {
    tone: Tone;
    icon: typeof CircleCheck;
    word: "gain.behind" | "gain.noRate" | "gain.onTrack";
  }
> = {
  behind: { tone: "warning", icon: TriangleAlert, word: "gain.behind" },
  unknown: { tone: "neutral", icon: CircleHelp, word: "gain.noRate" },
  onTrack: { tone: "success", icon: CircleCheck, word: "gain.onTrack" },
};

type Row = NonNullable<
  Awaited<ReturnType<typeof orpc.fattening.board.call>>
>[number];

/** One animal on the fattening side: where it stands against its target, and the two rates that say why. */
const AnimalCard = ({ row }: { row: Row }) => {
  const { t, language } = useLanguage();
  const standing = standingOf(row.onTrack);
  const look = STANDING_LOOK[standing];
  const kg = (value: number) =>
    t("intake.kg", { kg: formatNumber(value, language) });
  const slowing =
    row.recent !== null &&
    row.sinceIntake !== null &&
    row.recent.dailyGainKg < row.sinceIntake.dailyGainKg;
  const towardsTarget =
    row.latestKg !== null && row.targetWeightKg !== null
      ? (row.latestKg / row.targetWeightKg) * 100
      : null;

  return (
    <li className="surface flex flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            className="focus-visible:ring-ring w-fit rounded-md text-xl outline-none hover:underline focus-visible:ring-2"
            params={{ tagNumber: row.tagNumber }}
            to="/animals/$tagNumber"
          >
            <TagChip>{row.tagNumber}</TagChip>
          </Link>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-4" />
              {row.penName}
            </span>
            <span>{t(`state.${row.state}`)}</span>
            {row.daysOnFeed === null ? null : (
              <span>
                {t("gain.daysOnFeed")}:{" "}
                {t("correct.spanDays", {
                  days: formatNumber(row.daysOnFeed, language),
                })}
              </span>
            )}
          </p>
        </div>
        <StatusBadge icon={look.icon} tone={look.tone}>
          {t(look.word)}
        </StatusBadge>
      </div>

      {/* Each figure is left out rather than shown blank: an animal born onto this side has no arrival to count
          days from and nothing said about its target. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
            <Scale aria-hidden className="size-4" />
            {t("gain.now")}
          </p>
          <p className="text-sm">
            <span className="text-2xl font-semibold tabular-nums">
              {row.latestKg === null ? "—" : kg(row.latestKg)}
            </span>
            {row.targetWeightKg === null ? null : (
              <span className="text-muted-foreground">
                {" / "}
                {kg(row.targetWeightKg)}
              </span>
            )}
          </p>
        </div>
        {towardsTarget === null ? (
          <p className="text-muted-foreground text-sm">
            {row.latestKg === null ? t("gain.noneYet") : t("gain.noTarget")}
          </p>
        ) : (
          <ProgressBar
            label={`${t("gain.now")} / ${t("intake.targetWeight")}`}
            value={towardsTarget}
          />
        )}
      </div>

      {/* Two empty boxes saying the same thing twice is noise: until there is a rate, it is said once. */}
      {row.sinceIntake === null && row.recent === null ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-3 py-2.5 text-sm">
          {t("gain.needsTwo")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <GainColumn basis={row.sinceIntake} label={t("gain.sinceIntake")} />
          <GainColumn basis={row.recent} label={t("gain.recent")} />
        </div>
      )}

      {/* The gap between the two columns, said out loud: a bull whose lifetime average still looks fine may have
          stopped gaining a fortnight ago. */}
      {slowing ? (
        <Notice icon={TrendingDown} title={t("gain.slowing")} tone="warning" />
      ) : null}
    </li>
  );
};

type Filter = "all" | Standing;

/**
 * The fattening side at a glance: who will make their weight by their Target Window and who
 * will not.
 *
 * Nothing here was typed: every figure is worked out from the Intake and the Weigh-ins.
 */
const FatteningPage = () => {
  const { t, language } = useLanguage();
  const board = useQuery(orpc.fattening.board.queryOptions({ input: {} }));
  const [filter, setFilter] = useState<Filter>("all");

  const header = (
    <PageHeader
      actions={
        <>
          <Button render={<Link to="/ready" />} variant="outline">
            {t("nav.ready")}
          </Button>
          <Button render={<Link to="/admin/intake" />}>
            <ClipboardPlus aria-hidden />
            {t("nav.intake")}
          </Button>
        </>
      }
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
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
  const count = (standing: Standing) =>
    rows.filter((row) => standingOf(row.onTrack) === standing).length;
  const shown =
    filter === "all"
      ? rows
      : rows.filter((row) => standingOf(row.onTrack) === filter);
  const number = (value: number) => formatNumber(value, language);

  if (rows.length === 0) {
    return (
      <Page>
        {header}
        <EmptyState
          action={
            <Button render={<Link to="/admin/intake" />}>
              <ClipboardPlus aria-hidden />
              {t("nav.intake")}
            </Button>
          }
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={Beef}
          label={t("gain.onSide")}
          value={number(rows.length)}
        />
        <StatTile
          icon={TriangleAlert}
          label={t("gain.behind")}
          tone={count("behind") > 0 ? "warning" : "neutral"}
          value={number(count("behind"))}
        />
        <StatTile
          icon={CircleCheck}
          label={t("gain.onTrack")}
          tone={count("onTrack") > 0 ? "success" : "neutral"}
          value={number(count("onTrack"))}
        />
        <StatTile
          icon={CircleHelp}
          label={t("gain.noRate")}
          value={number(count("unknown"))}
        />
      </div>

      <div className="overflow-x-auto">
        <SegmentedControl
          label={t("gain.filter")}
          name="fattening-filter"
          onChange={setFilter}
          options={[
            {
              value: "all",
              label: `${t("gain.all")} · ${number(rows.length)}`,
            },
            {
              value: "behind",
              label: `${t("gain.behind")} · ${number(count("behind"))}`,
            },
            {
              value: "unknown",
              label: `${t("gain.noRate")} · ${number(count("unknown"))}`,
            },
            {
              value: "onTrack",
              label: `${t("gain.onTrack")} · ${number(count("onTrack"))}`,
            },
          ]}
          value={filter}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState title={t("gain.noneInFilter")} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {shown.map((row) => (
            <AnimalCard key={row.id} row={row} />
          ))}
        </ul>
      )}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/fattening")({
  beforeLoad: onlyFor("runsTheFarm"),
  component: FatteningPage,
});
