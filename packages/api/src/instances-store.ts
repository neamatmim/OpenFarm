import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type { SopContent } from "@OpenFarm/domain";
import {
  EXIT_STATES,
  MAX_GRACE_MINUTES,
  OPEN_INSTANCE_STATES,
  appliesToAnimal,
  isEscalated,
  isOverdue,
  minutesOverdue,
} from "@OpenFarm/domain";

import { holdersOf, peopleOnTheWork, raiseAlerts } from "./alerts-store";
import type { Tx } from "./audit";

/** The farm's clock. Asia/Dhaka has no daylight saving; a farm parameter later. */
const FARM_UTC_OFFSET_MINUTES = 6 * 60;
const MINUTE_MS = 60_000;

/** An animal that has left the farm keeps its Pen, so every selection must exclude exits —
 *  otherwise a sold or dead cow appears on the pen board and blocks the Instance. */
export const isOnTheFarm = (row: { state: string }): boolean =>
  !(EXIT_STATES as readonly string[]).includes(row.state);

/** The instant a "HH:MM" schedule time falls on, on the farm's day containing `now`. */
export const dueAtFor = (now: Date, time: string): Date => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const farmNow = new Date(now.getTime() + FARM_UTC_OFFSET_MINUTES * MINUTE_MS);
  const farmMidnight = Date.UTC(
    farmNow.getUTCFullYear(),
    farmNow.getUTCMonth(),
    farmNow.getUTCDate()
  );
  return new Date(
    farmMidnight -
      FARM_UTC_OFFSET_MINUTES * MINUTE_MS +
      (hour * 60 + minute) * MINUTE_MS
  );
};

/** The farm-local day containing `now`, as a half-open range. */
export const farmDayRange = (now: Date): { from: Date; to: Date } => {
  const from = dueAtFor(now, "00:00");
  return { from, to: new Date(from.getTime() + 24 * 60 * MINUTE_MS) };
};

export interface DueSlot {
  definitionId: string;
  versionId: string;
  penId: string;
  dueAt: Date;
  graceMinutes: number;
  assignedRole: SopContent["assignedRole"];
  checkerRole: SopContent["checkerRole"];
}

/**
 * Every Instance a schedule-triggered SOP should have for the farm's day containing `now`:
 * one per Pen holding at least one animal the SOP concerns. Pure — the caller decides which
 * of these already exist.
 */
export const dueSlotsFor = (
  now: Date,
  sops: { definitionId: string; versionId: string; content: SopContent }[],
  animals: { penId: string; side: string; state: string }[]
): DueSlot[] => {
  const slots: DueSlot[] = [];
  for (const sop of sops) {
    const schedules = sop.content.triggers.filter(
      (trigger) => trigger.kind === "schedule"
    );
    if (schedules.length === 0) {
      continue;
    }
    const pens = new Set(
      animals
        .filter(
          (row) =>
            isOnTheFarm(row) &&
            appliesToAnimal(sop.content.appliesTo, {
              side: row.side as never,
              state: row.state as never,
            })
        )
        .map((row) => row.penId)
    );
    for (const schedule of schedules) {
      if (schedule.kind !== "schedule") {
        continue;
      }
      for (const time of schedule.times) {
        const dueAt = dueAtFor(now, time);
        for (const penId of pens) {
          slots.push({
            definitionId: sop.definitionId,
            versionId: sop.versionId,
            penId,
            dueAt,
            graceMinutes: sop.content.graceMinutes,
            assignedRole: sop.content.assignedRole,
            checkerRole: sop.content.checkerRole,
          });
        }
      }
    }
  }
  return slots;
};

/** Raises the Instances the farm's day needs. Idempotent: the unique index on
 *  (definition, pen, due time) means running it twice changes nothing. */
export const raiseDueInstances = async (
  tx: Tx,
  farmId: string,
  slots: DueSlot[],
  now: Date
): Promise<number> => {
  if (slots.length === 0) {
    return 0;
  }
  const created = await tx
    .insert(sopInstance)
    .values(
      slots.map((slot) => ({
        id: uuidv7(now),
        farmId,
        definitionId: slot.definitionId,
        versionId: slot.versionId,
        penId: slot.penId,
        state: "due" as const,
        dueAt: slot.dueAt,
        graceMinutes: slot.graceMinutes,
        assignedRole: slot.assignedRole,
        checkerRole: slot.checkerRole,
        createdAt: now,
      }))
    )
    .onConflictDoNothing()
    .returning({ id: sopInstance.id });
  return created.length;
};

