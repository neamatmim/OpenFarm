import { formatNumber } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import { TrendingDown } from "lucide-react";

import { Opens, QueueGroup, QueueRow } from "@/components/home/queue";
import { useLanguage } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

/** A cow giving well under her own week, as the Manager's queue and the Milk page are told it. */
export type GivingLessRows = Awaited<
  ReturnType<typeof orpc.milk.givingLess.call>
>;

/**
 * Cows in milk giving well under their own week, the furthest under first: litres a milking lately and usually, how far
 * under, and how long she has been in milk, each opening her page. A sudden drop is often the first sign of mastitis,
 * milk fever or ketosis — and a heat drops milk too.
 */
export const GivingLessGroup = ({
  rows,
  headless = false,
}: {
  /** Missing from an answer a phone kept from before the list. */
  rows: GivingLessRows | undefined;
  headless?: boolean;
}) => {
  const { t, language } = useLanguage();
  const items = (rows ?? []).map((row) => (
    <QueueRow
      key={row.animalId}
      meta={t("givingLess.line", {
        lately: formatNumber(row.lately, language),
        usually: formatNumber(row.usually, language),
        drop: row.dropPercent,
        pen: row.penName,
      })}
      title={
        <Link
          className="after:absolute after:inset-0 hover:underline"
          params={{ tagNumber: row.tag }}
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
      icon={TrendingDown}
      label={t("givingLess.title")}
      rows={items}
      tone="warning"
    />
  );
};
