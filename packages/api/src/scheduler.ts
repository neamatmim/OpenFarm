import type { Database } from "@OpenFarm/db";
import { schedulerState } from "@OpenFarm/db/schema/scheduler";

import type { Clock } from "./clock";
import { systemClock } from "./clock";
import { buildContext } from "./context";
import type { PushTransport } from "./push";
import type { SmsTransport } from "./sms";
import { theDayTurns } from "./the-day-turns";

export interface ScheduleStatus {
  lastRanAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
}

const FARM_DAY_SCHEDULE = "farm-day";

// A transaction-level database lock coordinates Vercel invocations and separate
// Node processes, including through a transaction-pooled PgBouncer endpoint.
// Work is idempotent too, but message delivery should not overlap.
const FARM_DAY_ADVISORY_LOCK = 2_024_090_521;

/** When the schedule last ran, when it last turned the whole day cleanly, and what went wrong if any of it did not —
 *  for the Owner's systems page. */
export const scheduleStatus = async (
  db: Database
): Promise<Readonly<ScheduleStatus>> => {
  const state = await db.query.schedulerState.findFirst({
    where: { id: FARM_DAY_SCHEDULE },
  });
  return {
    lastRanAt: state?.lastRanAt ?? null,
    lastOkAt: state?.lastOkAt ?? null,
    lastError: state?.lastError ?? null,
  };
};

const markStarted = async (db: Database, startedAt: Date): Promise<void> => {
  await db
    .insert(schedulerState)
    .values({
      id: FARM_DAY_SCHEDULE,
      lastRanAt: startedAt,
      lastOkAt: null,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: schedulerState.id,
      set: { lastRanAt: startedAt },
    });
};

const markFinished = async (
  db: Database,
  startedAt: Date,
  finishedAt: Date | null,
  error: string | null
): Promise<void> => {
  await db
    .insert(schedulerState)
    .values({
      id: FARM_DAY_SCHEDULE,
      lastRanAt: startedAt,
      lastOkAt: finishedAt,
      lastError: error,
    })
    .onConflictDoUpdate({
      target: schedulerState.id,
      set: {
        lastRanAt: startedAt,
        ...(finishedAt ? { lastOkAt: finishedAt } : {}),
        lastError: error,
      },
    });
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const turnFarmDay = async ({
  db,
  clock,
  push,
  sms,
  farmId,
}: {
  db: Database;
  clock: Clock;
  push?: PushTransport;
  sms?: SmsTransport;
  farmId: string | null;
}): Promise<{ ok: boolean; error?: string }> => {
  const startedAt = clock.now();
  try {
    await markStarted(db, startedAt);
    const context = await buildContext({
      session: null,
      clock,
      db,
      push,
      sms,
      farmId,
    });
    const { farm } = context;
    if (farm) {
      const turned = await theDayTurns({ ...context, farm });
      const turnError = turned.wentWrong.join("; ") || null;
      if (turnError) {
        throw new Error(turnError);
      }
    }
    await markFinished(db, startedAt, clock.now(), null);
    return { ok: true };
  } catch (error) {
    const message = errorMessage(error);
    try {
      await markFinished(db, startedAt, null, message);
    } catch {
      // The original database or schedule error is the useful result. Readiness
      // will independently expose a database that cannot store this status.
    }
    return { ok: false, error: message };
  }
};

const turnFarmDayWithLock = async ({
  db,
  clock,
  push,
  sms,
  farmId,
}: {
  db: Database;
  clock: Clock;
  push?: PushTransport;
  sms?: SmsTransport;
  farmId: string | null;
}): Promise<{ ok: boolean; error?: string }> => {
  const connection = await db.$client.connect();
  let transactionOpen = false;
  try {
    await connection.query("begin");
    transactionOpen = true;
    const lock = await connection.query<{ acquired: boolean }>(
      "select pg_try_advisory_xact_lock($1) as acquired",
      [FARM_DAY_ADVISORY_LOCK]
    );
    if (lock.rows[0]?.acquired !== true) {
      // Another process is already turning the same farm day. That invocation
      // owns the durable status and this duplicate has no work to do.
      await connection.query("commit");
      transactionOpen = false;
      return { ok: true };
    }

    const result = await turnFarmDay({ db, clock, push, sms, farmId });
    await connection.query("commit");
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) {
      try {
        await connection.query("rollback");
      } catch {
        // Releasing a failed connection below also releases its transaction lock.
      }
    }
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * One turn of the farm's day, on the server (the glossary's Day Turning). The same idempotent round the app runs when
 * somebody opens it — but nothing now waits for somebody to open it, so an overdue milking at night still reaches the
 * Owner.
 */
export const runTheSchedule = async ({
  db,
  clock = systemClock,
  push,
  sms,
  farmId = null,
}: {
  db: Database;
  clock?: Clock;
  push?: PushTransport;
  sms?: SmsTransport;
  /** Which farm's day to turn, for a caller that knows. Nothing on a farm's own install, which has one. */
  farmId?: string | null;
}): Promise<{ ok: boolean; error?: string }> => {
  try {
    return await turnFarmDayWithLock({ db, clock, push, sms, farmId });
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
};
