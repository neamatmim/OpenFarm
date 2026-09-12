import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type {
  AnimalState,
  FarmEvent,
  QuietHours,
  Side,
  SopChange,
  SopContent,
} from "@OpenFarm/domain";
import {
  EXIT_STATES,
  raisesItsOwnWork,
  carryingMoments,
  describeChanges,
  lastCarryingMoment,
  MAX_GRACE_MINUTES,
  OPEN_INSTANCE_STATES,
  appliesToAnimal,
  isEscalated,
  isOverdue,
  minutesOverdue,
} from "@OpenFarm/domain";

import { holdersOf, peopleOnTheWork, raiseAlerts } from "./alerts-store";
import type { Tx } from "./audit";
import { FARM_UTC_OFFSET_MINUTES } from "./farm-clock";

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
  /** What raised it, for work the clock did not. Null for scheduled work. */
  cause?: string;
  /** The animal it is about, for work something that happened to her raised. */
  animalId?: string;
}

/**
 * Something that happened to one animal, flattened to what raising work needs to know. The
 * store reads Moves and registrations; the animal's own State change is one of these too,
 * because "she reached Dry" is a thing that happened at an instant just as much as a Move is.
 */
export interface Happening {
  kind: FarmEvent | "state";
  /** "move:<move id>", "arrival:<animal id>", "state:<animal id>:dry:<instant>" — what the
   *  cause is built from, and what makes one happening distinguishable from the next. */
  key: string;
  at: Date;
  animalId: string;
  penId: string;
  side: Side;
  state: AnimalState;
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

/** How far back the farm looks for things that should have raised work. Long enough to
 *  cover a phone left in a drawer over a weekend, short enough that publishing an SOP does
 *  not bring a fortnight of backlog with it. */
export const TRIGGER_LOOKBACK_DAYS = 14;

const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * When work hung on something that happened falls due. Days later means *that day* — the
 * farm's day, from its start — because "three days after she was moved" is a day's work, not
 * an appointment for twenty to midnight because that is when somebody happened to move her.
 * No days later means now: an arrival check is work for the person still standing there.
 */
const dueAfter = (at: Date, offsetDays: number): Date =>
  offsetDays === 0
    ? at
    : dueAtFor(new Date(at.getTime() + offsetDays * DAY_MS), "00:00");

/**
 * Every Instance that things which have happened call for: a Move, an arrival, or an animal
 * reaching a State. One per happening per SOP, about the animal it happened to, due however
 * many days later the Trigger says. Pure — the caller decides which of these already exist,
 * and the cause is what lets it decide.
 */
export const happeningSlotsFor = (
  now: Date,
  sops: {
    definitionId: string;
    versionId: string;
    content: SopContent;
    /** When this Version — the one carrying these Triggers — was published. Nothing that
     *  happened before it raises work under it: adding a Trigger to the Playbook is not a
     *  way to give the farm a fortnight of overdue work it never knew about (ADR 0001). */
    triggersInForceSince: Date;
  }[],
  happenings: Happening[]
): DueSlot[] => {
  const slots: DueSlot[] = [];
  const earliest = new Date(now.getTime() - TRIGGER_LOOKBACK_DAYS * DAY_MS);
  for (const sop of sops) {
    for (const trigger of sop.content.triggers) {
      if (trigger.kind === "schedule") {
        continue;
      }
      // Raised by the act itself, inside the transaction that records it. Nothing that happens
      // on the farm raises these, and nothing here should go looking.
      if (raisesItsOwnWork(trigger)) {
        continue;
      }
      const offsetDays = trigger.offsetDays ?? 0;
      for (const happening of happenings) {
        const matches =
          trigger.kind === "event"
            ? happening.kind === trigger.event
            : happening.kind === "state" && happening.state === trigger.state;
        if (
          !(
            matches &&
            // Work about a cow who has left is exactly what a death raises, and nothing else
            // may be raised about her.
            (happening.kind === "death" || isOnTheFarm(happening)) &&
            happening.at >= earliest &&
            happening.at >= sop.triggersInForceSince &&
            appliesToAnimal(sop.content.appliesTo, happening)
          )
        ) {
          continue;
        }
        slots.push({
          definitionId: sop.definitionId,
          versionId: sop.versionId,
          penId: happening.penId,
          animalId: happening.animalId,
          cause: `${happening.key}:+${offsetDays}`,
          dueAt: dueAfter(happening.at, offsetDays),
          graceMinutes: sop.content.graceMinutes,
          assignedRole: sop.content.assignedRole,
          checkerRole: sop.content.checkerRole,
        });
      }
    }
  }
  return slots;
};

/**
 * Everything that has happened lately and might call for work: Moves, arrivals, and the
 * State each animal is in with the moment she reached it. Read in one go, because the sweep
 * runs on every app-open and a farm has one of these tables per question.
 */
export const recentHappenings = async (
  db: Pick<Database, "query">,
  farmId: string,
  now: Date
): Promise<Happening[]> => {
  const earliest = new Date(now.getTime() - TRIGGER_LOOKBACK_DAYS * DAY_MS);
  const animals = await db.query.animal.findMany({
    where: { farmId },
    columns: {
      id: true,
      penId: true,
      side: true,
      state: true,
      stateChangedAt: true,
      createdAt: true,
    },
  });
  const animalsById = new Map(animals.map((beast) => [beast.id, beast]));
  // Registering an animal writes her arrival as a Move from nowhere. That is an arrival, and
  // arrival is its own happening: a post-move check has no business firing on a cow who has
  // never been moved anywhere.
  const moves = await db.query.animalMove.findMany({
    where: {
      farmId,
      movedAt: { gte: earliest },
      fromPenId: { isNotNull: true },
    },
    columns: { id: true, animalId: true, movedAt: true },
  });

  const happenings: Happening[] = [];
  for (const move of moves) {
    const beast = animalsById.get(move.animalId);
    if (beast) {
      happenings.push({
        kind: "move",
        key: `move:${move.id}`,
        at: move.movedAt,
        animalId: beast.id,
        // Where she is now, not where that Move put her: she may have been moved twice, and
        // the work has to be raised in the Pen somebody will find her in.
        penId: beast.penId,
        side: beast.side,
        state: beast.state,
      });
    }
  }
  for (const beast of animals) {
    if (beast.createdAt >= earliest) {
      happenings.push({
        kind: "arrival",
        key: `arrival:${beast.id}`,
        at: beast.createdAt,
        animalId: beast.id,
        penId: beast.penId,
        side: beast.side,
        state: beast.state,
      });
    }
    // A death or a cull is its own happening, not a State an animal reached: the Playbook's
    // mortality handling — bury her, report her — is work about a cow who has left, and every
    // other State trigger is about one who has not.
    if (!(isOnTheFarm(beast) || beast.stateChangedAt < earliest)) {
      happenings.push({
        kind: "death",
        key: `death:${beast.id}:${beast.stateChangedAt.toISOString()}`,
        at: beast.stateChangedAt,
        animalId: beast.id,
        penId: beast.penId,
        side: beast.side,
        state: beast.state,
      });
    }
    if (beast.stateChangedAt >= earliest) {
      happenings.push({
        kind: "state",
        key: `state:${beast.id}:${beast.state}:${beast.stateChangedAt.toISOString()}`,
        at: beast.stateChangedAt,
        animalId: beast.id,
        penId: beast.penId,
        side: beast.side,
        state: beast.state,
      });
    }
  }
  return happenings;
};

/** Raises the Instances the farm's day needs. Idempotent: the unique index on
 *  (definition, pen, due time) means running it twice changes nothing. */
export const raiseDueInstances = async (
  tx: Tx,
  farmId: string,
  slots: DueSlot[],
  now: Date
): Promise<{ id: string; cause: string | null }[]> => {
  if (slots.length === 0) {
    return [];
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
        cause: slot.cause ?? null,
        animalId: slot.animalId ?? null,
        dueAt: slot.dueAt,
        graceMinutes: slot.graceMinutes,
        assignedRole: slot.assignedRole,
        checkerRole: slot.checkerRole,
        createdAt: now,
      }))
    )
    .onConflictDoNothing()
    // The cause as well as the id: work already raised is quietly skipped, so a caller that
    // has something to hang on each new Instance has to know which slot it came from rather
    // than counting on the rows lining up.
    .returning({ id: sopInstance.id, cause: sopInstance.cause });
  return created;
};

