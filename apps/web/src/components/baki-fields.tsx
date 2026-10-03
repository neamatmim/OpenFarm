import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";

import { Notice } from "@/components/page";
import { FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import type { BakiTyped } from "@/lib/baki";
import { stillOwes } from "@/lib/baki";
import { orpc } from "@/utils/orpc";

/**
 * Some of it still owed: a tick, and behind it what the buyer paid now and the day he promised. What he still owes is
 * worked out beneath as it is typed, so the Manager reads the figure the buyer will be held to.
 */
export const BakiFields = ({
  idPrefix,
  typed,
  onType,
  worthMoney,
  promiseRequired,
}: {
  idPrefix: string;
  typed: BakiTyped;
  onType: (patch: Partial<BakiTyped>) => void;
  /** What it came to — a Sale's price, a Dispatch's litres at its price — or nothing while it is not yet typed. */
  worthMoney: number;
  /** A trader promises a day; a milk buyer who pays on a round often does not. */
  promiseRequired: boolean;
}) => {
  const { t, language } = useLanguage();
  const owes = stillOwes(typed, worthMoney);
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
  bakiMoney = 0,
  owingMoney,
  promisedBy = null,
}: {
  bakiMoney?: number;
  /** What is still owed today, as his payments have left it; left out of an older answer, what was owed as it left. */
  owingMoney?: number;
  promisedBy?: string | null;
}) => {
  const { t, language } = useLanguage();
  const owed = owingMoney ?? bakiMoney;
  if (owed <= 0) {
    return null;
  }
  const taka = formatNumber(owed, language);
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

/**
 * What the buyer being typed still owes the farm, said before anything more is sold to him on Baki. Never a refusal:
 * the Manager at the haat decides, but decides knowing. Nothing for a buyer who owes nothing, or a name the farm does
 * not know.
 */
export const BuyerOwes = ({ name }: { name: string }) => {
  const { t, language } = useLanguage();
  // Asked once the typing settles, not at every letter of his name.
  const settled = useDeferredValue(name.trim());
  const his = useQuery({
    ...orpc.baki.ofBuyer.queryOptions({ input: { name: settled } }),
    enabled: settled.length > 1,
  });
  const owes = his.data;
  if (!owes) {
    return null;
  }
  const day = (value: string) =>
    formatDate(startOfFarmDay(value), language, "date");
  const taka = formatNumber(owes.owingMoney, language);
  const lines = [
    owes.owingMoney > 0 && owes.overdueSince
      ? t("baki.buyerOverdue", {
          name: owes.name,
          taka,
          day: day(owes.overdueSince),
        })
      : null,
    owes.owingMoney > 0 && !owes.overdueSince && owes.oldestOn
      ? t("baki.buyerOwes", { name: owes.name, taka, day: day(owes.oldestOn) })
      : null,
    // His mark: the farm has lost money to him before. Missing from an answer kept from before write-offs.
    (owes.writtenOffMoney ?? 0) > 0 && owes.lastWrittenOffOn
      ? t("baki.buyerWrittenOff", {
          name: owes.name,
          taka: formatNumber(owes.writtenOffMoney, language),
          day: day(owes.lastWrittenOffOn),
        })
      : null,
  ].filter((line) => line !== null);
  if (lines.length === 0) {
    return null;
  }
  const loud = Boolean(owes.overdueSince) || (owes.writtenOffMoney ?? 0) > 0;
  return (
    <Notice title={lines.join(" · ")} tone={loud ? "danger" : "warning"} />
  );
};
