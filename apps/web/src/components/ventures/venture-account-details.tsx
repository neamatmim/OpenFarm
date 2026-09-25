import type { MessageKey } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";

import { useLanguage } from "@/i18n/language-provider";
import type { Venture } from "@/lib/ventures";

/** The Venture Account's bank details, as the Owner wrote them. */
export type VentureAccount = NonNullable<Venture["account"]>;

/**
 * Each detail of the Venture Account and its name, in the order a bank's own paper puts them. Every detail the account
 * has, so one added to it is a compiler error here until it is named — and the Owner's form and a signed Investor's
 * "how to pay" both read this one list.
 */
export const ACCOUNT_DETAILS = {
  bank: "ventures.account.bank",
  branch: "ventures.account.branch",
  accountName: "ventures.account.name",
  accountNumber: "ventures.account.number",
  routingNumber: "ventures.account.routing",
} as const satisfies Record<keyof VentureAccount, MessageKey>;

/** The details in that order. */
export const ACCOUNT_DETAIL_KEYS = Object.keys(
  ACCOUNT_DETAILS
) as (keyof VentureAccount)[];

/** The Venture Account's details, each under its name; one not written yet — a branch, a routing number — is left out. */
export const VentureAccountDetails = ({
  account,
  className,
}: {
  account: VentureAccount;
  className?: string;
}) => {
  const { t } = useLanguage();
  return (
    <dl
      className={cn("grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2", className)}
    >
      {ACCOUNT_DETAIL_KEYS.map((key) =>
        account[key] ? (
          <div className="flex flex-col" key={key}>
            <dt className="text-muted-foreground">{t(ACCOUNT_DETAILS[key])}</dt>
            <dd className="font-medium break-words">{account[key]}</dd>
          </div>
        ) : null
      )}
    </dl>
  );
};