/** The animals a per-animal Step covers in this Instance's Pen, right now. */
export const animalsForInstance = async (
  db: Pick<Database, "query">,
  farmId: string,
  penId: string,
  content: SopContent
) => {
  const rows = await db.query.animal.findMany({
    where: { farmId, penId },
    columns: {
      id: true,
      tagNumber: true,
      side: true,
      state: true,
      photoUpdatedAt: true,
      milkWithdrawalUntil: true,
    },
    orderBy: { tagNumber: "asc" },
  });
  return rows.filter(
    (row) => isOnTheFarm(row) && appliesToAnimal(content.appliesTo, row)
  );
};

/** What an Alert about a piece of work carries, snapshotted at the moment it is raised so it
 *  still reads the same after the SOP is renamed or the Pen is moved. */
export const alertParams = (instance: {
  version: { content: unknown };
  pen: { name: string; shed: { name: string } };
  dueAt: Date;
}) => {
  const content = instance.version.content as SopContent;
  return {
    sopBn: content.name.bn,
    sopEn: content.name.en ?? content.name.bn,
    pen: `${instance.pen.shed.name} / ${instance.pen.name}`,
    dueAt: instance.dueAt.toISOString(),
  };
};

/**
 * Work that has gone late: open Instances past their due time and their grace. A read, so
 * both the sweep and the day's list can ask, and so a sweep with nothing to say writes
 * nothing at all.
 */
export const findLate = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  now: Date,
  /** Only work due at or after this instant. The Overdue list wants everything still open;
   *  the sweep wants only the window it has not already spoken about. */
  since?: Date,
  /** …or raised since this one, whatever it was due for. */
  orRaisedSince?: Date
) => {
  const open = await db.query.sopInstance.findMany({
    where: {
      farmId,
      state: { in: [...OPEN_INSTANCE_STATES] },
      ...(since
        ? {
            OR: [
              { dueAt: { gte: since } },
              ...(orRaisedSince ? [{ createdAt: { gte: orRaisedSince } }] : []),
            ],
          }
        : {}),
    },
    orderBy: { dueAt: "desc" },
    with: {
      version: { columns: { content: true } },
      pen: {
        columns: { name: true },
        with: { shed: { columns: { name: true } } },
      },
    },
  });
  return open.filter((instance) => isOverdue(instance, now));
};

export type LateInstance = Awaited<ReturnType<typeof findLate>>[number];

/** A backstop on one sweep's writes, so a farm opening the app after a long silence catches
 *  up over a few sweeps rather than holding one write transaction open against all of it. */
const SWEEP_BATCH = 200;

const ALERTED_KINDS = ["instance_overdue", "instance_escalated"] as const;

export interface PendingNotices {
  overdue: LateInstance[];
  escalated: LateInstance[];
  /** How far back this sweep has now told people about: everything that went late at or
   *  after this is said. Older work is on the Overdue list, not in anyone's notifications. */
  sweptFrom: Date;
}

/** The instant an Instance stopped being merely due. */
const wentLateAt = (instance: LateInstance): number =>
  instance.dueAt.getTime() + instance.graceMinutes * MINUTE_MS;

/** The instant it became the Owner's business as well. */
const escalatedAt = (
  instance: LateInstance,
  escalationMinutes: number
): number => wentLateAt(instance) + escalationMinutes * MINUTE_MS;

/** Is this Instance inside the sweep's window — by when it went late, or by being new to
 *  the farm since the last sweep looked? The day's Instances are raised when someone opens
 *  the app, so an SOP published at eleven raises one that was due at five and is already
 *  late: new to the farm, however old its due time. */
const inside = (instance: LateInstance, from: Date): boolean =>
  wentLateAt(instance) >= from.getTime() ||
  instance.createdAt.getTime() >= from.getTime();

/**
 * The untold ones, most recent moment first, capped at what one transaction should carry.
 * Also says whether anything was left over, because a window that closed over work it did
 * not get to would be a window that lost it: the watermark may only move past a window the
 * sweep finished.
 */
const takeUntold = (
  candidates: LateInstance[],
  momentOf: (instance: LateInstance) => number
): { taken: LateInstance[]; leftOver: boolean } => {
  const ordered = candidates.toSorted((a, b) => momentOf(b) - momentOf(a));
  return {
    taken: ordered.slice(0, SWEEP_BATCH),
    leftOver: ordered.length > SWEEP_BATCH,
  };
};

