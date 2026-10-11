import type { MonthlySum } from "@OpenFarm/domain";
import {
  capitalItMayHold,
  roundMoney,
  sumsStandingOf,
  takesCapital,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import type { VentureAccount, VentureRow } from "./venture-store";
import { accountOf, paidForBy, takenAgainst } from "./venture-store";

// How to pay (ADR 0008): what an invited Investor's own signed Agreement tells them while its capital is still owed —
// where to pay, how much is left, the Pay-in Code to write on the transfer and the day the farm decides by. Never
// beside a Venture they have not signed for, where bank details would read as "pay here to join".

/** "How to pay" on one Agreement, while it is owed anything; the account is null until the Owner has written it. */
export interface HowToPay {
  owedMoney: number;
  payInCode: string;
  decideBy: string;
  account: VentureAccount | null;
  /** What is due and the next unpaid installment, including while gathering cattle capital. */
  monthly: { dueMoney: number; next: MonthlySum | null } | null;
}

/**
 * What one Agreement still owes and where it is paid, or nothing once its capital is all in — or once its Venture takes
 * no more: one paid before buying once it leaves Open, one paid by the month once it starts selling.
 * Owed is the signed price less confirmed receipts. Pending Investor notes never count as received money.
 */
export const howToPay = async (
  db: Pick<Tx, "query">,
  farmId: string,
  agreementId: string,
  run: Pick<
    VentureRow,
    | "state"
    | "capitalPaid"
    | "unitPriceMoney"
    | "cattlePartMoney"
    | "monthlySums"
    | "firstSumDueOn"
    | "decideBy"
    | "accountBank"
    | "accountBranch"
    | "accountName"
    | "accountNumber"
    | "accountRoutingNumber"
  >,
  /** The farm day, which the Monthly Sums are due by. */
  today: string
): Promise<HowToPay | null> => {
  if (!takesCapital(run)) {
    return null;
  }
  const agreement = await db.query.investmentAgreement.findFirst({
    where: { id: agreementId, farmId },
    columns: { units: true, payInCode: true },
  });
  if (!agreement) {
    return null;
  }
  const paidMoney = await takenAgainst(db, farmId, agreementId);
  const owedMoney = roundMoney(
    capitalItMayHold(agreement.units, run) - paidMoney
  );
  if (owedMoney <= 0) {
    return null;
  }
  const { monthly } = paidForBy(run);
  const standing = monthly
    ? sumsStandingOf({
        units: agreement.units,
        unitPriceMoney: run.unitPriceMoney,
        monthly,
        paidMoney,
        today,
      })
    : null;
  return {
    owedMoney,
    payInCode: agreement.payInCode,
    decideBy: run.decideBy,
    account: accountOf(run),
    monthly: standing
      ? { dueMoney: standing.dueMoney, next: standing.next }
      : null,
  };
};
