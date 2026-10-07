import { uuidv7 } from "@OpenFarm/db/ids";
import { investmentAgreement, investor } from "@OpenFarm/db/schema/venture";
import type { TemplateContent } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { Context } from "./context";
import { nextPayInCode, readAgreement, unitsTaken } from "./investor-store";
import { currentWording, giveStandardTemplates } from "./template-store";
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

/** Whether an exported paper, as the trail keeps it, was an Agreement laid out for an Investor to sign. */
const isADraft = (event: { after: unknown }): boolean =>
  typeof event.after === "object" &&
  event.after !== null &&
  "paper" in event.after &&
  event.after.paper === "agreement_draft";

/** Whether a wording of the Investment Agreement has a clause printed where the Farm holds Units of its own. */
const tellsOfFarmCapital = (content: TemplateContent): boolean =>
  content.sections.some(
    (section) =>
      section.kind === "clauses" &&
      section.clauses.some((clause) => clause.only === "farm_capital")
  );

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
  // Every Investor is told of the Farm's Units by their Agreement: wording that has no clause for it — the Owner's own,
  // published before there was one — would have them sign knowing nothing.
  await giveStandardTemplates(context);
  const wording = await currentWording(
    context.db,
    farmId,
    "investment_agreement"
  );
  if (!tellsOfFarmCapital(wording.content)) {
    throw refused(
      "wording_tells_no_farm_capital",
      "The Investment Agreement in force has no clause telling the Investors of the Farm's own Units; publish one first"
    );
  }
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
      if (signed.length > 0) {
        throw refused(
          "investors_signed_already",
          "An Investor has signed already; the Farm takes its Units before anybody signs, so all sign knowing"
        );
      }
      if (offered) {
        throw refused(
          "an_offer_is_standing",
          "An Agreement offered in the app is standing, laid out without the Farm's Units; withdraw it first"
        );
      }
      // A paper printed for an Investor to sign was laid out without the Farm's Units, and is signed as printed: the
      // record of what each was handed is the Venture's own trail.
      const handed = await tx.query.auditEvent.findMany({
        where: {
          farmId,
          entity: "venture",
          entityId: standing.id,
          action: "export",
        },
        columns: { after: true },
      });
      if (handed.some(isADraft)) {
        throw refused(
          "paper_laid_out_already",
          "A paper has been printed for an Investor to sign without the Farm's Units; the Farm takes its Units before any is"
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

/**
 * The split a Venture's Agreements are on, once it has any: the Farm's own Units' where it holds some, else its first
 * Investor's. A Venture is settled on one split, and a later Investor signed on another left it unable to settle
 * (`agreements_disagree`). Nothing for a Venture nobody has signed for.
 */
export const theVenturesSplit = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
): Promise<{ investorsPercent: number; farmsOwn: boolean } | null> => {
  const signed = await db.query.investmentAgreement.findMany({
    where: { farmId, ventureId },
    columns: { investorsPercent: true, stampKind: true },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  const first =
    signed.find((one) => one.stampKind === "farm_own") ?? signed.at(0);
  return first
    ? {
        investorsPercent: first.investorsPercent,
        farmsOwn: first.stampKind === "farm_own",
      }
    : null;
};

/** The split each of these Ventures is on, for those anybody has signed for. */
export const splitsOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureIds: readonly string[]
): Promise<Map<string, number>> => {
  const splits = new Map<string, number>();
  for (const ventureId of ventureIds) {
    // oxlint-disable-next-line no-await-in-loop -- a few open Ventures at a time
    const split = await theVenturesSplit(db, farmId, ventureId);
    if (split) {
      splits.set(ventureId, split.investorsPercent);
    }
  }
  return splits;
};

/**
 * A new Agreement or offer is on the split the Venture's Agreements are already on, refused otherwise: the Farm's own
 * Units' (`split_not_the_farms`), or the first Investor's (`split_not_the_ventures`). The only way to a new split is an
 * Amendment that moves them all.
 */
export const assertTheVenturesSplit = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string,
  investorsPercent: number
): Promise<void> => {
  const split = await theVenturesSplit(db, farmId, ventureId);
  if (split && split.investorsPercent !== investorsPercent) {
    throw new ORPCError("BAD_REQUEST", {
      message: split.farmsOwn
        ? `The Farm's own Units in this Venture are on a ${split.investorsPercent}% split; every Investor signs on the same`
        : `This Venture's Investors are on a ${split.investorsPercent}% split; every Investor signs on the same`,
      data: {
        refusal: split.farmsOwn
          ? "split_not_the_farms"
          : "split_not_the_ventures",
        investorsPercent: split.investorsPercent,
      },
    });
  }
};
