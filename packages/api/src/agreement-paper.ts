import type {
  FarmIdentity,
  Nominee,
  PaperDocument,
  Said,
  TemplateContent,
} from "@OpenFarm/domain";
import { paperFrom, wordingFor } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { nominationsInForceFor, paperNominees } from "./nomination-store";
import type { InvestorOnPaper } from "./paper-values";
import { paperInvestor, paperValues } from "./paper-values";
import type { VentureRow } from "./venture-store";
import { paidForBy, windUpDaysOf } from "./venture-store";

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
  farmUnits = 0,
  inTheApp = false,
}: {
  farm: FarmIdentity & { windUpDays: number };
  ownerName: string;
  run: Pick<
    VentureRow,
    | "name"
    | "units"
    | "unitPriceMoney"
    | "targetWindowStart"
    | "targetWindowEnd"
    | "capitalPaid"
    | "cattlePartMoney"
    | "monthlySums"
    | "firstSumDueOn"
    | "windUpDays"
  >;
  /** The Investor's row as the farm holds it: a person, or an Organization and its Signatory. */
  him: InvestorOnPaper;
  nominees: readonly Nominee[];
  terms: AgreementTerms;
  wording: TemplateContent;
  today: string;
  producedAt: Said;
  /** The Farm's own Units in the Venture: told to every Investor before they sign, where it holds any. */
  farmUnits?: number;
  /** Kept to be agreed in the app rather than printed to sign: how it is agreed in place of the signature boxes. */
  inTheApp?: boolean;
}): PaperDocument => {
  const investor = paperInvestor(
    him,
    paperNominees({ nominees: [...nominees] }, today)
  );
  const { monthly } = paidForBy(run);
  const farmCapital =
    farmUnits > 0 ? { farmUnits, ventureUnits: run.units } : null;
  return paperFrom(
    wordingFor(wording, {
      paidByTheMonth: monthly !== null,
      farmCapital: farmCapital !== null,
      organization: Boolean(investor.organization),
    }),
    {
      kind: "investment_agreement",
      parties: { farm, ownerName, investors: [investor] },
      values: paperValues({
        farm,
        ownerName,
        him: investor,
        ventureName: run.name,
        units: terms.units,
        unitPriceMoney: run.unitPriceMoney,
        investorsPercent: terms.investorsPercent,
        windowStart: run.targetWindowStart,
        windowEnd: run.targetWindowEnd,
        // The Venture's own once its first Investor has signed, frozen then; the farm's until it is: a second Investor's
        // paper said 45 days while the Venture, and the first man's paper, ran on 30.
        windUpDays: windUpDaysOf(run, farm),
        arbitrator: terms.arbitrator,
        monthly,
        farmCapital,
      }),
      producedBy: ownerName,
      producedAt,
      inTheApp,
    }
  );
};

/** The terms an Amendment moves an Agreement's to, and why. */
export interface AmendmentTerms {
  investorsPercent: number;
  targetWindowStart: string;
  targetWindowEnd: string;
  reason: string;
}

/**
 * সংশোধনী — the Amendment for a Venture, laid out in the wording given from the terms it moves every Agreement on it
 * to, naming every Investor signed on it with the Nominees in force for each: one paper, as an Amendment is. The day it
 * was signed is left blank where none is given yet. Refused with nobody signed.
 */
export const amendmentLaidOut = async (
  db: Pick<Tx, "query">,
  {
    farm,
    ownerName,
    ventureId,
    terms,
    amendedOn,
    wording,
    today,
    producedAt,
    inTheApp = false,
  }: {
    farm: FarmIdentity & { id: string };
    ownerName: string;
    ventureId: string;
    terms: AmendmentTerms;
    amendedOn?: string;
    wording: TemplateContent;
    today: string;
    producedAt: Said;
    /** Kept to be agreed in the app rather than printed to sign. */
    inTheApp?: boolean;
  }
): Promise<{ document: PaperDocument; run: { id: string; name: string } }> => {
  const run = await db.query.venture.findFirst({
    where: { id: ventureId, farmId: farm.id },
    columns: { id: true, name: true },
  });
  if (!run) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  // Every Investor signs it; the Farm's own Units move with them, and sign nothing with the Farm.
  const signed = await db.query.investmentAgreement.findMany({
    where: {
      farmId: farm.id,
      ventureId: run.id,
      stampKind: { ne: "farm_own" },
    },
    columns: { investorId: true },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  const investors = await db.query.investor.findMany({
    where: {
      farmId: farm.id,
      id: { in: signed.map((one) => one.investorId) },
    },
  });
  const inForce = await nominationsInForceFor(
    db,
    farm.id,
    investors.map((him) => him.id)
  );
  const [first, ...rest] = signed.flatMap((one) => {
    const row = investors.find((him) => him.id === one.investorId);
    return row
      ? [paperInvestor(row, paperNominees(inForce.get(row.id) ?? null, today))]
      : [];
  });
  if (!first) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Nobody has signed for this Venture yet",
      data: { refusal: "nobody_has_signed" },
    });
  }
  const document = paperFrom(wording, {
    kind: "agreement_amendment",
    parties: { farm, ownerName, investors: [first, ...rest] },
    values: paperValues({
      farm,
      ownerName,
      ventureName: run.name,
      investorsPercent: terms.investorsPercent,
      windowStart: terms.targetWindowStart,
      windowEnd: terms.targetWindowEnd,
      ...(amendedOn === undefined ? {} : { amendedOn }),
      reason: terms.reason,
    }),
    producedBy: ownerName,
    producedAt,
    inTheApp,
  });
  return { document, run };
};
