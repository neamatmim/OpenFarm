import { describe, expect, it } from "vitest";

import type { GoingLiveStanding } from "./going-live-rows";
import { goingLiveDone, goingLiveProgress } from "./going-live-rows";

/** A farm with everything done, to take one thing away from at a time. */
const ready: GoingLiveStanding = {
  identity: true,
  registration: true,
  certificate: true,
  copiedLately: true,
  manager: true,
  vet: true,
  medicines: { total: 15, withDays: 15 },
  staff: { total: 4, ready: 4 },
  phones: { setUp: 2, waiting: 0 },
  monthlyCosts: 2,
  herd: { onRegister: 220, photographed: 220 },
  openingCount: { counted: 220, onRegister: 220 },
  procedures: { standardAdopted: 30, doseAdopted: 12, own: 1 },
  trained: { people: 5, of: 5 },
  paperPutAway: { day: 30 },
};

describe("which lines of going live are done", () => {
  it("takes a farm with everything in as done throughout", () => {
    expect(goingLiveProgress(ready)).toEqual({ done: 16, of: 16 });
  });

  it("is not done while one medicine waits for the Vet, one worker cannot work, or one phone never took its code", () => {
    expect(
      goingLiveDone({ ...ready, medicines: { total: 15, withDays: 14 } })
        .medicines
    ).toBe(false);
    expect(
      goingLiveDone({ ...ready, staff: { total: 4, ready: 3 } }).staff
    ).toBe(false);
    expect(
      goingLiveDone({ ...ready, phones: { setUp: 2, waiting: 1 } }).phones
    ).toBe(false);
  });

  it("says nothing counted is not done: no medicines, no workers, no herd", () => {
    const empty = goingLiveDone({
      ...ready,
      medicines: { total: 0, withDays: 0 },
      staff: { total: 0, ready: 0 },
      herd: { onRegister: 0, photographed: 0 },
      trained: { people: 0, of: 0 },
    });
    expect(empty.medicines).toBe(false);
    expect(empty.staff).toBe(false);
    expect(empty.register).toBe(false);
    expect(empty.photos).toBe(false);
    expect(empty.training).toBe(false);
  });

  it("has the register in only when the Owner's count agrees with it", () => {
    expect(
      goingLiveDone({
        ...ready,
        openingCount: { counted: 219, onRegister: 220 },
      }).count
    ).toBe(false);
    expect(goingLiveDone({ ...ready, openingCount: null }).count).toBe(false);
  });

  it("counts thirty days without paper, not twenty-nine", () => {
    expect(goingLiveDone({ ...ready, paperPutAway: { day: 29 } }).paper).toBe(
      false
    );
    expect(goingLiveDone({ ...ready, paperPutAway: null }).paper).toBe(false);
  });
});
