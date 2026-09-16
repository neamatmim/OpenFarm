import type { Database } from "@OpenFarm/db";

import type { Clock } from "./clock";
import { systemClock } from "./clock";
import { buildContext } from "./context";
import type { PushTransport } from "./push";
import type { SmsTransport } from "./sms";
import { theDayTurns } from "./the-day-turns";

/** How often the server looks at the farm's clock: often enough that nothing waits long for its notice. */
const EVERY_MS = 5 * 60_000;

export interface ScheduleStatus {
  lastRanAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
}

const status: ScheduleStatus = {
  lastRanAt: null,
  lastOkAt: null,
  lastError: null,
};

/** When the schedule last ran, when it last turned the whole day cleanly, and what went wrong if any of it did not —
 *  for the Owner's systems page. */
export const scheduleStatus = (): Readonly<ScheduleStatus> => ({ ...status });

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
    const turned = await theDayTurns({ ...context, farm });
    // A piece that failed does not stop the rest of the day turning, but the turn was not a clean one: the Owner's
    // systems page reads both, and a page that called this morning clean would be the wrong thing to show.
    status.lastError = turned.wentWrong.join("; ") || null;
    if (status.lastError) {
      return { ok: false, error: status.lastError };
    }
    status.lastOkAt = clock.now();
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
