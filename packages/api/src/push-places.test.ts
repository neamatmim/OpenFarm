import { describe, expect, it } from "vitest";

import { urlOf } from "./push";

// A push opens where the notice in the app leads. The kinds filed under something they are not one of opened the wrong
// page: a failed monthly copy and sores in a Pen opened the day's list, and the work missed while the farm was down —
// filed under work — would have opened a card that is not there.

const about = (kind: string, entity: string, entityId: string) => ({
  kind,
  entity,
  entityId,
  params: {},
});

describe("where a push opens", () => {
  it("is the place the notice in the app leads to", () => {
    expect(urlOf(about("monthly_copy_failed", "backup_run", "monthly:1"))).toBe(
      "/farm/backups"
    );
    expect(urlOf(about("pen_sores_seen", "pen", "pen-1"))).toBe(
      "/observations"
    );
    expect(
      urlOf(about("work_missed", "sop_instance", "missed:2026-10-01T00:00:00Z"))
    ).toBe("/review-queue/overdue");
  });

  it("is still the work for late work, and her page for a notice naming her", () => {
    expect(urlOf(about("instance_overdue", "sop_instance", "w-1"))).toBe(
      "/work/w-1"
    );
    expect(
      urlOf({
        ...about("withdrawal_changed", "animal", "a-1"),
        params: { tag: "D-0001" },
      })
    ).toBe("/animals/D-0001");
  });
});
