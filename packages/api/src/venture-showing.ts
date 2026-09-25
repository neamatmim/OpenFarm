import { eq } from "@OpenFarm/db/operators";
import { venture } from "@OpenFarm/db/schema/venture";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import type { VentureRow } from "./venture-act";
import { actOnVenture } from "./venture-act";
import { readVenture } from "./venture-store";

// A Venture still gathering capital, shown to the farm's invited Investors in the portal (ADR 0008). The Owner shows
// it, words it and takes it out again; an Investor reads its terms, its rules and those words — and never anything
// read off an Agreement, because what other people signed for is their business, and "only two Units left" is selling.

type ActorContext = Parameters<typeof actOnVenture>[0] & {
  clock: { now: () => Date };
};

/** A Venture past its decide-by day has had its Floor question answered: nothing asked now could change it. */
export const pastDecideBy = (decideBy: string, now: Date) => farmDayOf(now) > decideBy;

/** The Owner's few words on a shown Venture: what it is for, never what it will make. */
export const portalWords = z.string().max(500).default("");

const wordsOf = (words: string) => (words.trim() === "" ? null : words.trim());

/** Shows an Open Venture in the portal, with the Owner's few words on it. */
export const showInPortal = (
  context: ActorContext,
  id: string,
  words: string
) =>
  actOnVenture(context, {
    ventureId: id,
    from: ["open"],
    wrongState: "Only a Venture still gathering capital is shown in the portal",
    trail: {
      entity: "venture",
      entityId: id,
      action: "update",
      before: (tx) => readVenture(tx, context.farm.id, id),
      after: (tx) => readVenture(tx, context.farm.id, id),
    },
    apply: async (tx, standing) => {
      if (pastDecideBy(standing.decideBy, context.clock.now())) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Its decide-by day has passed",
          data: { refusal: "venture_past_decide_by" },
        });
      }
      await tx
        .update(venture)
        .set({
          shownInPortalAt: standing.shownInPortalAt ?? context.clock.now(),
          portalWords: wordsOf(words),
        })
        .where(eq(venture.id, standing.id));
    },
  });

/** New words on a Venture already shown. */
export const changePortalWords = (
  context: ActorContext,
  id: string,
  words: string
) =>
  actOnVenture(context, {
    ventureId: id,
    from: ["open"],
    wrongState: "Only a Venture still gathering capital is shown in the portal",
    trail: {
      entity: "venture",
      entityId: id,
      action: "update",
      before: (tx) => readVenture(tx, context.farm.id, id),
      after: (tx) => readVenture(tx, context.farm.id, id),
    },
    apply: async (tx, standing) => {
      if (!standing.shownInPortalAt) {
        throw new ORPCError("BAD_REQUEST", {
          message: "It is not shown in the portal",
          data: { refusal: "venture_not_shown" },
        });
      }
      await tx
        .update(venture)
        .set({ portalWords: wordsOf(words) })
        .where(eq(venture.id, standing.id));
    },
  });

/** Takes a Venture out of the portal: invited Investors stop being offered it. Its words are kept for showing it
 *  again. */
export const takeOutOfPortal = (context: ActorContext, id: string) =>
  actOnVenture(context, {
    ventureId: id,
    from: ["open"],
    wrongState: "Only a Venture still gathering capital is shown in the portal",
    trail: {
      entity: "venture",
      entityId: id,
      action: "update",
      before: (tx) => readVenture(tx, context.farm.id, id),
      after: (tx) => readVenture(tx, context.farm.id, id),
    },
    apply: async (tx, standing) => {
      await tx
        .update(venture)
        .set({ shownInPortalAt: null })
        .where(eq(venture.id, standing.id));
    },
  });

/** A Venture as an invited Investor is offered it: its terms and the Owner's words, and nothing anybody signed. */
const offeredAs = (row: VentureRow, investorsPercent: number, now: Date) => ({
  id: row.id,
  name: row.name,
  unitPriceBdt: row.unitPriceBdt,
  targetCapitalBdt: row.targetCapitalBdt,
  floorBdt: row.floorBdt,
  decideBy: row.decideBy,
  targetWindow: { start: row.targetWindowStart, end: row.targetWindowEnd },
  // What its capital is planned as, a fact about the Venture that does not move — never what has come in.
  cattleBudgetBdt: row.cattleBudgetBdt,
  runningBudgetBdt: row.targetCapitalBdt - row.cattleBudgetBdt,
  /** The Investors' part of any profit, as the farm signs Agreements today: a mudarabah partner is owed it
   *  before joining. Each Agreement freezes its own. */
  investorsPercent,
  words: row.portalWords,
  takingRequests: !pastDecideBy(row.decideBy, now),
});

/**
 * The Ventures one invited Investor is offered: shown, still Open, and not one they have signed for already. Nothing
 * for a retired Investor, who is not signed for another Venture until the Owner brings them back.
 */
export const openVenturesFor = async (
  db: Pick<Tx, "query">,
  farm: { id: string; ventureInvestorsPercent: number },
  investorId: string,
  now: Date
) => {
  const them = await db.query.investor.findFirst({
    where: { id: investorId, farmId: farm.id },
    columns: { retiredAt: true },
  });
  if (!them || them.retiredAt) {
    return [];
  }
  const shown = await db.query.venture.findMany({
    where: {
      farmId: farm.id,
      state: "open",
      shownInPortalAt: { isNotNull: true },
    },
    orderBy: { decideBy: "asc", id: "asc" },
  });
  const signed = await db.query.investmentAgreement.findMany({
    where: { farmId: farm.id, investorId },
    columns: { ventureId: true },
  });
  const theirs = new Set(signed.map((one) => one.ventureId));
  return shown
    .filter((one) => !theirs.has(one.id))
    .map((one) => offeredAs(one, farm.ventureInvestorsPercent, now));
};
