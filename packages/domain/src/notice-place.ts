import type { MessageKey } from "@OpenFarm/i18n";

import type { AlertKind } from "./alerts";

/** Where on a Venture's Investors tab its Pay-in Notes and its Requests to Join begin, for a notice to land on. */
export const PAY_IN_ANCHOR = "pay-in-notes";
export const REQUESTS_ANCHOR = "requests";

/** The pages a notice may lead to, by the path the web app routes them by. */
type FixedPath =
  | "/audit"
  | "/drugs"
  | "/farm/backups"
  | "/farm/eid-dates"
  | "/feed"
  | "/feed/feed-in"
  | "/feed/stock-counts"
  | "/milk/reconciliation"
  | "/money"
  | "/money/cash"
  | "/money/receivables"
  | "/observations"
  | "/outbox"
  | "/review-queue/needs-review"
  | "/review-queue/overdue"
  | "/sops"
  | "/sops/proposals"
  | "/work";

export type NoticePath =
  | FixedPath
  | "/animals/$tagNumber"
  | "/sops/$definitionId/card"
  | "/ventures/$ventureId"
  | "/ventures/$ventureId/investors"
  | "/work/$instanceId";

/** Where a notice leads: a page, what fills its path in, and the words of the way there. */
export interface NoticePlace {
  to: NoticePath;
  params?: Record<string, string>;
  search?: Record<string, string>;
  hash?: string;
  label: MessageKey;
  labelParams?: Record<string, string>;
}

/** A page a kind always leads to, whatever it names. */
interface Fixed {
  to: FixedPath;
  label: MessageKey;
}

/**
 * What a kind of notice leads to:
 * - a page of its own, whatever it names;
 * - a tab of the Venture it names — its Investors, or reimbursing it for the month;
 * - the money of the day it names;
 * - the card of the procedure it names;
 * - "what it names": the work it is about, else the animal it names by her tag, else nowhere.
 */
type Lead =
  | Fixed
  | { investors: MessageKey; hash?: string }
  | "reimbursing"
  | "the day's money"
  | "its card"
  | "what it names";

const TO_THE_BACKUPS: Fixed = {
  to: "/farm/backups",
  label: "alerts.openTheBackups",
};
const TO_THE_MEDICINES: Fixed = {
  to: "/drugs",
  label: "alerts.openTheMedicines",
};
const TO_WHO_OWES: Fixed = {
  to: "/money/receivables",
  label: "alerts.seeWhoOwes",
};

/**
 * Where every kind of notice leads, said once for the in-app list and the push alike. Every kind is here, so a new one
 * says where it leads before it can be raised.
 */
const LEADS = {
  instance_overdue: "what it names",
  instance_escalated: "what it names",
  instance_sent_back: "what it names",
  needs_review: {
    to: "/review-queue/needs-review",
    label: "alerts.openTheReviews",
  },
  sop_published: { to: "/sops", label: "alerts.openTheProcedures" },
  sop_proposed: { to: "/sops/proposals", label: "alerts.readTheProposals" },
  sop_retired: "its card",
  sop_restored: "its card",
  withdrawal_ending: "what it names",
  notifiable_diagnosis: "what it names",
  entry_rejected: { to: "/outbox", label: "alerts.openTheOutbox" },
  withdrawal_changed: "what it names",
  low_stock: { to: "/feed", label: "alerts.openTheStore" },
  money_awaiting_approval: { to: "/money", label: "alerts.openTheMoney" },
  registration_renewal_due: "what it names",
  investor_statement_due: { investors: "alerts.makeThePaper" },
  reimbursement_due: "reimbursing",
  day_not_turning: TO_THE_BACKUPS,
  backup_overdue: TO_THE_BACKUPS,
  server_failing: TO_THE_BACKUPS,
  // A Lot of feed near its day is in the feed store, not among the medicines (`whereANoticeLeads`).
  lot_expiring: TO_THE_MEDICINES,
  lot_expired: TO_THE_MEDICINES,
  medicine_low_stock: TO_THE_MEDICINES,
  expired_dose_given: "what it names",
  join_requested: {
    investors: "alerts.readTheRequests",
    hash: REQUESTS_ANCHOR,
  },
  receivable_overdue: TO_WHO_OWES,
  animal_missing: "what it names",
  store_shortfall: { to: "/feed/stock-counts", label: "alerts.openTheCounts" },
  pen_sores_seen: { to: "/observations", label: "alerts.openObservations" },
  milk_unaccounted: { to: "/milk/reconciliation", label: "alerts.openTheMilk" },
  head_count_differs: "what it names",
  dose_not_prescribed: "what it names",
  entered_twice: "the day's money",
  sold_under_cost: "what it names",
  still_here_after_eid: { to: "/farm/eid-dates", label: "alerts.openTheEids" },
  medicine_short: TO_THE_MEDICINES,
  feed_price_jump: { to: "/feed/feed-in", label: "alerts.openTheArrivals" },
  settings_changed: { to: "/audit", label: "alerts.openTheTrail" },
  cash_short: { to: "/money/cash", label: "alerts.openTheCash" },
  arrival_weight_short: "what it names",
  large_shrink: "what it names",
  mortality_recorded: "what it names",
  mortality_undiagnosed: "what it names",
  monthly_sum_missed: { investors: "alerts.seeWhoIsBehind" },
  pay_in_note_sent: {
    investors: "alerts.checkThePayInNotes",
    hash: PAY_IN_ANCHOR,
  },
  credit_after_write_off: TO_WHO_OWES,
  password_guessed: "what it names",
  monthly_copy_failed: TO_THE_BACKUPS,
  // Filed under work, but about many pieces of it: the list they are on, never one card.
  work_missed: { to: "/review-queue/overdue", label: "alerts.openTheOverdue" },
  taken_back: "what it names",
  proposal_answered: "what it names",
} as const satisfies Record<AlertKind, Lead>;

