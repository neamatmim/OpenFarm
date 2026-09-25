import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import type { REQUEST_CHANGE_KINDS } from "@OpenFarm/db/schema/venture";
import {
  LIVE_REQUEST_STATES,
  VENTURE_STATES,
  requestToJoin,
  requestToJoinChange,
} from "@OpenFarm/db/schema/venture";
import { REQUEST_NOTE_MOST, isLiveRequest } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import { unitsTaken } from "./investor-store";
import {
  settleTheRequestNotice,
  tellTheOwnerOfARequest,
} from "./join-request-notice";
import type { VentureRow } from "./venture-act";
import { actOnVenture } from "./venture-act";
import { pastDecideBy } from "./venture-showing";

// A Request to Join (ADR 0008): an invited Investor saying, through the portal, that they want whole Units of a
// Venture the Owner has shown. It binds nobody, holds no Units and moves no money — only a signed Agreement does. The
// Investor changes it and withdraws it until somebody answers; each thing they did is kept beneath it for the Owner,
// and is in the trail as their own act. Nobody but the Owner reads anybody else's.

type Asking = Parameters<typeof actOnVenture>[0] & {
  clock: { now: () => Date };
  actor: { id: string };
};

/** Whole Units, one at the least: the most is the Venture's own Units, which only the Venture knows. */
export const unitsAsked = z.number().int().min(1);

/** The Investor's few words for the Owner, such as when they can pay. */
export const requestNote = z.string().trim().max(REQUEST_NOTE_MOST).default("");

/** The one live Request an Investor has on a Venture, if any. */
const liveRequestOf = (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string,
  investorId: string
) =>
  db.query.requestToJoin.findFirst({
    where: {
      farmId,
      ventureId,
      investorId,
      state: { in: [...LIVE_REQUEST_STATES] },
    },
  });

/** A Request as the trail keeps it, either side of an act. */
const readRequest = async (tx: Tx, farmId: string, id: string) =>
  (await tx.query.requestToJoin.findFirst({
    where: { id, farmId },
    columns: {
      ventureId: true,
      investorId: true,
      units: true,
      note: true,
      state: true,
    },
  })) ?? null;

/**
 * Whether this Investor may ask to join this Venture now, behind the lock: it is shown and not past its decide-by
 * day, they are not retired, and they are not signed on it already. The portal being open and their access standing
 * is the door's to say, before any of this is reached. Answers with their name, for the Owner's Notice.
 */
const whoMayAsk = async (
  tx: Tx,
  farmId: string,
  investorId: string,
  standing: VentureRow,
  now: Date
) => {
  if (!standing.shownInPortalAt) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The farm is not showing this Venture in the portal",
      data: { refusal: "venture_not_shown" },
    });
  }
  if (pastDecideBy(standing.decideBy, now)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Its decide-by day has passed; it takes no more requests",
      data: { refusal: "venture_past_decide_by" },
    });
  }
  const them = await tx.query.investor.findFirst({
    where: { id: investorId, farmId },
    columns: { name: true, retiredAt: true },
  });
  if (!them || them.retiredAt) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A retired Investor is not signed for another Venture",
      data: { refusal: "investor_retired" },
    });
  }
  const signed = await tx.query.investmentAgreement.findFirst({
    where: { farmId, ventureId: standing.id, investorId },
    columns: { id: true },
  });
  if (signed) {
    throw new ORPCError("BAD_REQUEST", {
      message: "You have signed for this Venture already",
      data: { refusal: "already_signed_on_venture" },
    });
  }
  return them.name;
};

/**
 * An Investor asks to join a shown Venture for whole Units, with a note if they like — or, with a Request still
 * waiting, changes it: one live Request per Venture, never a second. Answers with the Request's id.
 */
