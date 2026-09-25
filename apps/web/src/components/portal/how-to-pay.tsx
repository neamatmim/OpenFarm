import type { Language } from "@OpenFarm/i18n";
import { translate } from "@OpenFarm/i18n";
import { ShieldAlert } from "lucide-react";

import { SaidDate } from "@/components/list-cells";
import { Section } from "@/components/page";
import { useTheirRecord } from "@/components/portal/portal-source";
import { VentureAccountDetails } from "@/components/ventures/venture-account-details";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { orpc } from "@/utils/orpc";

/** "How to pay" on one of their Agreements, as the portal reads it. */
type Paying = NonNullable<
  Awaited<ReturnType<typeof orpc.portal.venture.call>>["howToPay"]
>;

/** The language the warning is said in a second time. */
const OTHER_LANGUAGE = { bn: "en", en: "bn" } as const satisfies Record<
  Language,
  Language
>;

/**
 * That the farm only ever asks them to pay into the Venture Account on this page, and to call the farm if anybody
 * gives them another — or, with none written yet, that the farm will say where, here. Said in their language and again
 * in the other, because a message saying "our account has changed" is how an Investor's money is taken, and it may
 * come in either.
 */
const TheWarning = ({
  hasAccount,
  phone,
}: {
  hasAccount: boolean;
  phone: string | null;
}) => {
  const { language } = useLanguage();
  const said = (lang: Language) => {
    const only = translate(
      lang,
      hasAccount ? "portal.pay.onlyThisAccount" : "portal.pay.onlyThisPage"
    );
    const call = phone
      ? translate(lang, "portal.pay.callTheFarm", { phone })
      : translate(lang, "portal.pay.callTheFarmNoPhone");
    return `${only} ${call}`;
  };
  const other = OTHER_LANGUAGE[language];
  return (
    <div className="border-warning/35 bg-warning-surface/40 flex items-start gap-2 rounded-md border p-3 text-sm">
      <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{said(language)}</p>
        <p lang={other}>{said(other)}</p>
      </div>
    </div>
  );
};

/**
 * How to pay, on an Investor's own signed Agreement while its capital is owed (ADR 0008): the Venture Account, what
 * is still owed, their Pay-in Code to write on the transfer, and the day the farm decides by — or, with no account
 * written yet, that the farm will say where. Always with the warning, in both languages. Nothing is paid here: the
 * portal only says where.
 */
export const HowToPay = ({ paying }: { paying: Paying | null }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const me = useTheirRecord();
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
          <VentureAccountDetails
            account={account}
            className="bg-muted/50 rounded-lg p-3"
          />
        ) : (
          <p className="bg-muted/50 rounded-lg p-3 text-sm font-medium">
            {t("portal.pay.noAccount")}
          </p>
        )}
        <TheWarning hasAccount={account !== null} phone={phone} />
      </div>
    </Section>
  );
};
