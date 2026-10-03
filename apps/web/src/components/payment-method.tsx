import type { PaymentMethod } from "@OpenFarm/domain";
import { PAYMENT_METHODS } from "@OpenFarm/domain";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useQuery } from "@tanstack/react-query";

import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** How each way of paying is said to the reader. */
export const PAYMENT_METHOD_WORD = {
  cash: "money.method.cash",
  bkash: "money.method.bkash",
  bank: "money.method.bank",
} as const satisfies Record<PaymentMethod, string>;

/** Which Farm Account bKash or bank money named, and its transaction ID, as a form holds them while it is typed. */
export interface AccountTyped {
  farmAccountId: string;
  reference: string;
}

export const NO_ACCOUNT: AccountTyped = { farmAccountId: "", reference: "" };

/** What a form sends of the Farm Account it named: nothing for cash, and nothing left empty. */
export const accountSent = (
  method: PaymentMethod,
  typed: AccountTyped
): { farmAccountId?: string; reference?: string } =>
  method === "cash"
    ? {}
    : {
        ...(typed.farmAccountId ? { farmAccountId: typed.farmAccountId } : {}),
        ...(typed.reference.trim()
          ? { reference: typed.reference.trim() }
          : {}),
      };

/**
 * Which of the Farm's own accounts of a kind — its bKash numbers, or its bank accounts — by name and last digits.
 * Nothing at all where the Farm has listed none of that kind: there is nothing to name until the Owner lists one.
 */
export const FarmAccountField = ({
  id,
  kind,
  value,
  onChange,
}: {
  id: string;
  kind: "bkash" | "bank";
  value: string;
  onChange: (farmAccountId: string) => void;
}) => {
  const { t } = useLanguage();
  const listed = useQuery(orpc.farmAccounts.list.queryOptions());
  const open = (listed.data ?? []).filter(
    (one) => one.kind === kind && !one.retired
  );
  if (open.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{t("money.whichAccount")}</Label>
      <select
        className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{t("money.chooseAccount")}</option>
        {open.map((one) => (
          <option key={one.id} value={one.id}>
            {one.name} · {one.number.slice(-4)}
          </option>
        ))}
      </select>
    </div>
  );
};

/** How the money changed hands, asked on every record that carries money. Cash unless somebody says. On bKash or the
 *  bank, and where the form keeps one, which Farm Account and its transaction ID. */
export const PaymentMethodField = ({
  id,
  onChange,
  value,
  account,
  row = false,
}: {
  id: string;
  onChange: (method: PaymentMethod) => void;
  value: PaymentMethod;
  /** The Farm Account and reference, for a form that sends them. */
  account?: { typed: AccountTyped; onChange: (typed: AccountTyped) => void };
  /** In a wide form, the method, the account and its transaction ID side by side, as boxes of the grid around it,
   *  rather than one under another. */
  row?: boolean;
}) => {
  const { t } = useLanguage();
  const named = value !== "cash" && account;
  return (
    <div className={row ? "contents" : "space-y-1"}>
      <div className={row ? "space-y-1" : "contents"}>
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
      {named ? (
        <div className={row ? "contents" : "grid gap-2 pt-1"}>
          <FarmAccountField
            id={`${id}-account`}
            kind={value === "bkash" ? "bkash" : "bank"}
            onChange={(farmAccountId) =>
              account.onChange({ ...account.typed, farmAccountId })
            }
            value={account.typed.farmAccountId}
          />
          <div className="space-y-1">
            <Label htmlFor={`${id}-reference`}>{t("money.reference")}</Label>
            <Input
              id={`${id}-reference`}
              maxLength={80}
              onChange={(event) =>
                account.onChange({
                  ...account.typed,
                  reference: event.target.value,
                })
              }
              value={account.typed.reference}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};
