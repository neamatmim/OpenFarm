import { formatDate } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import { Flame } from "lucide-react";

import { Opens, QueueGroup, QueueRow } from "@/components/home/queue";
import { useLanguage } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

/** One cow on the heat watch, as the Manager's queue and the Vet's page are told it. */
export type HeatWatchRows = Awaited<
  ReturnType<typeof orpc.breeding.heatWatch.call>
>;

/** A heifer on it, in words: how old, and the age she should have been served by — or that nobody knows her age. */
const HeiferLine = ({ row }: { row: HeatWatchRows[number] }) => {
  const { t } = useLanguage();
  if (row.because === "age_unknown" || row.ageMonths === null) {
    return t("heatWatch.heiferAgeUnknown", { pen: row.penName });
  }
  return t(
    row.ageEstimated
      ? "heatWatch.heiferNotServedAbout"
      : "heatWatch.heiferNotServed",
    { age: row.ageMonths, due: row.dueAtMonths ?? 0, pen: row.penName }
  );
};

/** Why she is on it, in words: due back from a service, no heat seen lately since calving, or a heifer not served. */
const HeatWatchLine = ({ row }: { row: HeatWatchRows[number] }) => {
  const { t, language } = useLanguage();
  if (row.daysSinceCalving === null) {
    return <HeiferLine row={row} />;
  }
  const days = row.daysSinceCalving;
  if (row.because === "return_due" && row.servedAt) {
    return t("heatWatch.returnDue", {
      day: formatDate(new Date(row.servedAt), language, "date"),
      pen: row.penName,
    });
  }
  return row.lastSignAt
    ? t("heatWatch.quietSince", {
        days,
        day: formatDate(new Date(row.lastSignAt), language, "date"),
        pen: row.penName,
      })
    : t("heatWatch.neverSeen", { days, pen: row.penName });
};

/**
 * Open cows the farm expects in heat and nobody has seen, the longest since calving first: watch her closely, and have
 * the Vet look at her. Most will be heats nobody saw, not cows that cannot breed — so the list asks for eyes, never says
 * "barren". Each row opens her breeding.
 */
export const HeatWatchGroup = ({
  rows,
  headless = false,
}: {
  /** Missing from an answer a phone kept from before the heat watch. */
  rows: HeatWatchRows | undefined;
  headless?: boolean;
}) => {
  const { t } = useLanguage();
  const items = (rows ?? []).map((row) => (
    <QueueRow
      key={row.animalId}
      meta={<HeatWatchLine row={row} />}
      title={
        <Link
          className="after:absolute after:inset-0 hover:underline"
          params={{ tagNumber: row.tag }}
          search={{ tab: "breeding" }}
          to="/animals/$tagNumber"
        >
          {row.tag}
        </Link>
      }
      trailing={<Opens />}
    />
  ));
  if (items.length === 0) {
    return null;
  }
  return (
    <QueueGroup
      headless={headless}
      icon={Flame}
      label={t("heatWatch.title")}
      rows={items}
      tone="info"
    />
  );
};
