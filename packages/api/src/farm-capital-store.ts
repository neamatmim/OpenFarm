import { uuidv7 } from "@OpenFarm/db/ids";
import { investmentAgreement, investor } from "@OpenFarm/db/schema/venture";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { Context } from "./context";
import { nextPayInCode, readAgreement, unitsTaken } from "./investor-store";
import { actOnVenture } from "./venture-act";
import { windowInForceOn } from "./venture-store";

// The Farm's own capital in a Venture (built 2026-10-05 on Claude's recommendation, at the Owner's word, ahead of the
// advisers — `.scratch/openfarm-farm-capital/`): the Farm takes Units with its own money, at the same price and on the
// same terms as any Investor, as a partner for that money (AAOIFI SS 13 §8/9). Its Units are an Agreement of their own
// kind, `farm_own` — no stamp, no paper, no Nominee — held by the Farm's own partner record, which is no person.

/** The most of a Venture's Units the Farm may hold itself: half, so a Venture stays its Investors'. */
const FARM_SHARE_MOST = 0.5;

/** The Owner taking the Farm's Units, on this farm. */
type Acting = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: NonNullable<Context["actor"]>;
};

/**
 * The Farm's own partner record — made the first time it takes Units, one a farm. Named as the farm is and reached on
 * its phone, as a person's would be, but flagged as the Farm: no Investor list, papers, Nominee or portal reads it.
 */
export const farmPartnerOf = async (
  tx: Tx,
  farm: { id: string; name: string; phone: string | null },
  now: Date
): Promise<string> => {
  const had = await tx.query.investor.findFirst({
    where: { farmId: farm.id, isFarm: true },
    columns: { id: true },
  });
  if (had) {
    return had.id;
  }
  const id = uuidv7(now);
  await tx.insert(investor).values({
    id,
    farmId: farm.id,
    name: farm.name,
    phone: farm.phone ?? "",
    isFarm: true,
    createdAt: now,
  });
  return id;
};

/** Whether an Agreement is the Farm's own Units. */
export const isTheFarmsOwn = (agreement: { stampKind: string }): boolean =>
  agreement.stampKind === "farm_own";

const refused = (refusal: string, message: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

/**
 * The Farm takes Units of a Venture with its own money: while the Venture is open and before any Investor has signed,
 * so every Investor signs knowing; at most half its Units; once. On the split the farm signs its Investors on, read
 * here and never sent: its Units are on the same terms as everyone's, and every Investor then signs on that split.
 * Its capital then comes in as anybody's does, out of the Farm's own books. Answers with the Units' id.
 */
export const farmTakesUnits = async (
  context: Acting,
  input: { ventureId: string; units: number }
): Promise<{ id: string }> => {
  const farmId = context.farm.id;
  const now = context.clock.now();
  const id = uuidv7(now);
  await actOnVenture(context, {
    ventureId: input.ventureId,
    from: ["open"],
    wrongState: "The Farm takes its Units only while a Venture is open",
    trail: {
      entity: "investment_agreement",
      entityId: id,
      action: "create",
      after: (tx) => readAgreement(tx, farmId, id),
    },
    apply: async (tx, standing) => {
      const signed = await tx.query.investmentAgreement.findMany({
        where: { farmId, ventureId: standing.id },
        columns: { stampKind: true },
      });
      if (signed.some(isTheFarmsOwn)) {
        throw refused(
          "farm_has_units_already",
          "The Farm holds Units of this Venture already"
        );
      }
      // An Agreement offered in the app is a paper laid out already, and approved as it was: one standing would be
      // signed without the Farm's Units on it.
      const offered = await tx.query.agreementOffer.findFirst({
        where: {
          farmId,
          ventureId: standing.id,
          withdrawnAt: { isNull: true },
          approvedAt: { isNull: true },
        },
        columns: { id: true },
      });
      if (signed.length > 0 || offered) {
        throw refused(
          "investors_signed_already",
          "An Investor has signed already, or been offered an Agreement; the Farm takes its Units before anybody signs, so all sign knowing"
        );
      }
      if (input.units > Math.floor(standing.units * FARM_SHARE_MOST)) {
        throw refused(
          "farm_units_over_half",
          "The Farm may hold at most half of a Venture's Units"
        );
      }
      const taken = await unitsTaken(tx, farmId, standing.id);
      if (taken + input.units > standing.units) {
        throw refused(
          "venture_units_gone",
          `Only ${standing.units - taken} Units of this Venture are left`
        );
      }
      const partner = await farmPartnerOf(tx, context.farm, now);
      const window = await windowInForceOn(
        tx,
        farmId,
        standing,
        farmDayOf(now)
      );
      await tx.insert(investmentAgreement).values({
        id,
        farmId,
        ventureId: standing.id,
        investorId: partner,
        units: input.units,
        investorsPercent: context.farm.ventureInvestorsPercent,
        targetWindowStart: window.targetWindowStart,
        targetWindowEnd: window.targetWindowEnd,
        // No Agreement with itself: nobody to name, no stamp, no paper.
        arbitrator: "",
        stampKind: "farm_own",
        stampValueMoney: 0,
        stampedOn: farmDayOf(now),
        stampSerial: "",
        templateVersionId: null,
        payInCode: await nextPayInCode(tx, farmId, standing),
        signedBy: context.actor.id,
        createdAt: now,
      });
    },
  });
  return { id };
};

/** Which of these Agreements are the Farm's own Units. */
export const farmsOwnOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  agreementIds: readonly string[]
): Promise<Set<string>> => {
  if (agreementIds.length === 0) {
    return new Set();
  }
  const rows = await db.query.investmentAgreement.findMany({
    where: { farmId, id: { in: [...agreementIds] }, stampKind: "farm_own" },
    columns: { id: true },
  });
  return new Set(rows.map((one) => one.id));
};

/** The Farm's own Units in each of these Ventures, in one read: a Venture where it holds none is not in the map. */
export const farmUnitsOfEach = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureIds: readonly string[]
): Promise<Map<string, number>> => {
  if (ventureIds.length === 0) {
    return new Map();
  }
  const own = await db.query.investmentAgreement.findMany({
    where: {
      farmId,
      ventureId: { in: [...ventureIds] },
      stampKind: "farm_own",
    },
    columns: { ventureId: true, units: true },
  });
  return new Map(own.map((one) => [one.ventureId, one.units]));
};

/**
 * How many of a Venture's Units the Farm holds with its own money: what every Investor's paper tells them before they
 * sign, and — the Farm taking its Units only before anybody signs — what it told every one of them. Nothing where it
 * holds none.
 */
export const farmUnitsOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
): Promise<number> => {
  const each = await farmUnitsOfEach(db, farmId, [ventureId]);
  return each.get(ventureId) ?? 0;
};
