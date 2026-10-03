import { formatDate } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import { Repeat } from "lucide-react";

import { Opens, QueueGroup, QueueRow } from "@/components/home/queue";
import { useLanguage } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

/** An animal the Vet has diagnosed again and again, as the Manager's queue is told it. */
export type IllAgainAnimals = Awaited<
  ReturnType<typeof orpc.home.manager.call>
>["queue"]["illAgain"];

/**
 * Animals the Vet has diagnosed again and again within the farm's days, the most diagnosed first: how many times, and
 * the latest, each opening her page. Listed and never pushed — whether to keep treating one is the Owner's to weigh.
 */
export const IllAgainGroup = ({
  animals,
  headless = false,
}: {
  /** Missing from an answer a phone kept from before illness was counted. */
  animals: IllAgainAnimals | undefined;
  headless?: boolean;
}) => {
  const { t, language } = useLanguage();
  const rows = (animals ?? []).map((one) => (
    <QueueRow
      key={one.animalId}
      meta={t("home.illAgainLine", {
        count: one.diagnoses,
        disease: one.lastDisease,
        day: formatDate(new Date(one.lastAt), language, "date"),
      })}
      title={
        <Link
          className="after:absolute after:inset-0 hover:underline"
          params={{ tagNumber: one.tag }}
          to="/animals/$tagNumber/health"
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
      icon={Repeat}
      label={t("home.illAgain")}
      rows={rows}
      tone="info"
    />
  );
};
