import type { Tx } from "./audit";

/** The Ventures whose Investors still count against the cap: everything but settled and called off. */
const STILL_RUNNING = ["open", "buying", "fattening", "selling"] as const;

/** Whether this Farm has written this person down already: the same name on the same phone is the same
 *  person, however many Ventures they have joined. */
export const theSamePerson = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  person: { name: string; phone: string }
) => {
  const row = await tx.query.investor.findFirst({
    where: { farmId, name: person.name, phone: person.phone },
    columns: { id: true, retiredAt: true },
  });
  return row ?? null;
};

/** One Investor as the trail records them, and their nominee. */
export const readInvestor = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.investor.findFirst({ where: { id, farmId } });
  return row
    ? {
        name: row.name,
        phone: row.phone,
        address: row.address,
        nid: row.nid,
        bankAccount: row.bankAccount,
        nominee: row.nomineeName,
        nomineePhone: row.nomineePhone,
        nomineeRelation: row.nomineeRelation,
        retiredAt: row.retiredAt,
      }
    : null;
};

/**
 * Who is in, and how much of each Venture they hold. Counted across every Venture that is not settled or
 * called off, because the law counts people in a business for gain, not people in one run of it — and the
 * Owner counts among them when her own money is in.
 */
export const countedInvestors = async (
  tx: Pick<Tx, "query">,
  farmId: string
): Promise<{ standing: number; unitsOf: Map<string, number> }> => {
  const running = await tx.query.venture.findMany({
    where: { farmId, state: { in: [...STILL_RUNNING] } },
    columns: { id: true },
  });
  const ids = running.map((one) => one.id);
  if (ids.length === 0) {
    return { standing: 0, unitsOf: new Map() };
  }
  const signed = await tx.query.investmentAgreement.findMany({
    where: { farmId, ventureId: { in: ids } },
    columns: { investorId: true, units: true },
  });
  const unitsOf = new Map<string, number>();
  for (const one of signed) {
    unitsOf.set(one.investorId, (unitsOf.get(one.investorId) ?? 0) + one.units);
  }
  return { standing: unitsOf.size, unitsOf };
};

/** What the Farm keeps of the profit: everything the Investors do not take. Worked out from the one
 *  percentage the Agreement stores, so the two halves can never be written down disagreeing. */
export const theFarmsShare = (investorsPercent: number) =>
  100 - investorsPercent;

/** The Units of a Venture that are already spoken for. */
export const unitsTaken = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
): Promise<number> => {
  const signed = await tx.query.investmentAgreement.findMany({
    where: { farmId, ventureId },
    columns: { units: true },
  });
  return signed.reduce((sum, one) => sum + one.units, 0);
};

/** One Agreement as the trail records it: what was taken, on what terms, and against what paper. */
export const readAgreement = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.investmentAgreement.findFirst({
    where: { id, farmId },
  });
  if (!row) {
    return null;
  }
  const paper = await tx.query.agreementPaper.findFirst({
    where: { agreementId: id },
    columns: { updatedAt: true },
  });
  return {
    ventureId: row.ventureId,
    investorId: row.investorId,
    units: row.units,
    investorsPercent: row.investorsPercent,
    farmPercent: theFarmsShare(row.investorsPercent),
    targetWindow: { start: row.targetWindowStart, end: row.targetWindowEnd },
    arbitrator: row.arbitrator,
    stamp: {
      kind: row.stampKind,
      valueBdt: row.stampValueBdt,
      on: row.stampedOn,
      serial: row.stampSerial,
    },
    paperKeptAt: paper?.updatedAt ?? null,
  };
};
