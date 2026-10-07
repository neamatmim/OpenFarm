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
});
