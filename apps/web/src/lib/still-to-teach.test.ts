import { describe, expect, it } from "vitest";

import { stillToTeach } from "./still-to-teach";

const person = (id: string, disabledAt: string | null = null) => ({
  id,
  name: id,
  disabledAt,
});

describe("who may still be marked as taught a procedure", () => {
  it("offers everybody not yet taught the Version in force, and nobody whose access is gone", () => {
    const people = [
      person("rahim"),
      person("karim"),
      person("jashim"),
      person("gone", "2026-10-01"),
    ];
    const trained = [
      { userId: "rahim", latest: true, onVersionInForce: true },
      // Taught the Version before: the change is what he has not been taught.
      { userId: "karim", latest: true, onVersionInForce: false },
    ];
    expect(stillToTeach(people, trained).map((one) => one.id)).toEqual([
      "karim",
      "jashim",
    ]);
  });
});
