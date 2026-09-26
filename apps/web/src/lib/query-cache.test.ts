import type { PersistedClient } from "@tanstack/query-persist-client-core";
import { describe, expect, it } from "vitest";

import { orpc } from "@/utils/orpc";

import { keptOnDevice, readKept, writeKept } from "./query-cache";

describe("the cache a phone keeps", () => {
  it("gives back a date as a date, however deep in an answer it sits", () => {
    const asOf = new Date("2026-09-14T04:00:00.000Z");
    const kept = {
      timestamp: 1,
      buster: "",
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ["inspector", "view"],
            queryHash: "view",
            state: { data: { herd: { asOf, total: 3 }, note: "$date" } },
          },
        ],
      },
    } as unknown as PersistedClient;

    const back = readKept(writeKept(kept));
    const data = back.clientState.queries[0]?.state.data as {
      herd: { asOf: unknown; total: number };
      note: string;
    };

    expect(data.herd.asOf).toBeInstanceOf(Date);
    expect(data.herd.asOf).toEqual(asOf);
    expect(data.herd.total).toBe(3);
    // A string that merely says "$date" is still a string.
    expect(data.note).toBe("$date");
  });
});

/** A question that answered, under the key the app's own client gives it. */
const answered = (queryKey: readonly unknown[]) => ({
  queryKey,
  state: { status: "success" },
});

describe("what a phone keeps", () => {
  it("keeps the farm's answers, for a shed with no signal", () => {
    expect(
      keptOnDevice(answered(orpc.animals.list.queryKey({ input: {} })), "farm")
    ).toBe(true);
  });

  it("never keeps an Investor's, which would outlive their signing out", () => {
    expect(
      keptOnDevice(answered(orpc.portal.portfolio.queryKey()), "farm")
    ).toBe(false);
    expect(keptOnDevice(answered(orpc.portal.me.queryKey()), "farm")).toBe(
      false
    );
    expect(
      keptOnDevice(
        answered(orpc.portal.venture.queryKey({ input: { agreementId: "a" } })),
        "farm"
      )
    ).toBe(false);
  });

  it("never keeps a question that failed", () => {
    expect(
      keptOnDevice(
        {
          queryKey: orpc.animals.list.queryKey({ input: {} }),
          state: { status: "error" },
        },
        "farm"
      )
    ).toBe(false);
  });

  it("keeps nothing at all on the Investor address, whatever was asked", () => {
    // The portal's own origin (ADR 0009): a shared family phone keeps no answer of anybody's there.
    for (const queryKey of [
      orpc.animals.list.queryKey({ input: {} }),
      orpc.people.me.queryKey(),
      orpc.portal.portfolio.queryKey(),
      ["portal-front-door"],
    ]) {
      expect(keptOnDevice(answered(queryKey), "portal")).toBe(false);
    }
    expect(keptOnDevice(answered(orpc.people.me.queryKey()), "farm")).toBe(
      true
    );
  });
});
