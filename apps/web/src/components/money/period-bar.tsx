import { farmDayOf } from "@OpenFarm/domain";
import { Input } from "@OpenFarm/ui/components/input";
import { useQuery } from "@tanstack/react-query";

import { SegmentedControl } from "@/components/page";
import { FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** The years a press away: this financial year up to today, and the whole of the last. */
const SHORTCUTS = ["this", "last"] as const;
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
    <fieldset className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <legend className="sr-only">{t("money.period")}</legend>
      <FormField id="money-from" label={t("dispatch.from")}>
        <Input
          className="sm:w-44"
          id="money-from"
          onChange={(event) => onFromChange(event.target.value)}
          type="date"
          value={from}
        />
      </FormField>
      <FormField id="money-to" label={t("dispatch.to")}>
        <Input
          className="sm:w-44"
          id="money-to"
          onChange={(event) => onToChange(event.target.value)}
          type="date"
          value={to}
        />
      </FormField>
      {shortcuts ? (
        <div className="col-span-2 flex sm:col-span-1">
          <SegmentedControl<Shortcut | "">
            label={t("money.period")}
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
        </div>
      ) : null}
    </fieldset>
  );
};
