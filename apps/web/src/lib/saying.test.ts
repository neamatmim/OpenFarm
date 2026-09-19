import type { MessageKey, MessageParams } from "@OpenFarm/i18n";
import { translate } from "@OpenFarm/i18n";
import { describe, expect, it } from "vitest";

import { sayWhy } from "./saying";

// Why the farm would not take something, in the reader's own language. The person reading it is standing at an animal
// with a phone, so the one thing that must never happen is nothing at all.

const t = (key: MessageKey, params?: MessageParams) =>
  translate("en", key, params);

const refused = (refusal: unknown, message = "server's English") =>
  Object.assign(new Error(message), { data: { refusal } });

describe("saying why the farm refused", () => {
  it("says a refusal the farm has its own word for", () => {
    expect(sayWhy(refused("changed_since"), t)).toBe(t("refusal.changedSince"));
  });

  it("says the screen's own words for what only that screen meets", () => {
    const words = { no_treatment_sop: "prescribe.noTreatmentSop" } as const;
    expect(sayWhy(refused("no_treatment_sop"), t, words)).toBe(
      t("prescribe.noTreatmentSop")
    );
  });

  it("names the window when a Correction is out of time", () => {
    const outOfTime = refused({
      role: "staff",
      ownEntriesOnly: true,
      hours: 12,
    });
    expect(sayWhy(outOfTime, t)).toContain(t("role.staff"));
  });

  it("falls back to what the server said when the farm has no word for it", () => {
    // Sixteen of the farm's refusals have no wording of their own — a cow already sold, a hold that may not be made
    // longer. The person must still be told something, and the server's English is better than silence.
    // Which sixteen is pinned in `i18n/unworded-refusals.test.ts`, so a seventeenth cannot arrive unnoticed.
    expect(
      sayWhy(refused("already_sold", "She has already been sold"), t)
    ).toBe("She has already been sold");
  });

  it("says something for an error the farm gave no refusal with at all", () => {
    expect(sayWhy(new Error("the network went"), t)).toBe("the network went");
    expect(sayWhy({}, t)).toBe(t("common.error"));
  });

  it("says what a held Entry was refused for, when a phone's queue says so", () => {
    expect(sayWhy(refused({ category: "late", word: "moved_since" }), t)).toBe(
      t("standsAside.movedSince")
    );
  });
});
