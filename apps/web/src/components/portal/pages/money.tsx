import { Banknote, Landmark, Wallet } from "lucide-react";

import type { TheirAgreements } from "@/components/investors/investor-agreements";
import {
  InvestorMoney,
  portfolioOf,
} from "@/components/investors/investor-agreements";
import { Loaded, Page, PageHeader } from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { SummaryFigures } from "@/components/page-kit";
import { MoneySkeleton } from "@/components/portal/portal-skeletons";
import { useTheirPortfolio } from "@/components/portal/portal-source";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";

/** What the lines below come to, as a statement opens with its totals: what they paid in, what has come back to
 *  them, and what the farm holds of theirs now — the same sums their portfolio shows. */
const useTotals = (theirs: TheirAgreements): Figure[] => {
  const { t } = useLanguage();
  const taka = useTaka();
  const sums = portfolioOf(theirs);
  return [
    {
      label: t("portal.money.paidIn"),
      value: taka(sums.paidInBdt),
      icon: Landmark,
    },
    {
      label: t("portal.paidOut"),
      value: taka(sums.paidOutBdt),
      hint:
        sums.returnedBdt > 0
          ? t("portal.sums.returned", { bdt: taka(sums.returnedBdt) })
          : undefined,
      icon: Wallet,
    },
    {
      label: t("portal.heldNow"),
      value: taka(sums.heldBdt),
      icon: Banknote,
    },
  ];
};

/** Their totals over their ledger, once it is read. */
const TheirMoney = ({ theirs }: { theirs: TheirAgreements }) => (
  <>
    <SummaryFigures figures={useTotals(theirs)} hintsOnPhone />
    <InvestorMoney
      agreements={theirs.agreements}
      inThePortal
      movements={theirs.movements}
    />
  </>
);

/**
 * Every taka of theirs that moved — capital in, capital sent back, payouts — a place of its own in the portal, as
 * investor portals keep their transactions: what somebody opens after a payout to see it arrived. Its totals first.
 */
export const PortalMoney = () => {
  const { t } = useLanguage();
  const theirs = useTheirPortfolio();
  return (
    <Page>
      <PageHeader
        description={t("portal.money.hint")}
        title={t("portal.moneyTitle")}
      />
      <Loaded query={theirs} skeleton={<MoneySkeleton />}>
        {theirs.data ? <TheirMoney theirs={theirs.data} /> : null}
      </Loaded>
    </Page>
  );
};
