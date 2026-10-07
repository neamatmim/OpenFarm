import { describe, expect, it } from "vitest";

import { SAYS, wakesTheFarm } from "./notify";

// The two safety notices reached a phone only by SMS, to the Owner and the Manager: the milkers of the cow's Pen were
// told only in the app. Both push now; a notifiable disease wakes the farm, a Withdrawal ending waits for the morning
// (the Owner, 2026-10-07).

describe("the safety notices", () => {
  it("push as well as text", () => {
    expect(SAYS.withdrawal_ending.push).toBeDefined();
    expect(SAYS.notifiable_diagnosis.push).toBeDefined();
    expect(SAYS.withdrawal_ending.sms).toBeDefined();
    expect(SAYS.notifiable_diagnosis.sms).toBeDefined();
  });

  it("wake the farm for a notifiable disease, and let a Withdrawal ending wait for the morning", () => {
    expect(wakesTheFarm("notifiable_diagnosis")).toBe(true);
    expect(wakesTheFarm("withdrawal_ending")).toBe(false);
  });
});
