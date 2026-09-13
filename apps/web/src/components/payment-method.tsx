import type { PaymentMethod } from "@OpenFarm/domain";
import { PAYMENT_METHODS } from "@OpenFarm/domain";
import { Label } from "@OpenFarm/ui/components/label";

import { useLanguage } from "@/i18n/language-provider";

const WORD_FOR = {
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
        className="bg-background h-9 w-full rounded-md border px-2 text-sm"
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
            {t(WORD_FOR[method])}
          </option>
        ))}
      </select>
    </div>
  );
};
