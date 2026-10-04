import { stockingOf } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";

import type { PenChoice } from "@/components/animal/animal-types";
import { Notice } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/** A Pen as a move offers it: "shed / pen", and how full it is against the head it holds once somebody has said. */
export const usePenChoiceLabel = () => {
  const { t, language } = useLanguage();
  return (pen: PenChoice) => {
    const where = `${pen.shedName} / ${pen.name}`;
    const stocking = stockingOf(pen.head ?? 0, pen.capacity ?? null);
    if (stocking === null) {
      return where;
    }
    const full = t("herd.headOfCapacity", {
      head: formatNumber(stocking.head, language),
      capacity: formatNumber(stocking.capacity, language),
    });
    return `${where} · ${full}`;
  };
};

/**
 * Said under a move's choice of Pen when the animals walking in would put it over the head it holds. The move is not
 * stopped — a sick animal goes where there is shade — but whoever moves them knows before the pen is crowded.
 */
export const PenOverCapacity = ({
  pen,
  coming,
}: {
  pen: PenChoice | undefined;
  coming: number;
}) => {
  const { t, language } = useLanguage();
  if (pen === undefined) {
    return null;
  }
  const after = stockingOf(pen.head ?? 0, pen.capacity ?? null, coming);
  if (after === null || after.over === 0) {
    return null;
  }
  return (
    <Notice
      title={t("animals.penOverCapacity", {
        pen: pen.name,
        head: formatNumber(after.head, language),
        capacity: formatNumber(after.capacity, language),
      })}
      tone="warning"
    />
  );
};