export const askToJoin = async (
  context: Asking,
  investorId: string,
  input: { ventureId: string; units: number; note: string }
): Promise<{ id: string }> => {
  const farmId = context.farm.id;
  const now = context.clock.now();
  // Read before the write only to name it in the trail — made or changed. Behind the lock it is read again, and a
  // second tap that raced the first is told so rather than trusted.
  const said = await liveRequestOf(
    context.db,
    farmId,
    input.ventureId,
    investorId
  );
  const id = said?.id ?? uuidv7(now);
  const note = input.note === "" ? null : input.note;
  await actOnVenture(context, {
    ventureId: input.ventureId,
    from: ["open"],
    wrongState: "Only a Venture still gathering capital can be asked to join",
    trail: {
      entity: "request_to_join",
      entityId: id,
      action: said ? "update" : "create",
      before: (tx) =>
        said ? readRequest(tx, farmId, id) : Promise.resolve(null),
      after: (tx) => readRequest(tx, farmId, id),
    },
    apply: async (tx, standing) => {
      const investor = await whoMayAsk(tx, farmId, investorId, standing, now);
      if (input.units > standing.units) {
        throw new ORPCError("BAD_REQUEST", {
          // Not how many it has: an Investor is never told the Venture's Units.
          message: "More Units than this Venture has",
          data: { refusal: "units_beyond_venture" },
        });
      }
      const live = await liveRequestOf(tx, farmId, standing.id, investorId);
      if ((live?.id ?? null) !== (said?.id ?? null)) {
        throw new ORPCError("CONFLICT", {
          message: "Asked twice at once — look again",
          data: { refusal: "asked_twice_at_once" },
        });
      }
      if (live && live.state !== "waiting") {
        throw new ORPCError("BAD_REQUEST", {
          message: "The farm has answered this Request already",
          data: { refusal: "request_already_answered" },
        });
      }
      await (live
        ? tx
            .update(requestToJoin)
            .set({ units: input.units, note })
            .where(eq(requestToJoin.id, live.id))
        : tx.insert(requestToJoin).values({
            id,
            farmId,
            ventureId: standing.id,
            investorId,
            units: input.units,
            note,
            state: "waiting",
            madeBy: context.actor.id,
            createdAt: now,
          }));
      await tx.insert(requestToJoinChange).values({
        id: uuidv7(now),
        farmId,
        requestId: id,
        kind: live ? "changed" : "made",
        units: input.units,
        note,
        madeBy: context.actor.id,
        createdAt: now,
      });
      await tellTheOwnerOfARequest(
        tx,
        farmId,
        {
          requestId: id,
          ventureId: standing.id,
          venture: standing.name,
          investor,
          units: input.units,
        },
        live?.units ?? null,
        now
      );
    },
  });
  return { id };
};

/**
 * An Investor withdraws their own Request: it binds nobody, so backing out needs no conversation. Somebody else's
 * is no such Request; one already withdrawn or closed has nothing left to withdraw.
 */
export const withdrawRequest = async (
  context: Asking,
  investorId: string,
  requestId: string
): Promise<void> => {
  const farmId = context.farm.id;
  const now = context.clock.now();
  const theirs = await context.db.query.requestToJoin.findFirst({
    where: { id: requestId, farmId, investorId },
    columns: { ventureId: true },
  });
  if (!theirs) {
    throw new ORPCError("NOT_FOUND", {
      message: "No such request",
      data: { refusal: "no_such_request" },
    });
  }
  await actOnVenture(context, {
    ventureId: theirs.ventureId,
    // Withdrawing is never refused for where the Venture stands: nobody should be held to a Request.
    from: VENTURE_STATES,
    wrongState: "This Venture is gone",
    trail: {
      entity: "request_to_join",
      entityId: requestId,
      action: "update",
      before: (tx) => readRequest(tx, farmId, requestId),
      after: (tx) => readRequest(tx, farmId, requestId),
    },
    apply: async (tx) => {
      const standing = await tx.query.requestToJoin.findFirst({
        where: { id: requestId, farmId },
      });
      if (!(standing && isLiveRequest(standing.state))) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This Request is not waiting on anybody any more",
          data: { refusal: "request_not_live" },
        });
      }
      await tx
        .update(requestToJoin)
        .set({ state: "withdrawn" })
        .where(eq(requestToJoin.id, requestId));
      await tx.insert(requestToJoinChange).values({
        id: uuidv7(now),
        farmId,
        requestId,
        kind: "withdrawn",
        units: standing.units,
        note: standing.note,
        madeBy: context.actor.id,
        createdAt: now,
      });
      await settleTheRequestNotice(
        tx,
        farmId,
        { ventureId: standing.ventureId, requestId },
        now
      );
    },
  });
};

