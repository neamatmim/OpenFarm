import { formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { GainColumn } from "@/components/gain";
import { Page, PageHeader } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** Short of the target first, then the ones with no rate to judge, then the rest: a screen that
 *  lists everything in tag order is a screen nobody reads twice. */
const ORDER = { behind: 0, unknown: 1, onTrack: 2 };
const rank = (onTrack: boolean | null): number => {
  if (onTrack === false) {
    return ORDER.behind;
  }
  return onTrack === null ? ORDER.unknown : ORDER.onTrack;
};

/**
 * The fattening side at a glance: who will make their weight by their Target Window and who
 * will not.
 *
 * Nothing here was typed: every figure is worked out from the Intake and the Weigh-ins.
 */
const FatteningPage = () => {
  const { t, language } = useLanguage();
  const board = useQuery(orpc.fattening.board.queryOptions({ input: {} }));

  if (!board.data) {
    return (
      <p className="p-6">
        {board.isError ? t("common.error") : t("common.loading")}
      </p>
    );
  }
  if (board.data.length === 0) {
    return <p className="p-6">{t("gain.empty")}</p>;
  }

  const rows = board.data.toSorted((a, b) => rank(a.onTrack) - rank(b.onTrack));

  return (
    <Page width="default" className="max-w-4xl">
      <PageHeader title={t("nav.fattening")} />
      <ul className="space-y-3">
        {rows.map((row) => (
          <li className="surface space-y-2 p-4" key={row.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                className="text-lg font-bold underline"
                params={{ tagNumber: row.tagNumber }}
                to="/animals/$tagNumber"
              >
                {row.tagNumber}
              </Link>
              <span className="text-muted-foreground text-sm">
                {row.penName} · {t(`state.${row.state}`)}
              </span>
              <span
                className={
                  row.onTrack === false ? "text-warning" : "text-success"
                }
              >
                {row.onTrack === null
                  ? t("gain.noneYet")
                  : t(row.onTrack ? "gain.onTrack" : "gain.behind")}
              </span>
            </div>
            {/* Each figure is left out rather than shown blank: an animal born onto this side
                has no arrival to count days from and nothing said about its target. */}
            <p className="text-muted-foreground text-sm">
              {row.latestKg === null
                ? t("gain.noneYet")
                : `${t("gain.now")}: ${t("intake.kg", {
                    kg: formatNumber(row.latestKg, language),
                  })}`}
              {row.targetWeightKg === null
                ? null
                : ` · ${t("intake.targetWeight")}: ${t("intake.kg", {
                    kg: formatNumber(row.targetWeightKg, language),
                  })}`}
              {row.daysOnFeed === null
                ? null
                : ` · ${t("gain.daysOnFeed")}: ${t("correct.spanDays", {
                    days: formatNumber(row.daysOnFeed, language),
                  })}`}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <GainColumn
                basis={row.sinceIntake}
                label={t("gain.sinceIntake")}
              />
              <GainColumn basis={row.recent} label={t("gain.recent")} />
            </div>
            {/* The gap between the two columns, said out loud: a bull whose lifetime average
                still looks fine may have stopped gaining a fortnight ago. */}
            {row.recent &&
            row.sinceIntake &&
            row.recent.dailyGainKg < row.sinceIntake.dailyGainKg ? (
              <p className="text-warning text-sm">{t("gain.slowing")}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/fattening")({
  component: FatteningPage,
});
