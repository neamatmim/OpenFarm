import type { MonthlySum } from "@OpenFarm/domain";
import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";

/** How one Unit of a Venture is paid for, as every read of a Venture carries it. */
export interface PaidFor {
  unitPriceMoney: number;
  monthly: { cattlePartMoney: number; sums: MonthlySum[] } | null;
}

/**
 * How one Unit is paid for, in one line: all before buying, or its Cattle Part and then the Monthly Sums from the first
 * month to the last, with the last said apart where the division left it different. The same words on the sheet she
 * opens it with, on the Venture's page and in the offer an invited Investor reads before he asks to join.
 */
export const PaidForBy = ({ paidFor }: { paidFor: PaidFor }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const { monthly } = paidFor;
  if (!monthly) {
    return (
      <>
        {t("ventures.paidFor.allBefore", {
          price: asMoney(paidFor.unitPriceMoney),
        })}
      </>
    );
  }
  const [first] = monthly.sums;
  const last = monthly.sums.at(-1);
  if (!(first && last)) {
    return (
      <>
        {t("ventures.paidFor.allBefore", {
          price: asMoney(paidFor.unitPriceMoney),
        })}
      </>
    );
  }
  const month = (on: string) =>
    formatDate(startOfFarmDay(on), language, "monthYear");
  const said = {
    cattle: asMoney(monthly.cattlePartMoney),
    each: asMoney(first.amount),
    from: month(first.dueOn),
    to: month(last.dueOn),
  };
  const lastDiffers = last.amount !== first.amount;
  return (
    <>
      {lastDiffers
        ? t("ventures.paidFor.monthlyLast", {
            ...said,
            last: asMoney(last.amount),
          })
        : t("ventures.paidFor.monthly", said)}
      <span className="text-muted-foreground">
        {" · "}
        {t("ventures.paidFor.sums", {
          count: formatNumber(monthly.sums.length, language),
        })}
      </span>
    </>
  );
};
