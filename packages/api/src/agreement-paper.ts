import { createHash } from "node:crypto";

import type {
  FarmIdentity,
  Nominee,
  PaperDocument,
  TemplateContent,
} from "@OpenFarm/domain";
import { paperFrom, wordingFor } from "@OpenFarm/domain";

import { paperNominees } from "./nomination-store";
import { paperInvestor, paperValues } from "./paper-values";
import type { VentureRow } from "./venture-store";
import { paidForBy } from "./venture-store";

/** The terms an Investment Agreement is laid out from: what the Owner means to sign, or to offer, on. */
export interface AgreementTerms {
  units: number;
  investorsPercent: number;
  arbitrator: string;
}

/**
 * মুদারাবা বিনিয়োগ চুক্তি — one Investor's Investment Agreement for one Venture, laid out in the wording given, from the
 * terms, naming the Nominees given, each judged a minor or not on the day it is laid out. The target window is the
 * Venture's, as signing copies it. Paid by the month, the clauses the advisers approved for it and its schedule; on any
 * other Venture, neither. Printed to sign on stamped paper, or kept as the paper an Investor agrees to in the app.
 */
export const agreementLaidOut = ({
  farm,
  ownerName,
  run,
  him,
  nominees,
  terms,
  wording,
  today,
  producedAt,
}: {
  farm: FarmIdentity & { windUpDays: number };
  ownerName: string;
  run: Pick<
    VentureRow,
    | "name"
    | "unitPriceBdt"
    | "targetWindowStart"
    | "targetWindowEnd"
    | "capitalPaid"
    | "cattlePartBdt"
    | "monthlySums"
    | "firstSumDueOn"
  >;
  him: {
    name: string;
    phone: string;
    address: string | null;
    nid: string | null;
  };
  nominees: readonly Nominee[];
  terms: AgreementTerms;
  wording: TemplateContent;
  today: string;
  producedAt: string;
}): PaperDocument => {
  const investor = paperInvestor(
    him,
    paperNominees({ nominees: [...nominees] }, today)
  );
  const { monthly } = paidForBy(run);
  return paperFrom(wordingFor(wording, { paidByTheMonth: monthly !== null }), {
    kind: "investment_agreement",
    parties: { farm, ownerName, investors: [investor] },
    values: paperValues({
      farm,
      ownerName,
      him: investor,
      ventureName: run.name,
      units: terms.units,
      unitPriceBdt: run.unitPriceBdt,
      investorsPercent: terms.investorsPercent,
      windowStart: run.targetWindowStart,
      windowEnd: run.targetWindowEnd,
      windUpDays: farm.windUpDays,
      arbitrator: terms.arbitrator,
      monthly,
    }),
    producedBy: ownerName,
    producedAt,
  });
};

/** A value with every object's keys in order: the same paper, kept as jsonb and read back, writes out the same. */
const inKeyOrder = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(inKeyOrder);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([one], [other]) => one.localeCompare(other, "en"))
        .map(([key, inner]) => [key, inKeyOrder(inner)])
    );
  }
  return value;
};

/** A paper's fingerprint: what an Investor read is the paper kept only when the two agree. Taken over the paper with its
 *  keys in order, as the database keeps it in an order of its own. */
export const paperHashOf = (paper: PaperDocument): string =>
  createHash("sha256")
    .update(JSON.stringify(inKeyOrder(paper)))
    .digest("hex");
