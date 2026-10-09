import { farmDayOf } from "@OpenFarm/domain";
import { useQuery } from "@tanstack/react-query";

import { SegmentedControl } from "@/components/page";
import { PeriodFilter } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** The years a press away: this financial year up to today, and the whole of the last. */
const SHORTCUTS = ["this", "last"] as const;
/** One of the period's shortcuts: this financial year, or the last. */
type Shortcut = (typeof SHORTCUTS)[number];

/**
 * The period the whole money page reads — its figures, its register, its costs and the accountant's export — as two
 * days side by side, on a phone as much as at a desk, so the figures below them are never far from the dates they are
 * for. This financial year up to today and the whole of the last are a press away, as the farm's years run (ADR 0017)
 * — a Transition Year at its own length — and say so while they are the period.
 */
export const PeriodBar = ({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (day: string) => void;
  onToChange: (day: string) => void;
}) => {
  const { t } = useLanguage();
  const years = useQuery(orpc.financialYears.list.queryOptions());
  const today = farmDayOf(new Date());
  // The two years by their name, so the segment that is the period on the page is the one drawn chosen.
  const shortcuts = years.data
    ? {
        this: { from: years.data.current.from, to: today },
        last: { from: years.data.previous.from, to: years.data.previous.to },
      }
    : null;
  const chosen = shortcuts
    ? (SHORTCUTS.find(
        (shortcut) =>
          shortcuts[shortcut].from === from && shortcuts[shortcut].to === to
      ) ?? "")
    : "";
  return (
    <PeriodFilter
      from={from}
      fromLabel={t("dispatch.from")}
      label={t("money.period")}
      onFrom={onFromChange}
      onTo={onToChange}
      to={to}
      toLabel={t("dispatch.to")}
    >
      {shortcuts ? (
        <SegmentedControl<Shortcut | "">
          label={t("settings.section.years")}
          name="money-period"
          onChange={(shortcut) => {
            if (shortcut) {
              onFromChange(shortcuts[shortcut].from);
              onToChange(shortcuts[shortcut].to);
            }
          }}
          options={[
            { value: "this", label: t("money.thisFinancialYear") },
            { value: "last", label: t("money.lastFinancialYear") },
          ]}
          value={chosen}
        />
      ) : null}
    </PeriodFilter>
  );
};
