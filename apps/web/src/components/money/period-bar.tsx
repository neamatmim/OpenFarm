import { Input } from "@OpenFarm/ui/components/input";

import { FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

/**
 * The period the whole money page reads — its figures, its register, its costs and the accountant's export — as two
 * days side by side, on a phone as much as at a desk, so the figures below them are never far from the dates they are
 * for.
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
  return (
    <fieldset className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
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
    </fieldset>
  );
};
