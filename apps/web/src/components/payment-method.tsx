import type { PaymentMethod } from "@OpenFarm/domain";
import { PAYMENT_METHODS } from "@OpenFarm/domain";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useQuery } from "@tanstack/react-query";

import { NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** How each way of paying is said to the reader. */
export const PAYMENT_METHOD_WORD = {
  cash: "money.method.cash",
  mobile_money: "money.method.mobile_money",
  bank: "money.method.bank",
} as const satisfies Record<PaymentMethod, string>;

/** Which Farm Account mobile money or bank money named, and its transaction ID, as a form holds them while it is typed. */
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
 * Which of the Farm's own accounts of a kind — its mobile money numbers, or its bank accounts — by name and last digits.
 * Nothing at all where the Farm has listed none of that kind: there is nothing to name until the Owner lists one.
 */
export const FarmAccountField = ({
  id,
  kind,
  value,
  onChange,
}: {
  id: string;
  kind: "mobile_money" | "bank";
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
      <NativeSelect
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
      </NativeSelect>
    </div>
  );
};

/** How the money changed hands, asked on every record that carries money. Cash unless somebody says. On mobile money or the
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
        <NativeSelect
          id={id}
          onChange={(event) => {
            const method =
              PAYMENT_METHODS.find((one) => one === event.target.value) ??
              "cash";
            // An account is of one kind: chosen for the bank, it is no mobile money number, so a change of method
            // lets go of it rather than sending one the farm refuses as not that kind.
            if (account && method !== value && account.typed.farmAccountId) {
              account.onChange({ ...account.typed, farmAccountId: "" });
            }
            onChange(method);
          }}
          value={value}
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {t(PAYMENT_METHOD_WORD[method])}
            </option>
          ))}
        </NativeSelect>
      </div>
      {named ? (
        <div className={row ? "contents" : "grid gap-2 pt-1"}>
          <FarmAccountField
            id={`${id}-account`}
            kind={value === "mobile_money" ? "mobile_money" : "bank"}
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