/** The notices about the procedures themselves: their pages are for those who run the farm. A milker or the Vet is
 *  told what changed, and has nowhere there to be sent — the work list is where the procedure reaches them. */
const ABOUT_THE_PROCEDURES: ReadonlySet<string> = new Set([
  "sop_published",
  "sop_retired",
  "sop_restored",
]);

/** A notice as it is kept: its kind, what it is about, and the facts it was raised with. */
export interface NoticeAsKept {
  kind: string;
  entity: string;
  entityId: string;
  params: unknown;
}

/** One of a notice's facts, where it is a word: read as defensively as any snapshot from the past. */
const factOf = (params: unknown, name: string): string | null => {
  const value = (params as Record<string, unknown> | null)?.[name];
  return typeof value === "string" && value !== "" ? value : null;
};

const whatItNames = (notice: NoticeAsKept): NoticePlace | null => {
  if (notice.entity === "sop_instance") {
    return {
      to: "/work/$instanceId",
      params: { instanceId: notice.entityId },
      label: "alerts.openTheWork",
    };
  }
  const tag = factOf(notice.params, "tag");
  return tag === null
    ? null
    : {
        to: "/animals/$tagNumber",
        params: { tagNumber: tag },
        label: "alerts.openHer",
        labelParams: { tag },
      };
};

const leadOf = (kind: string): Lead | undefined =>
  (LEADS as Partial<Record<string, Lead>>)[kind];

/**
 * Where a notice leads — to what it is about, so the notice is a way there rather than a sentence to go and act on
 * somewhere else — or nothing, for one about none of the farm's pages, which "got it" alone answers. `runsTheFarm` is
 * whether the reader is the Owner or a Manager, who alone are sent to the procedures' own pages.
 */
export const whereANoticeLeads = (
  notice: NoticeAsKept,
  { runsTheFarm }: { runsTheFarm: boolean }
): NoticePlace | null => {
  if (ABOUT_THE_PROCEDURES.has(notice.kind) && !runsTheFarm) {
    return { to: "/work", label: "alerts.openTheWorkList" };
  }
  const isAFeedLot =
    (notice.kind === "lot_expiring" || notice.kind === "lot_expired") &&
    factOf(notice.params, "what") === "feed";
  if (isAFeedLot) {
    return { to: "/feed", label: "alerts.openTheStore" };
  }
  const lead = leadOf(notice.kind) ?? "what it names";
  if (typeof lead === "object") {
    if ("to" in lead) {
      return { to: lead.to, label: lead.label };
    }
    const ventureId = factOf(notice.params, "ventureId");
    return ventureId === null
      ? null
      : {
          to: "/ventures/$ventureId/investors",
          params: { ventureId },
          ...(lead.hash ? { hash: lead.hash } : {}),
          label: lead.investors,
        };
  }
  if (lead === "reimbursing") {
    const ventureId = factOf(notice.params, "ventureId");
    const month = factOf(notice.params, "month");
    return ventureId === null
      ? null
      : {
          to: "/ventures/$ventureId",
          params: { ventureId },
          search: month === null ? {} : { reimburse: month },
          label: "alerts.reimburseNow",
        };
  }
  if (lead === "the day's money") {
    // The day it was for, not this month: money entered twice in another month is not on this month's page.
    const day = factOf(notice.params, "day");
    return {
      to: "/money",
      search: day === null ? {} : { from: day, to: day },
      label: "alerts.openTheMoney",
    };
  }
  if (lead === "its card") {
    const definitionId = factOf(notice.params, "definitionId");
    if (definitionId !== null) {
      return {
        to: "/sops/$definitionId/card",
        params: { definitionId },
        label: "alerts.openTheCard",
      };
    }
  }
  return whatItNames(notice);
};

/** The address a place is at, its path filled in, for a push to open. */
export const addressOf = (place: NoticePlace): string => {
  const path = place.to.replaceAll(/\$(?<name>\w+)/gu, (_, name: string) =>
    encodeURIComponent(place.params?.[name] ?? "")
  );
  const search = new URLSearchParams(place.search ?? {}).toString();
  return `${path}${search ? `?${search}` : ""}${place.hash ? `#${place.hash}` : ""}`;
};
