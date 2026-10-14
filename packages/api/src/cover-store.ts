import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, inArray, isNull, lt, or } from "@OpenFarm/db/operators";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";
import { cover } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import {
  OPEN_INSTANCE_STATES,
  addDays,
  farmDayOf,
  startOfFarmDay,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { lockTheFarm } from "./farm-lock";
import { refuse } from "./refuse";
import { scopesOf, workingAs } from "./scope";

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

/** A Pen Assignment with its span, so it can be read as it stood at any moment. */
interface HeldSpan {
  userId: string;
  penId: string;
  createdAt: Date;
  endedAt: Date | null;
}

/** Whether an Assignment was standing at a moment: begun by then and not yet ended. */
const heldAt = (span: HeldSpan, at: Date) =>
  span.createdAt <= at && (span.endedAt === null || span.endedAt > at);

/** Whether a Cover was standing at a moment of its own day: set for that day and not ended by then. */
const standingAt = (one: { endedAt: Date | null }, at: Date) =>
  one.endedAt === null || one.endedAt > at;

/** Everything a person's Covers of one farm day turn on: the Covers naming them, and the Pens of whoever they cover. */
export interface CoverDay {
  covers: { absentUserId: string; endedAt: Date | null }[];
  spans: HeldSpan[];
}

/** One person's Covers of one farm day, read once: what `coveredPensIn` answers any moment of that day from. */
export const coverDayOf = async (
  db: Reading,
  farmId: string,
  userId: string,
  day: string
): Promise<CoverDay> => {
  const covers = await db.query.cover.findMany({
    where: { farmId, coverUserId: userId, day },
    columns: { absentUserId: true, endedAt: true },
  });
  if (covers.length === 0) {
    return { covers, spans: [] };
  }
  const spans = await db.query.penAssignment.findMany({
    where: {
      farmId,
      userId: { in: [...new Set(covers.map((one) => one.absentUserId))] },
    },
    columns: { userId: true, penId: true, createdAt: true, endedAt: true },
  });
  return { covers, spans };
};

/**
 * The Pens a person covered at a moment of that day: the Pens each person they covered then kept at that moment — as
 * their Assignments stood then, not as they stand now.
 */
export const coveredPensIn = (day: CoverDay, at: Date): string[] => {
  const away = new Set(
    day.covers
      .filter((one) => standingAt(one, at))
      .map((one) => one.absentUserId)
  );
  return day.spans
    .filter((span) => away.has(span.userId) && heldAt(span, at))
    .map((span) => span.penId);
};

/** The Pens a person covers at a moment, read for that moment alone. */
export const coveredPensOf = async (
  db: Reading,
  farmId: string,
  userId: string,
  at: Date
): Promise<string[]> =>
  coveredPensIn(await coverDayOf(db, farmId, userId, farmDayOf(at)), at);

/** A person's own Pens and the Pens they cover at that moment, once each, in an order two readings can be compared in. */
export const withCoveredPens = (
  own: readonly string[],
  covered: readonly string[]
): string[] => [...new Set([...own, ...covered])].toSorted();

/** Who a request is, as far as working out their Cover goes. */
interface WorkingPerson {
  db: Reading;
  clock: { now: () => Date };
  farm: { id: string } | null;
  actor: { id: string } | null;
  person: { disabledAt?: Date | null } | null;
  penIds: readonly string[];
  visiting: boolean;
  caseAnimalIds: readonly string[];
}

/**
 * The Role they work under and its Scope, with today's Cover among their Pens when that Role is Barn Staff — the only
 * Role with Pens to cover, and the only one asked about it. Somebody who has left covers nobody.
 */
export const workingWithTheirCover = async (
  context: WorkingPerson,
  roleUsed: RoleName
) => {
  const covering =
    roleUsed === "staff" &&
    context.farm &&
    context.actor &&
    !context.person?.disabledAt
      ? await coveredPensOf(
          context.db,
          context.farm.id,
          context.actor.id,
          context.clock.now()
        )
      : [];
  return workingAs(
    covering.length > 0
      ? { ...context, penIds: withCoveredPens(context.penIds, covering) }
      : context,
    roleUsed
  );
};

/**
 * Who works a Pen at a moment, for whom its news is: the people who keep it, less anybody away that day under a Cover —
 * their Pens' news is the cover's while they are away — and with whoever covers them. Without a moment, the keepers
 * as they are.
 */
export const swapTheAwayAt = async (
  db: Reading,
  farmId: string,
  keepers: readonly string[],
  at: Date | undefined
): Promise<string[]> => {
  if (!at || keepers.length === 0) {
    return [...keepers];
  }
  const covers = await db.query.cover.findMany({
    where: { farmId, day: farmDayOf(at), absentUserId: { in: [...keepers] } },
    columns: { absentUserId: true, coverUserId: true, endedAt: true },
  });
  const standing = covers.filter((one) => standingAt(one, at));
  const away = new Set(standing.map((one) => one.absentUserId));
  return [
    ...new Set([
      ...keepers.filter((one) => !away.has(one)),
      ...standing.map((one) => one.coverUserId),
    ]),
  ];
};

/** Their Scope under each Role they hold, Barn Staff with today's Cover among their Pens, as their procedures read it. */
export const scopesWithTheirCover = async (
  context: WorkingPerson & { roles: readonly RoleName[] }
) => {
  const scopes = scopesOf(context);
  if (!context.roles.includes("staff")) {
    return scopes;
  }
  const asStaff = await workingWithTheirCover(context, "staff");
  return { ...scopes, staff: asStaff.scope };
};

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

/** What setting a Cover did: the Cover, any it replaced, and the absent person's work it let go of for the cover. */
export interface CoverSet {
  row: CoverRow;
  replaced: string[];
  released: string[];
}

/**
 * Lets go of the work owed by the end of the Cover's day that the absent person had taken or was pinned to, in their
 * own Pens, so the cover may take it: work held by somebody who is not here is work nobody does.
 */
const releaseTheirWork = async (
  tx: Tx,
  farmId: string,
  absentUserId: string,
  day: string
): Promise<string[]> => {
  const pens = await tx.query.penAssignment.findMany({
    where: { farmId, userId: absentUserId, endedAt: { isNull: true } },
    columns: { penId: true },
  });
  if (pens.length === 0) {
    return [];
  }
  const released = await tx
    .update(sopInstance)
    .set({ claimedBy: null, claimedAt: null, assignedTo: null })
    .where(
      and(
        eq(sopInstance.farmId, farmId),
        inArray(sopInstance.state, [...OPEN_INSTANCE_STATES]),
        inArray(
          sopInstance.penId,
          pens.map((one) => one.penId)
        ),
        lt(sopInstance.dueAt, startOfFarmDay(addDays(day, 1))),
        or(
          eq(sopInstance.claimedBy, absentUserId),
          eq(sopInstance.assignedTo, absentUserId)
        )
      )
    )
    .returning({ id: sopInstance.id });
  return released.map((one) => one.id);
};

/** The database's word for two standing Covers of one person on one day, which the farm's lock should never let through. */
const isTwoStanding = (error: unknown) => {
  const cause = (error as { cause?: { code?: string; constraint?: string } })
    ?.cause;
  const own = error as { code?: string; constraint?: string };
  const code = cause?.code ?? own?.code;
  const constraint = cause?.constraint ?? own?.constraint;
  return code === "23505" && constraint === "cover_standing_uidx";
};

/**
 * Sets today's Cover: `coverUserId` looks after `absentUserId`'s Pens until the farm day turns. A Cover already standing
 * for the same absent person today is ended by this one — the Manager changed who covers — so one person's Pens have
 * one cover at a time. Taken behind the farm's lock, so two set at once end one after the other.
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
): Promise<CoverSet> => {
  if (absentUserId === coverUserId) {
    throw refuse("cover_is_themselves", "Somebody cannot cover their own Pens");
  }
  await lockTheFarm(tx, farmId);
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
    where: { farmId, userId: absentUserId, endedAt: { isNull: true } },
    columns: { id: true },
  });
  if (!theirPens) {
    throw refuse(
      "cover_no_pens",
      "The one away has no Pens for anybody to cover"
    );
  }
  const day = farmDayOf(now);
  const replaced = await tx
    .update(cover)
    .set({ endedAt: now, endedBy: by })
    .where(
      and(
        eq(cover.farmId, farmId),
        eq(cover.absentUserId, absentUserId),
        eq(cover.day, day),
        isNull(cover.endedAt)
      )
    )
    .returning({ id: cover.id });
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
  try {
    await tx.insert(cover).values(row);
  } catch (error) {
    if (isTwoStanding(error)) {
      throw refuse(
        "cover_already_set",
        "Somebody else set a cover for them a moment ago"
      );
    }
    throw error;
  }
  const released = await releaseTheirWork(tx, farmId, absentUserId, day);
  return { row, replaced: replaced.map((one) => one.id), released };
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
