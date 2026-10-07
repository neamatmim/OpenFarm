import { passwordGuess } from "@OpenFarm/db/schema/auth";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Somebody guessing at one account's password from many addresses is slowed by the sign-in itself; the farm's turn
// tells the Owner, once for each run of guessing, and forgets guesses the hour has passed.

const NOW = "2088-05-01T03:00:00.000Z";

describe("a password guessed at", () => {
  it("is told to the Owner once, naming whose account it is", async () => {
    const clock = new FakeClock(NOW);
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock,
    });
    // The Manager's account, whose password is guessed at.
    await createTestClient(appRouter, { as: "manager", clock });
    const login = thePerson("manager").email.toLowerCase();
    await scratchDb()
      .insert(passwordGuess)
      .values(
        Array.from({ length: 6 }, (_, i) => ({
          id: `guess-notice-${Date.now()}-${i}`,
          login,
          guessedAt: new Date(clock.now().getTime() - (10 - i) * 60_000),
        }))
      );
    await owner.alerts.sweep();
    await owner.alerts.sweep();
    const told = await scratchDb().query.alert.findMany({
      where: { farmId: theFarm().id, kind: "password_guessed" },
      columns: { userId: true, params: true },
    });
    expect(told).toEqual([
      {
        userId: thePerson("owner").id,
        params: expect.objectContaining({
          name: thePerson("manager").name,
          guesses: 6,
        }),
      },
    ]);
  });

  it("goes on being guessed at, and is still one notice — until an hour's quiet ends the run", async () => {
    const clock = new FakeClock("2088-05-02T22:00:00.000Z");
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock,
    });
    const login = `nobody-${Date.now()}@guessing.test`;
    const guessNow = (n: number) =>
      scratchDb()
        .insert(passwordGuess)
        .values({
          id: `run-${login}-${clock.now().getTime()}-${n}`,
          login,
          guessedAt: clock.now(),
        });
    const toldOfThisLogin = async () => {
      const all = await scratchDb().query.alert.findMany({
        where: { farmId: theFarm().id, kind: "password_guessed" },
        columns: { entityId: true },
      });
      return new Set(
        all.flatMap((one) =>
          one.entityId?.startsWith(`guess:${login}:`) ? [one.entityId] : []
        )
      );
    };
    // A guess a minute through a long night, the farm sweeping every five.
    for (let minute = 0; minute < 90; minute += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one guess after another, as they come
      await guessNow(minute);
      if (minute % 5 === 4) {
        // oxlint-disable-next-line no-await-in-loop -- as above
        await owner.alerts.sweep();
      }
      clock.advance(60_000);
    }
    const firstRun = await toldOfThisLogin();
    expect(firstRun.size).toBe(1);

    // An hour and more of quiet, then somebody starts again: a new run, told again.
    clock.advance(2 * 60 * 60_000);
    for (let n = 0; n < 5; n += 1) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await guessNow(1000 + n);
      clock.advance(60_000);
    }
    await owner.alerts.sweep();
    const bothRuns = await toldOfThisLogin();
    expect(bothRuns.size).toBe(2);
  });
});
