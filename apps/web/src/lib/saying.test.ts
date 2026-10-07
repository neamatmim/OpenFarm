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
  it("says a save that never reached the farm was not saved, in words, never the browser's", () => {
    for (const lost of [
      new TypeError("Failed to fetch"),
      new TypeError("NetworkError when attempting to fetch resource."),
      new TypeError("Load failed"),
      Object.assign(new Error("The operation was aborted."), {
        name: "AbortError",
      }),
    ]) {
      expect(sayWhy(lost, t)).toBe(t("common.noSignalNotSaved"));
    }
    // A mistake in the screen's own code is no lost connection.
    expect(sayWhy(new TypeError("x is undefined"), t)).not.toBe(
      t("common.noSignalNotSaved")
    );
  });

  it("says a refusal the farm has its own word for", () => {
    expect(sayWhy(refused("changed_since"), t)).toBe(t("refusal.changedSince"));
  });

  it("says the screen's own words for what only that screen meets", () => {
    const words = { no_treatment_sop: "prescribe.noTreatmentSop" } as const;
    expect(sayWhy(refused("no_treatment_sop"), t, words)).toBe(
      t("prescribe.noTreatmentSop")
    );
  });

  it("fills the screen's own words with what the refusal names", () => {
    // Setup asks for every standard Ration at once, so "that feed is retired" would leave the Owner asking which.
    const words = { feed_retired: "setup.standard.feedRetired" } as const;
    const retired = Object.assign(new Error("server's English"), {
      data: { refusal: "feed_retired", feed: "Rice straw" },
    });
    expect(sayWhy(retired, t, words)).toContain("Rice straw");
  });

  it("names the window when a Correction is out of time", () => {
    const outOfTime = refused({
      role: "staff",
      ownEntriesOnly: true,
      hours: 12,
    });
    expect(sayWhy(outOfTime, t)).toContain(t("role.staff"));
  });

  it("never says the server's English, even for a refusal the farm has no word for", () => {
    // The reader is standing at an animal with a Bangla phone: "This work is not overdue yet" told her nothing.
    expect(sayWhy(refused("no_word_yet", "She has already been sold"), t)).toBe(
      t("common.error")
    );
    expect(sayWhy(new Error("the network went"), t)).toBe(t("common.error"));
    expect(sayWhy({}, t)).toBe(t("common.error"));
  });

  it("says a figure the farm's checks refused, and a door not open to this Role, in words", () => {
    const badFigure = Object.assign(new Error("Input validation failed"), {
      code: "BAD_REQUEST",
      data: { issues: [{ path: ["tagNumber"], message: "Expected string" }] },
    });
    expect(sayWhy(badFigure, t)).toBe(t("common.figureRefused"));
    const notOpen = Object.assign(new Error("Forbidden"), {
      code: "FORBIDDEN",
    });
    expect(sayWhy(notOpen, t)).toBe(t("common.forbidden"));
  });

  it("says a phone that cannot keep work kept none", () => {
    expect(sayWhy(refused("cannot_keep_work"), t)).toBe(
      t("common.cannotKeepWork")
    );
  });

  it("says what a held Entry was refused for, when a phone's queue says so", () => {
    expect(sayWhy(refused({ category: "late", word: "moved_since" }), t)).toBe(
      t("standsAside.movedSince")
    );
  });
});