/** The animals a per-animal Step covers in this Instance's Pen, right now. */
export const animalsForInstance = async (
  db: Pick<Database, "query">,
  farmId: string,
  penId: string,
  content: SopContent,
  /** Work raised by something that happened to one animal is about her, not about everything
   *  standing in the Pen she happens to be in. */
  animalId?: string | null
) => {
  const rows = await db.query.animal.findMany({
    where: animalId ? { farmId, id: animalId } : { farmId, penId },
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
    (row) =>
      isOnTheFarm(row) &&
      // Work raised about one animal stays about her even if she has moved on since — a cow
      // dried off between the Move and the check is still the cow to look at.
      (Boolean(animalId) || appliesToAnimal(content.appliesTo, row))
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

export interface RaisedAlert {
  /** The Alert row itself, so what became of telling someone is recorded against it. */
  id: string;
  kind: string;
  entity: string;
  entityId: string;
  params: Record<string, unknown>;
  userId: string;
}

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
): Promise<{
  overdue: number;
  escalated: number;
  raised: RaisedAlert[];
}> => {
  const managers = pending.overdue.length
    ? await holdersOf(tx, farmId, ["manager"])
    : [];
  const owners = pending.escalated.length
    ? await holdersOf(tx, farmId, ["owner"])
    : [];

  let overdue = 0;
  let escalated = 0;
  const raised: RaisedAlert[] = [];
  for (const instance of pending.overdue) {
    // Deliberately sequential: a hundred concurrent upserts against one unique index buys
    // nothing but lock contention.
    // oxlint-disable-next-line no-await-in-loop
    const onIt = await peopleOnTheWork(tx, farmId, instance);
    // oxlint-disable-next-line no-await-in-loop
    const told = [...new Set([...managers, ...onIt])];
    // oxlint-disable-next-line no-await-in-loop
    const rows = await raiseAlerts(
      tx,
      farmId,
      told,
      {
        kind: "instance_overdue",
        entity: "sop_instance",
        entityId: instance.id,
        params: alertParams(instance),
      },
      now
    );
    overdue += rows.length;
    raised.push(
      ...rows.map((row) => ({
        ...row,
        kind: "instance_overdue",
        entity: "sop_instance",
        entityId: instance.id,
        params: alertParams(instance) as Record<string, unknown>,
      }))
    );
  }
  for (const instance of pending.escalated) {
    // oxlint-disable-next-line no-await-in-loop
    const params = {
      ...alertParams(instance),
      minutesOverdue: minutesOverdue(instance, now),
    };
    // oxlint-disable-next-line no-await-in-loop
    const rows = await raiseAlerts(
      tx,
      farmId,
      owners,
      {
        kind: "instance_escalated",
        entity: "sop_instance",
        entityId: instance.id,
        params,
      },
      now
    );
    escalated += rows.length;
    raised.push(
      ...rows.map((row) => ({
        ...row,
        kind: "instance_escalated",
        entity: "sop_instance",
        entityId: instance.id,
        params: params as Record<string, unknown>,
      }))
    );
  }
  return { overdue, escalated, raised };
};

/**
 * What changed in the Version a piece of work runs on, for the person opening it — and
 * nothing at all once they have done that work once on that Version.
 *
 * The comparison is against the Version they last worked to, not simply the one before this:
 * somebody who was away for two publications should see everything that changed while they
 * were away, not only the last of it.
 *
 * There is no acknowledgement step in Release 1: a button to press would be one more thing
 * between somebody and the job. Having recorded something on the new Version is the farm's
 * evidence that they saw what it says, and it is evidence that cannot be clicked away by
 * accident.
 */
export const whatChangedFor = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  actorId: string,
  instance: { versionId: string; definitionId: string }
): Promise<{ from: number; to: number; changes: SopChange[] } | null> => {
  // Asked first, because it is the cheap question and the common answer: somebody who has
  // already worked on this Version is told nothing, and nothing else needs reading.
  const doneOnIt = await db.query.stepCompletion.findFirst({
    where: {
      farmId,
      recordedBy: actorId,
      instance: { versionId: instance.versionId },
    },
    columns: { id: true },
  });
  if (doneOnIt) {
    return null;
  }
  const version = await db.query.sopVersion.findFirst({
    where: { id: instance.versionId },
    columns: { number: true, content: true },
  });
  if (!version || version.number < 2) {
    // The first Version of an SOP changed nothing; it is the procedure.
    return null;
  }
  // The newest Version of this SOP they have actually worked to. Absent — they are new, or
  // were away — the Version before this one is the honest baseline.
  const theirLast = await db.query.stepCompletion.findMany({
    where: {
      farmId,
      recordedBy: actorId,
      instance: { definitionId: instance.definitionId },
    },
    columns: { id: true },
    with: { instance: { columns: { versionId: true } } },
  });
  const workedVersionIds = new Set(
    theirLast.map((completion) => completion.instance.versionId)
  );
  const earlier = await db.query.sopVersion.findMany({
    where: {
      definitionId: instance.definitionId,
      number: { lt: version.number },
    },
    orderBy: { number: "desc" },
    columns: { id: true, number: true, content: true },
  });
  const baseline =
    earlier.find((candidate) => workedVersionIds.has(candidate.id)) ??
    earlier[0];
  if (!baseline) {
    return null;
  }
  const changes = describeChanges(
    baseline.content as SopContent,
    version.content as SopContent
  );
  // Two Versions can differ in ways nobody doing the work would notice — a note, an English
  // translation. Announcing a change with nothing under it teaches people to ignore the
  // banner that matters.
  if (changes.length === 0) {
    return null;
  }
  return { from: baseline.number, to: version.number, changes };
};

/** How far into the farm's own day an instant falls, in minutes. The farm's clock is the
 *  one everything about times of day is measured on — a shed in Dhaka, not UTC. */
export const minuteOfFarmDay = (at: Date): number => {
  const { from } = farmDayRange(at);
  return Math.floor((at.getTime() - from.getTime()) / MINUTE_MS);
};

/** The farm's own day, as a date somebody would write down. Not the UTC one: at half past
 *  midnight in a shed in Dhaka, yesterday's date is the wrong answer. */
export const farmDayOf = (at: Date): string =>
  farmDayRange(at).from.toISOString().slice(0, "YYYY-MM-DD".length);

/**
 * When the farm's post was last due to be carried, as an instant — today's most recent
 * carrying moment, or yesterday's last one if the day has not reached its first.
 *
 * Everything raised before it goes in this digest; everything since waits for the next. Not
 * to be confused with an Alert's own `carriedAt`, which is when it actually went.
 */
export const postDueAt = (
  now: Date,
  times: readonly string[],
  quiet: QuietHours
): Date | null => {
  const { from } = farmDayRange(now);
  const today = lastCarryingMoment(minuteOfFarmDay(now), times, quiet);
  if (today !== null) {
    return new Date(from.getTime() + today * MINUTE_MS);
  }
  // Before today's first moment: yesterday's last one is the one that has passed.
  const yesterday = carryingMoments(times, quiet).at(-1);
  return yesterday === undefined
    ? null
    : new Date(from.getTime() - 24 * 60 * MINUTE_MS + yesterday * MINUTE_MS);
};

/** Entries the system could not settle on its own, oldest first. Asked the same way by
 *  every screen that shows them, so "needing a decision" cannot mean two things. */
export const openReviews = (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  limit: number
) =>
  db.query.needsReview.findMany({
    where: { farmId, resolvedAt: { isNull: true } },
    columns: { id: true, entity: true, entityId: true, reason: true },
    orderBy: { raisedAt: "asc" },
    limit,
  });

/** Cows whose milk may not go to the tank, soonest to come off first — a Withdrawal ending
 *  is the one anybody has to plan around. */
/** Every cow the farm is holding back — her milk from the tank, her carcass from the lorry,
 *  or both. Each screen sorts and counts by the hold it is actually about. */
export const heldByWithdrawal = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  now: Date
) => {
  const held = await db.query.animal.findMany({
    where: {
      farmId,
      // Either hold counts: her milk out of the tank, or her carcass off the lorry.
      OR: [
        { milkWithdrawalUntil: { gt: now } },
        { meatWithdrawalUntil: { gt: now } },
      ],
    },
    columns: {
      id: true,
      tagNumber: true,
      state: true,
      penId: true,
      milkWithdrawalUntil: true,
      meatWithdrawalUntil: true,
    },
  });
  return held.filter((beast) => isOnTheFarm(beast));
};

/** Every piece of work the farm's day holds, done or not. */
export const daysWork = (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  now: Date
) => {
  const { from, to } = farmDayRange(now);
  return db.query.sopInstance.findMany({
    where: { farmId, dueAt: { gte: from, lt: to } },
    columns: { id: true, penId: true, state: true },
  });
};

/** Is this piece of work finished, as far as the farm is concerned? Missed is settled but
 *  not finished: somebody decided it would not happen, and said why. */
export const isFinished = (state: string): boolean =>
  state === "completed" || state === "approved";