/**
 * Late work nobody has been told about yet, and how far back this sweep reaches.
 *
 * The window runs from wherever the last sweep got to, so a farm that nobody opened for a
 * week comes back to the week it missed rather than to silence — and a farm opened twice in
 * a minute reads almost nothing. Before the first sweep the window is the farm's own day:
 * the system starts noticing when it is installed, not by announcing every Instance in the
 * farm's history.
 *
 * Each kind is measured at its own moment. An Instance goes Overdue at one instant and
 * becomes the Owner's business at a later one, so a window that only asked when work went
 * late would tell the Manager and then never reach the Owner.
 *
 * "Nobody has been told" is per Instance and kind rather than per person, so someone who
 * joins the farm afterwards is not handed a backlog of other people's old alerts.
 */
export const findPendingNotices = async (
  db: Pick<Database, "query">,
  farm: {
    id: string;
    escalationMinutes: number;
    alertsSweptFrom: Date | null;
  },
  now: Date
): Promise<PendingNotices> => {
  const from = farm.alertsSweptFrom ?? farmDayRange(now).from;
  // Widened by the longest Grace an SOP may declare and by the escalation window, because
  // an Instance due well before the window can still reach either moment inside it; the
  // exact test follows in memory. Instances raised since the last sweep come in on their
  // own account, whatever they were due.
  const due = new Date(
    from.getTime() - (MAX_GRACE_MINUTES + farm.escalationMinutes) * MINUTE_MS
  );
  const inWindow = await findLate(db, farm.id, now, due, from);
  if (inWindow.length === 0) {
    return { overdue: [], escalated: [], sweptFrom: now };
  }
  const told = await db.query.alert.findMany({
    where: {
      farmId: farm.id,
      kind: { in: [...ALERTED_KINDS] },
      entityId: { in: inWindow.map((instance) => instance.id) },
    },
    columns: { entityId: true, kind: true },
  });
  const toldOf = (kind: string) =>
    new Set(told.filter((row) => row.kind === kind).map((row) => row.entityId));
  const toldOverdue = toldOf("instance_overdue");
  const toldEscalated = toldOf("instance_escalated");

  const late = takeUntold(
    inWindow.filter(
      (instance) => inside(instance, from) && !toldOverdue.has(instance.id)
    ),
    wentLateAt
  );
  const owners = takeUntold(
    inWindow.filter(
      (instance) =>
        isEscalated(instance, farm.escalationMinutes, now) &&
        (escalatedAt(instance, farm.escalationMinutes) >= from.getTime() ||
          instance.createdAt.getTime() >= from.getTime()) &&
        !toldEscalated.has(instance.id)
    ),
    (instance) => escalatedAt(instance, farm.escalationMinutes)
  );
  return {
    overdue: late.taken,
    escalated: owners.taken,
    // The window stays open over anything this sweep did not reach. The told-filter means
    // the next sweep carries on rather than saying it all again.
    sweptFrom: late.leftOver || owners.leftOver ? from : now,
  };
};

/**
 * Tells the farm about work that has gone late. Overdue reaches the Manager and whoever the
 * work is on; still open after the escalation window, it reaches the Owner too — one rung,
 * because there is nobody above the Owner. Nothing about the Instance changes, because being
 * late is a fact about the clock and not a state to be put into.
 */
export const raiseLateAlerts = async (
  tx: Tx,
  farmId: string,
  pending: PendingNotices,
  now: Date
): Promise<{ overdue: number; escalated: number }> => {
  const managers = pending.overdue.length
    ? await holdersOf(tx, farmId, ["manager"])
    : [];
  const owners = pending.escalated.length
    ? await holdersOf(tx, farmId, ["owner"])
    : [];

  let overdue = 0;
  let escalated = 0;
  for (const instance of pending.overdue) {
    // Deliberately sequential: a hundred concurrent upserts against one unique index buys
    // nothing but lock contention.
    // oxlint-disable-next-line no-await-in-loop
    const onIt = await peopleOnTheWork(tx, farmId, instance);
    // oxlint-disable-next-line no-await-in-loop
    overdue += await raiseAlerts(
      tx,
      farmId,
      [...managers, ...onIt],
      {
        kind: "instance_overdue",
        entity: "sop_instance",
        entityId: instance.id,
        params: alertParams(instance),
      },
      now
    );
  }
  for (const instance of pending.escalated) {
    // oxlint-disable-next-line no-await-in-loop
    escalated += await raiseAlerts(
      tx,
      farmId,
      owners,
      {
        kind: "instance_escalated",
        entity: "sop_instance",
        entityId: instance.id,
        params: {
          ...alertParams(instance),
          minutesOverdue: minutesOverdue(instance, now),
        },
      },
      now
    );
  }
  return { overdue, escalated };
};
