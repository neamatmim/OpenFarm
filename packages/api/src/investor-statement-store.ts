import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";

/** The terms one Agreement froze at signing: what he agreed to, which is not what the Venture says today. */
export interface HisAgreement {
  id: string;
  units: number;
  investorsPercent: number;
  targetWindowStart: string;
  targetWindowEnd: string;
  arbitrator: string;
  stampValueBdt: number;
  stampedOn: string;
  stampSerial: string;
}

/**
 * One movement of his own capital through the Venture Account: what moved, which way, the day the bank
 * moved it, and the reference it went on — the four things that let him hold a paper beside his own bank
 * statement and find the same lines.
 *
 * Both ways, because a Venture that missed its Floor is cancelled and every taka goes back: a sheet
 * showing only what came in would tell a man the Farm holds money it has already returned.
 */
export interface HisCapital {
  kind: "received" | "returned";
  amountBdt: number;
  movedOn: string;
  reference: string;
}

/** Him, as a paper addresses him, and the person his family would come to the farm about. */
export interface HimAndHisNominee {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  nid: string | null;
  nominee: {
    name: string;
    phone: string | null;
    relation: string | null;
  } | null;
}

/** The Venture a paper is about, as a paper says it. */
export interface TheVenture {
  id: string;
  name: string;
  unitPriceBdt: number;
}

/** Everything a paper may print about one man on one Venture, and nothing about anybody else. */
export interface HisStanding {
  venture: TheVenture;
  him: HimAndHisNominee;
  agreement: HisAgreement;
  capital: HisCapital[];
  /** What the Farm holds of his: received less returned. */
  capitalBdt: number;
}

const noSuchAgreement = () =>
  new ORPCError("NOT_FOUND", {
    message: "No such agreement",
    data: { refusal: "no_such_agreement" },
  });

/**
 * One Agreement's standing: the Venture, the man, what his paper froze, and every taka of his that has
 * moved either way — narrowed to him before anything is assembled.
 *
 * Every existing reading of a Venture is Venture-shaped: `ventures.agreements` and `ventures.movements`
 * hand back every Agreement and every movement on the run, and a Settlement's payout rows carry every
 * Investor's name. A statement assembled from those would be one careless `.filter` away from sending a
 * man his neighbour's money, and a payload that reached a browser holding it has left the farm whatever
 * the paper printed. So the narrowing happens here, in the one place the three papers read through, and
 * what comes back was never wider than the man it is for (CONTEXT: Investor Statement).
 *
 * Keyed on the **Agreement**, which is the paper the money was signed for. One man holds one Agreement per
 * Venture today — `investment_agreement_uidx` is unique on (venture, investor) — so this is unambiguous
 * now, and stays unambiguous if that index is ever loosened.
 */
export const hisStanding = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  agreementId: string
): Promise<HisStanding> => {
  const agreement = await tx.query.investmentAgreement.findFirst({
    where: { id: agreementId, farmId },
  });
  if (!agreement) {
    throw noSuchAgreement();
  }
  // Three reads rather than a join, as `ventures.agreements` does it: an Agreement declares no relations.
  const [venture, investor] = await Promise.all([
    tx.query.venture.findFirst({
      where: { id: agreement.ventureId, farmId },
      columns: { id: true, name: true, unitPriceBdt: true },
    }),
    tx.query.investor.findFirst({
      where: { id: agreement.investorId, farmId },
    }),
  ]);
  if (!(venture && investor)) {
    throw noSuchAgreement();
  }
  // His own capital, asked for by his Agreement: a Float or a Reimbursement is the Venture's money and no
  // Investor's, and another man's capital is none of his business. Refunds as well as what came in — a
  // cancelled Venture sends every taka back, and those movements carry his Agreement too.
  const moved = await tx.query.ventureMovement.findMany({
    where: {
      farmId,
      ventureId: venture.id,
      agreementId,
      kind: { in: ["capital_in", "refund"] },
    },
    columns: { kind: true, amountBdt: true, movedOn: true, reference: true },
    orderBy: { movedOn: "asc", id: "asc" },
  });
  const capital: HisCapital[] = moved.map((one) => ({
    kind: one.kind === "refund" ? "returned" : "received",
    amountBdt: Number(one.amountBdt),
    movedOn: one.movedOn,
    reference: one.reference,
  }));
  return {
    venture: {
      id: venture.id,
      name: venture.name,
      unitPriceBdt: Number(venture.unitPriceBdt),
    },
    him: {
      id: investor.id,
      name: investor.name,
      phone: investor.phone,
      address: investor.address,
      nid: investor.nid,
      nominee: investor.nomineeName
        ? {
            name: investor.nomineeName,
            phone: investor.nomineePhone,
            relation: investor.nomineeRelation,
          }
        : null,
    },
    agreement: {
      id: agreement.id,
      units: agreement.units,
      investorsPercent: agreement.investorsPercent,
      targetWindowStart: agreement.targetWindowStart,
      targetWindowEnd: agreement.targetWindowEnd,
      arbitrator: agreement.arbitrator,
      stampValueBdt: Number(agreement.stampValueBdt),
      stampedOn: agreement.stampedOn,
      stampSerial: agreement.stampSerial,
    },
    capital,
    capitalBdt: capital.reduce(
      (sum, one) =>
        sum + (one.kind === "returned" ? -one.amountBdt : one.amountBdt),
      0
    ),
  };
};

/**
 * Refuses a paper acknowledging money the Farm does not hold.
 *
 * Two ways that happens and they are different news: nothing has arrived yet, and there is simply nothing
 * to acknowledge; or it arrived and went back, because the Venture was called off. Either way a sheet
 * saying the Farm holds his capital would be the Farm telling a man something untrue about his own money.
 */
export const assertCapitalHeld = (standing: HisStanding) => {
  if (standing.capital.length === 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "No capital has arrived against that agreement yet",
      data: { refusal: "no_capital_yet" },
    });
  }
  if (standing.capitalBdt <= 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That agreement's capital has been refunded",
      data: { refusal: "capital_returned" },
    });
  }
};
