import type { MessageKey, MessageParams } from "@OpenFarm/i18n";
import { describe, expect, it } from "vitest";

import { refusedLines } from "./several-refused";

// One act done for a Pen at once: the ones the farm would not do it for are each named by tag, with why, in the
// reader's words — the day she is fit, for one still held.

/** Words in brackets, so a sentence said is told from a key nobody wrote words for. */
const t = (key: MessageKey, params?: MessageParams) =>
  params && Object.keys(params).length > 0
    ? `[${key} ${JSON.stringify(params)}]`
    : `[${key}]`;

describe("why each of several was refused", () => {
  it("says the day one under her meat withdrawal is fit", () => {
    const [line] = refusedLines(
      [
        {
          tagNumber: "F-0012",
          refusal: "meat_withdrawal",
          fitOn: "2075-04-24T06:00:00.000Z",
        },
      ],
      t,
      () => "24 April"
    );

    expect(line).toBe('F-0012: [ready.underWithdrawal {"when":"24 April"}]');
  });

  it("says any other refusal by its own word", () => {
    const [line] = refusedLines(
      [{ tagNumber: "F-0013", refusal: "not_fattening" }],
      t,
      () => ""
    );

    expect(line).toBe("F-0013: [refusal.notFattening]");
  });
});
