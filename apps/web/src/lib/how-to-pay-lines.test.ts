import { describe, expect, it } from "vitest";

import { howToPayLines } from "./how-to-pay-lines";

// The lines under "How to pay" on a Venture paid by the month. The portal told every such Investor to "record the
// actual bank transfer date and reference" with nowhere to record it while the farm takes no Pay-in Notes, and kept
// the Cattle Part's decision date up long after the buying had started.

describe("the lines under how to pay", () => {
  it("asks them to tell the farm the transfer only where the portal takes a Pay-in Note", () => {
    expect(
      howToPayLines({ monthly: true, mayTell: false, gathering: true })
    ).toMatchObject({ early: true, tellTheTransfer: false });
    expect(
      howToPayLines({ monthly: true, mayTell: true, gathering: true })
    ).toMatchObject({ early: true, tellTheTransfer: true });
  });

  it("says the Cattle Part's decision date only while the Venture still gathers", () => {
    expect(
      howToPayLines({ monthly: true, mayTell: false, gathering: true })
    ).toMatchObject({ cattleDeadline: true });
    expect(
      howToPayLines({ monthly: true, mayTell: false, gathering: false })
    ).toMatchObject({ cattleDeadline: false });
  });

  it("says none of them on a Venture paid before buying", () => {
    expect(
      howToPayLines({ monthly: false, mayTell: true, gathering: true })
    ).toEqual({ early: false, tellTheTransfer: false, cattleDeadline: false });
  });
});
