import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ASSIGNMENT, cover } from "@OpenFarm/db/schema/herd";
import { farmDayOf } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { refuse } from "./refuse";

type Reading = Pick<Tx, "query">;

/** One Cover as the screens read it: who is away, who looks after their Pens, and whether it still stands. */
export interface CoverRow {
  id: string;
  absentUserId: string;
  coverUserId: string;
  day: string;
  setAt: Date;
  endedAt: Date | null;
}

/**
 * The Pens a person covers at a moment: the Pens of everybody whose Cover names them on that farm day and had not been
 * ended by then. The absent person's Pens as they stand now — a Cover is for whatever they look after, not a list
 * frozen when it was set.
 */
export const coveredPensOf = async (
  db: Reading,
  farmId: string,
  userId: string,
  at: Date
): Promise<string[]> => {
  const covers = await db.query.cover.findMany({
    where: { farmId, coverUserId: userId, day: farmDayOf(at) },
    columns: { absentUserId: true, endedAt: true },
  });
  const standing = covers.filter(
    (one) => one.endedAt === null || one.endedAt > at
  );
  if (standing.length === 0) {
    return [];
  }
  const pens = await db.query.penAssignment.findMany({
    where: {
      farmId,
      userId: { in: standing.map((one) => one.absentUserId) },
      ...ACTIVE_ASSIGNMENT,
    },
    columns: { penId: true },
  });
  return pens.map((one) => one.penId);
};

/** A person's own Pens and the Pens they cover at that moment, once each, in an order two readings can be compared in. */
export const withCoveredPens = (
  own: readonly string[],
  covered: readonly string[]
): string[] => [...new Set([...own, ...covered])].toSorted();

/** Today's Covers on the farm, the standing and the ended, oldest first. */
export const coversOn = (
  db: Reading,
  farmId: string,
  day: string
): Promise<CoverRow[]> =>
  db.query.cover.findMany({
    where: { farmId, day },
    columns: {
      id: true,
      absentUserId: true,
      coverUserId: true,
      day: true,
      setAt: true,
      endedAt: true,
    },
    orderBy: { setAt: "asc", id: "asc" },
  });

/** Whether somebody holds Barn Staff on this farm now: only Barn Staff have Pens to be away from, or to cover. */
const holdsBarnStaff = async (tx: Reading, farmId: string, userId: string) =>
  (await tx.query.roleAssignment.findFirst({
    where: { farmId, userId, role: "staff", ...ACTIVE_ROLE },
    columns: { id: true },
  })) !== undefined;

/**
 * Sets today's Cover: `coverUserId` looks after `absentUserId`'s Pens until the farm day turns. A Cover already standing
 * for the same absent person today is ended by this one — the Manager changed who covers — so one person's Pens have
 * one cover at a time.
 */
export const setCover = async (
  tx: Tx,
  {
    farmId,
    absentUserId,
    coverUserId,
    by,
    now,
  }: {
    farmId: string;
    absentUserId: string;
    coverUserId: string;
    by: string;
    now: Date;
  }
): Promise<CoverRow> => {
  if (absentUserId === coverUserId) {
    throw refuse("cover_is_themselves", "Somebody cannot cover their own Pens");
  }
  const [awayIsStaff, coverIsStaff] = await Promise.all([
    holdsBarnStaff(tx, farmId, absentUserId),
    holdsBarnStaff(tx, farmId, coverUserId),
  ]);
  if (!(awayIsStaff && coverIsStaff)) {
    throw refuse(
      "cover_not_barn_staff",
      "Both the one away and the one covering must be Barn Staff here"
    );
  }
  const theirPens = await tx.query.penAssignment.findFirst({
    where: { farmId, userId: absentUserId, ...ACTIVE_ASSIGNMENT },
    columns: { id: true },
  });
  if (!theirPens) {
    throw refuse(
      "cover_no_pens",
      "The one away has no Pens for anybody to cover"
    );
  }
  const day = farmDayOf(now);
  await tx
    .update(cover)
    .set({ endedAt: now, endedBy: by })
    .where(
      and(
        eq(cover.farmId, farmId),
        eq(cover.absentUserId, absentUserId),
        eq(cover.day, day),
        isNull(cover.endedAt)
      )
    );
  const row = {
    id: uuidv7(now),
    farmId,
    absentUserId,
    coverUserId,
    day,
    setBy: by,
    setAt: now,
    endedAt: null,
    endedBy: null,
  };
  await tx.insert(cover).values(row);
  return row;
};

/** Ends a Cover before its day turns. One already ended, or from another day, is refused rather than ended twice. */
export const endCover = async (
  tx: Tx,
  { farmId, id, by, now }: { farmId: string; id: string; by: string; now: Date }
): Promise<CoverRow> => {
  const row = await tx.query.cover.findFirst({ where: { id, farmId } });
  if (!row || row.endedAt !== null || row.day !== farmDayOf(now)) {
    throw refuse("cover_not_standing", "That cover is not standing today");
  }
  await tx
    .update(cover)
    .set({ endedAt: now, endedBy: by })
    .where(eq(cover.id, id));
  return { ...row, endedAt: now };
};
