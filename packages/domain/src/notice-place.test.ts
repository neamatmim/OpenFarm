import { describe, expect, it } from "vitest";

import { ALERT_KINDS } from "./alerts";
import { addressOf, whereANoticeLeads } from "./notice-place";

const notice = (
  kind: string,
  params: Record<string, unknown> = {},
  entity = "farm",
  entityId = "e1"
) => ({ kind, entity, entityId, params });

const toTheOwner = { runsTheFarm: true };
const leads = (one: ReturnType<typeof notice>, reader = toTheOwner) => {
  const place = whereANoticeLeads(one, reader);
  return place ? addressOf(place) : null;
};

describe("where a notice leads", () => {
  it("takes a kind of its own to its own page, whatever it names", () => {
    expect(leads(notice("low_stock", { tag: "D-1" }, "animal"))).toBe("/feed");
    expect(leads(notice("backup_overdue"))).toBe("/farm/backups");
    expect(leads(notice("work_missed", {}, "sop_instance"))).toBe(
      "/review-queue/overdue"
    );
  });

  it("takes the rest to what they name: the work, else her, else nowhere", () => {
    expect(leads(notice("instance_overdue", {}, "sop_instance", "w9"))).toBe(
      "/work/w9"
    );
    expect(
      leads(notice("withdrawal_ending", { tag: "D-0053" }, "animal"))
    ).toBe("/animals/D-0053");
    expect(leads(notice("password_guessed"))).toBeNull();
  });

  it("finds a Venture's page by the Venture it names, at its section", () => {
    expect(leads(notice("pay_in_note_sent", { ventureId: "v1" }))).toBe(
      "/ventures/v1/investors#pay-in-notes"
    );
    expect(leads(notice("join_requested", { ventureId: "v1" }))).toBe(
      "/ventures/v1/investors#requests"
    );
    expect(leads(notice("investor_statement_due", { ventureId: "v1" }))).toBe(
      "/ventures/v1/investors"
    );
    expect(leads(notice("investor_statement_due"))).toBeNull();
    expect(
      leads(notice("reimbursement_due", { ventureId: "v1", month: "2026-09" }))
    ).toBe("/ventures/v1?reimburse=2026-09");
  });

  it("opens the money on the day entered twice, not this month", () => {
    expect(leads(notice("entered_twice", { day: "2026-09-30" }))).toBe(
      "/money?from=2026-09-30&to=2026-09-30"
    );
  });

  it("sends a Lot of feed to the feed store and one of medicine to the medicines", () => {
    expect(leads(notice("lot_expiring", { what: "feed" }))).toBe("/feed");
    expect(leads(notice("lot_expiring", { what: "medicine" }))).toBe("/drugs");
  });

  it("opens a procedure's pages to those who run the farm, and the work list to the rest", () => {
    const retired = notice("sop_retired", { definitionId: "d1" });
    expect(leads(retired)).toBe("/sops/d1/card");
    expect(leads(retired, { runsTheFarm: false })).toBe("/work");
    expect(leads(notice("sop_published"))).toBe("/sops");
  });

  it("answers for every kind the farm raises", () => {
    for (const kind of ALERT_KINDS) {
      expect(
        () => whereANoticeLeads(notice(kind), toTheOwner),
        kind
      ).not.toThrow();
    }
  });

  it("writes a path's parts safely into the address", () => {
    expect(leads(notice("withdrawal_ending", { tag: "D 1/2" }, "animal"))).toBe(
      "/animals/D%201%2F2"
    );
  });
});
