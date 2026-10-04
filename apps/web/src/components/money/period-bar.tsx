import {
  daysOfFinancialYear,
  farmDayOf,
  financialYearOf,
} from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";

import { FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

/** The financial years a period can be set to in one press (ADR 0016): this one up to today, and the whole of the
 *  last — the year the accountant closes the books on. */
const financialPeriods = (today: string) => {
  const thisYear = financialYearOf(today);
  return {
    thisYear: { from: daysOfFinancialYear(thisYear).from, to: today },
    lastYear: daysOfFinancialYear(thisYear - 1),
  };
};

/**
 * The period the whole money page reads — its figures, its register, its costs and the accountant's export — as two
 * days side by side, on a phone as much as at a desk, so the figures below them are never far from the dates they are
 * for. This financial year and the last are a press away, and say so while they are the period.
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
  const periods = financialPeriods(farmDayOf(new Date()));
  const shortcuts = [
    { label: t("money.thisFinancialYear"), period: periods.thisYear },
    { label: t("money.lastFinancialYear"), period: periods.lastYear },
  ];
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
      {shortcuts.map(({ label, period }) => {
        const isThePeriod = period.from === from && period.to === to;
        return (
          <Button
            aria-pressed={isThePeriod}
            className="h-11 md:h-9"
            key={label}
            onClick={() => {
              onFromChange(period.from);
              onToChange(period.to);
            }}
            type="button"
            variant={isThePeriod ? "secondary" : "outline"}
          >
            {label}
          </Button>
        );
      })}
    </fieldset>
  );
};
