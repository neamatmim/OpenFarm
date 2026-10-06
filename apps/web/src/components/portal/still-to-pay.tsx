import { cn } from "@OpenFarm/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Landmark } from "lucide-react";

import { MORE_LINK } from "@/components/home/queue";
import type { TheirAgreements } from "@/components/investors/investor-agreements";
import { Notice } from "@/components/page";
import { usePortalPlaces } from "@/components/portal/portal-source";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { owingOn } from "@/lib/still-to-pay";

type HisAgreement = TheirAgreements["agreements"][number];

/** One line for a Venture they still owe capital on, leading to its page, where the Venture Account is. */
const OwedLine = ({ one, amount }: { one: HisAgreement; amount: number }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const { to, params } = usePortalPlaces().venture(one.id).link;
  return (
    <Notice
      action={
        <Link className={cn(MORE_LINK, "text-sm")} params={params} to={to}>
          {t("portal.owed.how")}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      }
      icon={Landmark}
      title={t("portal.owed.line", {
        amount: asMoney(amount),
        venture: one.venture.name,
      })}
      tone="info"
    />
  );
};

/** A sum a Venture no longer takes: said as not paid, their share by what they paid — and nothing to pay it by. */
const NotPaidLine = ({
  one,
  amount,
}: {
  one: HisAgreement;
  amount: number;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  return (
    <Notice
      icon={Landmark}
      title={t("portal.owed.notPaid", {
        amount: asMoney(amount),
        venture: one.venture.name,
      })}
      tone="info"
    />
  );
};

/**
 * The capital they have signed for and not yet paid, a line a Venture, where they read their money — not only on the
 * Venture's own page, where how to pay is said in full. Once the Venture takes no more, what was not paid is said
 * without a way to pay it. Nothing once it is all in, or for a Venture that has ended.
 */
export const StillToPay = ({ theirs }: { theirs: TheirAgreements }) => {
  const owing = theirs.agreements.flatMap((one) => {
    const owed = owingOn(one);
    return owed ? [{ one, owed }] : [];
  });
  if (owing.length === 0) {
    return null;
  }
  return (
    <>
      {owing.map(({ one, owed }) =>
        owed.kind === "to_pay" ? (
          <OwedLine amount={owed.amountMoney} key={one.id} one={one} />
        ) : (
          <NotPaidLine amount={owed.amountMoney} key={one.id} one={one} />
        )
      )}
    </>
  );
};
