import type { MessageKey } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";

import { SaidDate } from "@/components/list-cells";
import { Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

/** "How to pay" on one of their Agreements, as the portal reads it. */
type Paying = NonNullable<
  Awaited<ReturnType<typeof orpc.portal.venture.call>>["howToPay"]
>;

/** The Venture Account's details, each under its own name, in the order a bank's own paper puts them. */
const ACCOUNT_LINES = [
  { key: "bank", label: "ventures.account.bank" },
  { key: "branch", label: "ventures.account.branch" },
  { key: "accountName", label: "ventures.account.name" },
  { key: "accountNumber", label: "ventures.account.number" },
  { key: "routingNumber", label: "ventures.account.routing" },
] as const satisfies readonly {
  key: keyof NonNullable<Paying["account"]>;
  label: MessageKey;
}[];

/**
 * How to pay, on an Investor's own signed Agreement while its capital is owed (ADR 0008): the Venture Account, what
 * is still owed, their Pay-in Code to write on the transfer, and the day the farm decides by — or, with no account
 * written yet, that the farm will say where. Always with the warning that the farm only ever asks them to pay into
 * the account on this page, because a message saying "our account has changed" is how an Investor's money is taken.
 * Nothing is paid here: the portal only says where.
 */
export const HowToPay = ({ paying }: { paying: Paying | null }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const me = useQuery(orpc.portal.me.queryOptions());
  if (!paying) {
    return null;
  }
  const phone = me.data?.farm?.phone ?? null;
  const { account } = paying;
  return (
    <Section description={t("portal.pay.hint")} title={t("portal.pay.title")}>
      <div className="flex flex-col gap-4">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-sm">
              {t("portal.pay.owed")}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">
              {taka(paying.owedBdt)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-sm">
              {t("portal.pay.code")}
            </dt>
            <dd className="font-mono text-lg font-semibold tracking-wide">
              {paying.payInCode}
            </dd>
            <dd className="text-muted-foreground text-xs">
              {t("portal.pay.codeHint")}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-sm">
              {t("portal.pay.decideBy")}
            </dt>
            <dd className="text-lg font-semibold">
              <SaidDate at={paying.decideBy} />
            </dd>
          </div>
        </dl>
        {account ? (
          <dl className="bg-muted/50 grid gap-x-6 gap-y-2 rounded-lg p-3 text-sm sm:grid-cols-2">
            {ACCOUNT_LINES.map((line) =>
              account[line.key] ? (
                <div className="flex flex-col" key={line.key}>
                  <dt className="text-muted-foreground">{t(line.label)}</dt>
                  <dd className="font-medium break-words">
                    {account[line.key]}
                  </dd>
                </div>
              ) : null
            )}
          </dl>
        ) : (
          <p className="bg-muted/50 rounded-lg p-3 text-sm font-medium">
            {t("portal.pay.noAccount")}
          </p>
        )}
        <p className="border-warning/35 bg-warning-surface/40 flex items-start gap-2 rounded-md border p-3 text-sm">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {phone
              ? t("portal.pay.warning", { phone })
              : t("portal.pay.warningNoPhone")}
          </span>
        </p>
      </div>
    </Section>
  );
};
