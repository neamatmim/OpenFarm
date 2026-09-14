import type { Database } from "@OpenFarm/db";

import type { Clock } from "./clock";
import { systemClock } from "./clock";
import { buildContext } from "./context";
import type { PushTransport } from "./push";
import { carryTheDigest, sweepTheAlerts } from "./routers/alerts";
import { raiseTheDaysWork } from "./routers/instances";
import type { SmsTransport } from "./sms";

/** How often the server looks at the farm's clock: often enough that nothing waits long for its notice. */
const EVERY_MS = 5 * 60_000;

export interface ScheduleStatus {
  lastRanAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
}

const status: ScheduleStatus = { lastRanAt: null, lastOkAt: null, lastError: null };

/** When the schedule last ran, last ran cleanly, and what went wrong if it did not — for the Owner's systems page. */
export const scheduleStatus = (): Readonly<ScheduleStatus> => ({ ...status });

/**
 * One turn of the farm's clock, on the server: the day's work raised, late work and ending withdrawals told about,
 * and the digest carried when its time has come. The same idempotent work the app does when somebody opens it — but
 * nothing now waits for somebody to open it, so an overdue milking at night still reaches the Owner.
 */
export const runTheSchedule = async ({
  db,
  clock = systemClock,
  push,
  sms,
}: {
  db: Database;
  clock?: Clock;
  push?: PushTransport;
  sms?: SmsTransport;
}): Promise<{ ok: boolean; error?: string }> => {
  status.lastRanAt = clock.now();
  try {
    const context = await buildContext({ session: null, clock, db, push, sms });
    const { farm } = context;
    if (!farm) {
      return { ok: true };
    }
    const onTheFarm = { ...context, farm };
    await raiseTheDaysWork(onTheFarm);
    await sweepTheAlerts(onTheFarm);
    await carryTheDigest(onTheFarm);
    status.lastOkAt = clock.now();
    status.lastError = null;
    return { ok: true };
  } catch (error) {
    status.lastError = error instanceof Error ? error.message : String(error);
    return { ok: false, error: status.lastError };
  }
};

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the server's timer once per process. `OPENFARM_SCHEDULER=off` leaves it to the app, for a second server
 *  over the same database. */
export const startTheSchedule = (run: () => Promise<unknown>) => {
  if (timer || process.env.OPENFARM_SCHEDULER === "off") {
    return;
  }
  const tick = async () => {
    await run();
  };
  timer = setInterval(tick, EVERY_MS);
  timer.unref?.();
  void tick();
};
