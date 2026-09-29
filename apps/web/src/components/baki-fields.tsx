import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";

import { FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import type { BakiTyped } from "@/lib/baki";
import { stillOwes } from "@/lib/baki";

/**
 * Some of it still owed: a tick, and behind it what the buyer paid now and the day he promised. What he still owes is
 * worked out beneath as it is typed, so the Manager reads the figure the buyer will be held to.
 */
export const BakiFields = ({
  idPrefix,
  typed,
  onType,
  worthBdt,
  promiseRequired,
}: {
  idPrefix: string;
  typed: BakiTyped;
  onType: (patch: Partial<BakiTyped>) => void;
  /** What it came to — a Sale's price, a Dispatch's litres at its price — or nothing while it is not yet typed. */
  worthBdt: number;
  /** A trader promises a day; a milk buyer who pays on a round often does not. */
  promiseRequired: boolean;
}) => {
  const { t, language } = useLanguage();
  const owes = stillOwes(typed, worthBdt);
  return (
    <div className="flex flex-col gap-4">
      <label
        className="has-data-checked:border-primary/40 has-data-checked:bg-primary/5 hover:bg-muted/50 flex h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm md:h-9"
        htmlFor={`${idPrefix}-owed`}
      >
        <Checkbox
          checked={typed.owed}
          id={`${idPrefix}-owed`}
          onCheckedChange={(owed) => onType({ owed })}
        />
        {t("baki.someOwed")}
      </label>
      {typed.owed ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            hint={
              owes === null
                ? undefined
                : t("baki.stillOwes", { taka: formatNumber(owes, language) })
            }
            id={`${idPrefix}-paid-now`}
            label={t("baki.paidNow")}
          >
            <Input
              autoComplete="off"
              id={`${idPrefix}-paid-now`}
              inputMode="numeric"
              min={0}
              onChange={(event) => onType({ paidNow: event.target.value })}
              required
              type="number"
              value={typed.paidNow}
            />
          </FormField>
          <FormField
            id={`${idPrefix}-promised-by`}
            label={t(
              promiseRequired ? "baki.promisedBy" : "baki.promisedByOptional"
            )}
          >
            <Input
              id={`${idPrefix}-promised-by`}
              onChange={(event) => onType({ promisedBy: event.target.value })}
              required={promiseRequired}
              type="date"
              value={typed.promisedBy}
            />
          </FormField>
        </div>
      ) : null}
    </div>
  );
};

/**
 * What a buyer still owed as it left, said beside the Sale or the Dispatch: the figure and the day he promised, or
 * nothing for one paid in full. Left out of an answer cached before Baki was written down, it is paid in full, as
 * every one of those was.
 */
export const BakiOwed = ({
  bakiBdt = 0,
  promisedBy = null,
}: {
  bakiBdt?: number;
  promisedBy?: string | null;
}) => {
  const { t, language } = useLanguage();
  if (bakiBdt <= 0) {
    return null;
  }
  const taka = formatNumber(bakiBdt, language);
  return (
    <span className="text-warning text-xs font-medium">
      {promisedBy === null
        ? t("baki.owed", { taka })
        : t("baki.owedBy", {
            taka,
            day: formatDate(startOfFarmDay(promisedBy), language, "date"),
          })}
    </span>
  );
};
