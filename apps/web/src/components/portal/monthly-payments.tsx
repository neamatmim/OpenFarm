import type { MonthlyPaymentAllocation } from "@OpenFarm/domain";

import { SaidDate } from "@/components/list-cells";
import { Section } from "@/components/page";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";

/** A confirmed schedule remains visible after the Agreement is paid in full. Pending notes never enter these figures. */
export const MonthlyPayments = ({
  allocation,
}: {
  allocation: MonthlyPaymentAllocation | null;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  if (!allocation) {
    return null;
  }
  return (
    <Section description={t("payments.hint")} title={t("payments.title")}>
      <div className="flex flex-col gap-4">
        <SummaryFigures
          figures={[
            {
              label: t("payments.cattle"),
              value: asMoney(allocation.cattlePaidMoney),
              hint: `${t("payments.left")}: ${asMoney(allocation.cattleRequiredMoney - allocation.cattlePaidMoney)}`,
            },
            {
              label: t("payments.monthlyTotal"),
              value: asMoney(allocation.monthlyPaidMoney),
              hint: t("payments.includesPaidAhead", {
                amount: asMoney(allocation.paidAheadMoney),
              }),
            },
            {
              label: t("payments.balance"),
              value: asMoney(allocation.owedMoney),
            },
          ]}
          hintsOnPhone
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="text-muted-foreground mb-2 text-left">
              {t("payments.schedule")}
            </caption>
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left font-medium">
                  {t("payments.dueOn")}
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  {t("payments.paid")}
                </th>
                <th className="py-2 text-right font-medium">
                  {t("payments.left")}
                </th>
              </tr>
            </thead>
            <tbody>
              {allocation.sums.map((one) => (
                <tr className="border-b last:border-0" key={one.dueOn}>
                  <th className="py-3 text-left font-normal">
                    <SaidDate at={one.dueOn} />
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {asMoney(one.amountMoney)}
                    </span>
                  </th>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {asMoney(one.paidMoney)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {asMoney(one.leftMoney)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
};
