import type { VentureState } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { AuditedWrite, Tx } from "./audit";
import { audited } from "./audit";
import { lockTheFarm } from "./venture-store";

/** The context an act has: the Role is settled and the Farm is certain. */
type ActorContext = Parameters<typeof audited>[0] & { farm: { id: string } };

/** A Venture as an act is given it: the row the farm holds, re-read inside the lock. */
export type VentureRow = NonNullable<
  Awaited<ReturnType<Tx["query"]["venture"]["findFirst"]>>
>;

/**
 * One act on a Venture: where it may be done from, what it writes, and how the trail says so.
 *
 * Everything else about doing it — finding the Venture, taking the lock, refusing a Venture whose
 * Settlement is approved, reading it again behind the lock, and holding it to the same states a
 * second time — is the same for every act and belongs to `actOnVenture`.
 */
export interface VentureAct {
  /** Which Venture. Refused as not found when it is not this Farm's. */
  ventureId: string;
  /**
   * The states it may be done from, and what to tell somebody whose Venture is elsewhere.
   *
   * Asked behind the lock and nowhere else. A state read before the lock is only true until the next
   * act commits, so a second check would be the one that counts and the first would only change which
   * refusal a Venture in two kinds of trouble at once gives back. An act that wants to say no early —
   * before somebody fills a form — says so in its own preamble, as drawing a Float does.
   */
  from: readonly VentureState[];
  wrongState: string;
  /**
   * Whether an approved Settlement refuses it.
   *
   * True for anything that would move a figure the Investors were paid on. A Settlement freezes what
   * the Venture held, and an act that changes it afterwards makes the papers everybody keeps disagree
   * with the books.
   */
  refusedOnceSettled?: boolean;
  /** The Audit Event it is written under, as any other audited write describes one. */
  trail: AuditedWrite;
  /** What it writes, on the act's own transaction, with the Venture as it stands behind the lock. */
  apply: (tx: Tx, venture: VentureRow) => Promise<void>;
}

/** This Farm's Venture, or nothing the caller may act on. */
const ours = async (context: ActorContext, id: string): Promise<VentureRow> => {
  const row = await context.db.query.venture.findFirst({
    where: { id, farmId: context.farm.id },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  return row;
};

/** Refuses an act on a Venture whose Settlement the Owner has already approved. */
const assertNotSettledUp = async (
  tx: Tx,
  farmId: string,
  ventureId: string
): Promise<void> => {
  const approved = await tx.query.ventureSettlement.findFirst({
    where: { farmId, ventureId },
    columns: { id: true },
  });
  if (approved) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This Venture's Settlement has been approved",
      data: { refusal: "already_approved" },
    });
  }
};

/**
 * Does one act on a Venture, in the order every act on a Venture has to be done in.
 *
 * Find it and refuse what is not ours; then, on one transaction: lock the Farm, refuse a Venture whose
 * Settlement is approved, read it again behind the lock, hold it to the states the act allows, and
 * write — with the Audit Event standing or falling with the write.
 *
 * Written once because it was written twenty-one times, and one of them left the lock out: capital
 * against an Agreement was counted outside the transaction that wrote it, so two payments arriving
 * together could both be taken. The order is not a thing each act should be trusted to remember.
 */
export const actOnVenture = async (
  context: ActorContext,
  act: VentureAct
): Promise<void> => {
  const row = await ours(context, act.ventureId);
  await audited(context).write(act.trail, async (tx) => {
    await lockTheFarm(tx, context.farm.id);
    if (act.refusedOnceSettled) {
      await assertNotSettledUp(tx, context.farm.id, row.id);
    }
    const standing = await tx.query.venture.findFirst({
      where: { id: row.id, farmId: context.farm.id },
    });
    if (!standing || !act.from.includes(standing.state)) {
      throw new ORPCError("BAD_REQUEST", {
        message: act.wrongState,
        data: { refusal: "venture_wrong_state" },
      });
    }
    await act.apply(tx, standing);
  });
};
