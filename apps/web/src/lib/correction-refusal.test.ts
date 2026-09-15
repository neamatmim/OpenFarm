import type { MessageKey, MessageParams } from "@OpenFarm/i18n";
import { translate } from "@OpenFarm/i18n";
import { describe, expect, it } from "vitest";

import { correctionRefusalMessage, isChangedSince } from "./correction-refusal";

// Every way the farm refuses a Correction, said in the reader's language rather than the server's English.

const t = (key: MessageKey, params?: MessageParams) =>
  translate("en", key, params);

const refused = (refusal: unknown) => ({
  message: "server's English",
  data: { refusal },
});

describe("a refused Correction", () => {
  it("names the window that has closed", () => {
    expect(
      correctionRefusalMessage(
        refused({
          word: "window_closed",
          role: "manager",
          windowHours: 720,
          ownEntriesOnly: false,
          days: 30,
        }),
        t
      )
    ).toBe("A Manager may put an entry right for 30 days after it was made");
  });

  it("says a record is not theirs when no Role they hold may correct it", () => {
    expect(
      correctionRefusalMessage(
        refused({
          word: "not_theirs",
          role: null,
          windowHours: 0,
          ownEntriesOnly: true,
          hours: 0,
        }),
        t
      )
    ).toBe("That is not yours to correct");
  });

  it("says somebody corrected it since, and knows the screen is stale", () => {
    const stale = refused("changed_since");
    expect(correctionRefusalMessage(stale, t)).toBe(
      "Someone corrected this since you opened it. Open it again to see what it says now."
    );
    expect(isChangedSince(stale)).toBe(true);
    expect(isChangedSince(refused("nothing_to_correct"))).toBe(false);
  });

  it("says nothing was changed", () => {
    expect(correctionRefusalMessage(refused("nothing_to_correct"), t)).toBe(
      "Nothing was changed, so there is nothing to correct"
    );
  });

  it("leaves an error that is not a refusal to the caller", () => {
    expect(correctionRefusalMessage(new Error("offline"), t)).toBeNull();
  });
});
