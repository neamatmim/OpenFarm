import { hasEnded } from "@OpenFarm/domain";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Landmark } from "lucide-react";

import { MORE_LINK } from "@/components/home/queue";
import type { TheirAgreements } from "@/components/investors/investor-agreements";
import { Notice } from "@/components/page";
import { usePortalPlaces } from "@/components/portal/portal-source";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";

type HisAgreement = TheirAgreements["agreements"][number];

/** One Agreement's capital not yet in: what its Units promised, less what the Farm holds on it. */
const owedOn = (one: HisAgreement) =>
  hasEnded(one.venture.state)
    ? 0
    : Math.max(0, one.promisedBdt - one.capitalHeldBdt);

/** One line for a Venture they still owe capital on, leading to its page, where the Venture Account is. */
const OwedLine = ({ one }: { one: HisAgreement }) => {
  const { t } = useLanguage();
  const taka = useTaka();
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
        taka: taka(owedOn(one)),
        venture: one.venture.name,
      })}
      tone="info"
    />
  );
};

/**
 * The capital they have signed for and not yet paid, a line a Venture, where they read their money — not only on the
 * Venture's own page, where how to pay is said in full. Nothing once it is all in, or for a Venture that has ended.
 */
export const StillToPay = ({ theirs }: { theirs: TheirAgreements }) => {
  const owing = theirs.agreements.filter((one) => owedOn(one) > 0);
  if (owing.length === 0) {
    return null;
  }
  return (
    <>
      {owing.map((one) => (
        <OwedLine key={one.id} one={one} />
      ))}
    </>
  );
};
