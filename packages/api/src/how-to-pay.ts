import type { Tx } from "./audit";
import type { VentureAccount, VentureRow } from "./venture-store";
import { accountOf, takenAgainst } from "./venture-store";

// How to pay (ADR 0008): what an invited Investor's own signed Agreement tells them while its capital is still owed —
// where to pay, how much is left, the Pay-in Code to write on the transfer and the day the farm decides by. Never
// beside a Venture they have not signed for, where bank details would read as "pay here to join".

/** "How to pay" on one Agreement, while it is owed anything; the account is null until the Owner has written it. */
export interface HowToPay {
  owedBdt: number;
  payInCode: string;
  decideBy: string;
  account: VentureAccount | null;
}

/**
 * What one Agreement still owes and where it is paid, or nothing once its capital is all in — or once its Venture has
 * left Open, which takes no more capital. Owed is the Agreement's Units at the Unit price, less the capital recorded
 * against it, counted as the capital form counts it before refusing a payment too many. The caller has already
 * narrowed the Agreement to the Investor asking.
 */
export const howToPay = async (
  db: Pick<Tx, "query">,
  farmId: string,
  agreementId: string,
  run: Pick<
    VentureRow,
    | "state"
    | "unitPriceBdt"
    | "decideBy"
    | "accountBank"
    | "accountBranch"
    | "accountName"
    | "accountNumber"
    | "accountRoutingNumber"
  >
): Promise<HowToPay | null> => {
  if (run.state !== "open") {
    return null;
  }
  const agreement = await db.query.investmentAgreement.findFirst({
    where: { id: agreementId, farmId },
    columns: { units: true, payInCode: true },
  });
  if (!agreement) {
    return null;
  }
  const owedBdt =
    agreement.units * run.unitPriceBdt -
    (await takenAgainst(db, farmId, agreementId));
  if (owedBdt <= 0) {
    return null;
  }
  return {
    owedBdt,
    payInCode: agreement.payInCode,
    decideBy: run.decideBy,
    account: accountOf(run),
  };
};