/** Each Request's changes, oldest first, by the Request. */
const changesOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  requestIds: string[]
) => {
  const byRequest = new Map<
    string,
    {
      id: string;
      kind: (typeof REQUEST_CHANGE_KINDS)[number];
      units: number;
      note: string | null;
      at: Date;
    }[]
  >();
  if (requestIds.length === 0) {
    return byRequest;
  }
  const rows = await db.query.requestToJoinChange.findMany({
    where: { farmId, requestId: { in: requestIds } },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  for (const one of rows) {
    const list = byRequest.get(one.requestId) ?? [];
    list.push({
      id: one.id,
      kind: one.kind,
      units: one.units,
      note: one.note,
      at: one.createdAt,
    });
    byRequest.set(one.requestId, list);
  }
  return byRequest;
};

type RequestRow = Awaited<
  ReturnType<Tx["query"]["requestToJoin"]["findMany"]>
>[number];

/** One Request as either side reads it: its Units, the taka they come to, its note, where it stands, and when it was
 *  made and last changed. */
const readAs = (
  one: RequestRow,
  unitPriceBdt: number,
  history: readonly { at: Date }[]
) => ({
  id: one.id,
  units: one.units,
  bdt: one.units * unitPriceBdt,
  note: one.note,
  state: one.state,
  madeAt: one.createdAt,
  changedAt: history.at(-1)?.at ?? one.createdAt,
});

/**
 * A Venture's Requests as the Owner reads them: each with the Investor, Units, taka, note, when it was made and last
 * changed, where it stands and its history beneath; and beside them, the Units signed and the Units asked for and
 * still waiting, so she can tell whether the Requests would reach the Floor when the signatures do not yet.
 */
export const requestsOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
) => {
  const run = await db.query.venture.findFirst({
    where: { id: ventureId, farmId },
    columns: { unitPriceBdt: true },
  });
  if (!run) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  const rows = await db.query.requestToJoin.findMany({
    where: { farmId, ventureId },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  const changes = await changesOf(
    db,
    farmId,
    rows.map((one) => one.id)
  );
  const signedUnits = await unitsTaken(db, farmId, ventureId);
  const waitingUnits = rows
    .filter((one) => one.state === "waiting")
    .reduce((sum, one) => sum + one.units, 0);
  return {
    requests: rows.map((one) => {
      const history = changes.get(one.id) ?? [];
      return {
        ...readAs(one, run.unitPriceBdt, history),
        investorId: one.investorId,
        history,
      };
    }),
    totals: {
      signedUnits,
      signedBdt: signedUnits * run.unitPriceBdt,
      waitingUnits,
      waitingBdt: waitingUnits * run.unitPriceBdt,
    },
  };
};

/**
 * One Investor's own Requests, the latest first, and where each stands: narrowed to them before anything is read, so
 * nobody else's is ever in hand.
 */
export const theirRequests = async (
  db: Pick<Tx, "query">,
  farmId: string,
  investorId: string
) => {
  const rows = await db.query.requestToJoin.findMany({
    where: { farmId, investorId },
    orderBy: { createdAt: "desc", id: "desc" },
  });
  if (rows.length === 0) {
    return [];
  }
  const ventures = await db.query.venture.findMany({
    where: {
      farmId,
      id: { in: [...new Set(rows.map((one) => one.ventureId))] },
    },
    columns: { id: true, name: true, unitPriceBdt: true },
  });
  const ventureOf = new Map(ventures.map((one) => [one.id, one] as const));
  const changes = await changesOf(
    db,
    farmId,
    rows.map((one) => one.id)
  );
  return rows.map((one) => {
    const run = ventureOf.get(one.ventureId);
    return {
      ...readAs(one, run?.unitPriceBdt ?? 0, changes.get(one.id) ?? []),
      ventureId: one.ventureId,
      ventureName: run?.name ?? "",
    };
  });
};
