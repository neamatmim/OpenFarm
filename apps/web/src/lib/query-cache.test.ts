import type { PersistedClient } from "@tanstack/query-persist-client-core";
import { describe, expect, it } from "vitest";

import { readKept, writeKept } from "./query-cache";

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
