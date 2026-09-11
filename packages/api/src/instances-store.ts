import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type { SopContent } from "@OpenFarm/domain";
import {
  EXIT_STATES,
  OPEN_INSTANCE_STATES,
  appliesToAnimal,
  isEscalated,
  isOverdue,
  minutesOverdue,
} from "@OpenFarm/domain";

import { holdersOf, raiseAlerts } from "./alerts-store";
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

/** The one-line notice an Alert about a piece of work carries, snapshotted at the moment it
 *  is raised so it still reads the same after the SOP is renamed or the Pen is moved. */
const noticeParams = (instance: {
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
  now: Date
) => {
  const open = await db.query.sopInstance.findMany({
    where: { farmId, state: { in: [...OPEN_INSTANCE_STATES] } },
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

/** How far back a notice is worth sending. Work that went late this week is something to
 *  tell someone about; work that has been late for a month is a list, not a notification,
 *  and it stays on the Overdue list for as long as it stays open. */
const ALERT_HORIZON_DAYS = 7;

/** A backstop on one sweep, so a farm opening the app after a long silence catches up over
 *  a few sweeps rather than holding one write transaction open against all of it. */
const SWEEP_BATCH = 200;

const ALERTED_KINDS = ["instance_overdue", "instance_escalated"] as const;

export interface PendingNotices {
  overdue: LateInstance[];
  escalated: LateInstance[];
}

/**
 * Late work nobody has been told about yet. A read: in steady state it finds nothing, so the
 * sweep everyone triggers by opening the app opens no transaction at all.
 *
 * "Nobody" is per Instance and kind rather than per person, so someone who joins the farm
 * after the notice went out is not handed a backlog of other people's old alerts. What they
 * are told about is the work that goes late from then on.
 */
export const findPendingNotices = async (
  db: Pick<Database, "query">,
  farm: { id: string; escalationMinutes: number },
  now: Date
): Promise<PendingNotices> => {
  const horizon = now.getTime() - ALERT_HORIZON_DAYS * 24 * 60 * MINUTE_MS;
  // Most recently due first: if a farm has a backlog, the Manager wants to hear about this
  // morning's milking before an Instance from last week that nobody ever closed.
  const open = await findLate(db, farm.id, now);
  const late = open
    .filter((instance) => instance.dueAt.getTime() >= horizon)
    .toSorted((a, b) => b.dueAt.getTime() - a.dueAt.getTime());
  if (late.length === 0) {
    return { overdue: [], escalated: [] };
  }
  const told = await db.query.alert.findMany({
    where: {
      farmId: farm.id,
      kind: { in: [...ALERTED_KINDS] },
      entityId: { in: late.map((instance) => instance.id) },
    },
    columns: { entityId: true, kind: true },
  });
  const toldOf = (kind: string) =>
    new Set(told.filter((row) => row.kind === kind).map((row) => row.entityId));
  const toldOverdue = toldOf("instance_overdue");
  const toldEscalated = toldOf("instance_escalated");
  return {
    overdue: late
      .filter((instance) => !toldOverdue.has(instance.id))
      .slice(0, SWEEP_BATCH),
    escalated: late
      .filter(
        (instance) =>
          isEscalated(instance, farm.escalationMinutes, now) &&
          !toldEscalated.has(instance.id)
      )
      .slice(0, SWEEP_BATCH),
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
    const onIt = instance.claimedBy ?? instance.assignedTo;
    // Deliberately sequential: a hundred concurrent upserts against one unique index buys
    // nothing but lock contention.
    // oxlint-disable-next-line no-await-in-loop
    overdue += await raiseAlerts(
      tx,
      farmId,
      onIt ? [...managers, onIt] : managers,
      {
        kind: "instance_overdue",
        entity: "sop_instance",
        entityId: instance.id,
        params: noticeParams(instance),
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
          ...noticeParams(instance),
          minutesOverdue: minutesOverdue(instance, now),
        },
      },
      now
    );
  }
  return { overdue, escalated };
};
