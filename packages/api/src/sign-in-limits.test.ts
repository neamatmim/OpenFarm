import { createAuth } from "@OpenFarm/auth";
import { env } from "@OpenFarm/env/server";
import { describe, expect, it } from "vitest";

// Sign-in is counted per address, so a script guessing passwords is stopped. The phones on a farm's Wi-Fi share
// one address, though, and every screen they open asks whether they are still signed in: those questions are not
// guesses, and counting them locked the whole shed out on a busy morning.

const auth = createAuth();
const AUTH = `${env.BETTER_AUTH_URL}/api/auth`;
const WRONG_PASSWORDS_ALLOWED = 5;
const A_BUSY_MINUTE_OF_SESSION_CHECKS = 110;

/** A fresh address per test run: the counters live in the database, which every test file shares. */
const anAddress = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/** Sent one after another. Better Auth's database counter misses requests that arrive together, so a burst would
 *  pass these tests whatever the rules said. */
const statusesOf = async (times: number, send: () => Promise<Response>) => {
  const statuses: number[] = [];
  for (let sent = 0; sent < times; sent += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const response = await send();
    statuses.push(response.status);
  }
  return statuses;
};

describe("how often the farm's sign-in will answer one address", () => {
  it("does not count asking whether you are still signed in", async () => {
    const shedWifi = anAddress();
    const statuses = await statusesOf(A_BUSY_MINUTE_OF_SESSION_CHECKS, () =>
      auth.handler(
        new Request(`${AUTH}/get-session`, {
          headers: { "x-forwarded-for": shedWifi },
        })
      )
    );
    expect(statuses.filter((status) => status === 429)).toHaveLength(0);
  });

  it("still stops a sixth wrong password inside a minute", async () => {
    const guesser = anAddress();
    const statuses = await statusesOf(WRONG_PASSWORDS_ALLOWED + 1, () =>
      auth.handler(
        new Request(`${AUTH}/sign-in/email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: env.BETTER_AUTH_URL,
            "x-forwarded-for": guesser,
          },
          body: JSON.stringify({
            email: "nobody@test.openfarm",
            password: "not-the-password-at-all",
          }),
        })
      )
    );
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });
});
