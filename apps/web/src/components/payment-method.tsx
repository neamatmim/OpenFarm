import type { PaymentMethod } from "@OpenFarm/domain";
import { PAYMENT_METHODS } from "@OpenFarm/domain";
import { Label } from "@OpenFarm/ui/components/label";

import { useLanguage } from "@/i18n/language-provider";

/** How each way of paying is said to the reader. */
export const PAYMENT_METHOD_WORD = {
  cash: "money.method.cash",
  bkash: "money.method.bkash",
  bank: "money.method.bank",
} as const satisfies Record<PaymentMethod, string>;

/** How the money changed hands, asked on every record that carries money. Cash unless somebody says. */
export const PaymentMethodField = ({
  id,
  onChange,
  value,
}: {
  id: string;
  onChange: (method: PaymentMethod) => void;
  value: PaymentMethod;
}) => {
  const { t } = useLanguage();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{t("money.paidBy")}</Label>
      <select
        className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
        id={id}
        onChange={(event) =>
          onChange(
            PAYMENT_METHODS.find((method) => method === event.target.value) ??
              "cash"
          )
        }
        value={value}
      >
        {PAYMENT_METHODS.map((method) => (
          <option key={method} value={method}>
            {t(PAYMENT_METHOD_WORD[method])}
          </option>
        ))}
      </select>
    </div>
  );
};
