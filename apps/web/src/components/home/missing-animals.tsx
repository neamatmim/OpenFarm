import { formatDate } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import { MapPinOff } from "lucide-react";

import { Opens, QueueGroup, QueueRow } from "@/components/home/queue";
import { useLanguage } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

/** An animal the round could not find, as the home screens are told it. */
export type MissingAnimals = Awaited<
  ReturnType<typeof orpc.home.manager.call>
>["queue"]["missing"];

/**
 * Animals the round could not find, the longest missing first: where it looked and since when, each opening her page,
 * where the Manager marks her Found. First on the list of what waits, because an animal gone is gone further every hour.
 */
export const MissingAnimalsGroup = ({
  animals,
  headless = false,
}: {
  /** Missing from an answer a phone kept from before a Missing was written down. */
  animals: MissingAnimals | undefined;
  headless?: boolean;
}) => {
  const { t, language } = useLanguage();
  const rows = (animals ?? []).map((one) => (
    <QueueRow
      key={one.id}
      meta={
        <span className="text-danger">
          {t("home.missingWhere", {
            pen: one.penName,
            day: formatDate(new Date(one.since), language, "date"),
          })}
        </span>
      }
      title={
        <Link
          className="after:absolute after:inset-0 hover:underline"
          params={{ tagNumber: one.tag }}
          to="/animals/$tagNumber"
        >
          {one.tag}
        </Link>
      }
      trailing={<Opens />}
    />
  ));
  if (rows.length === 0) {
    return null;
  }
  return (
    <QueueGroup
      headless={headless}
      icon={MapPinOff}
      label={t("home.missing")}
      rows={rows}
      tone="danger"
    />
  );
};
