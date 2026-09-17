import type { MessageKey } from "@OpenFarm/i18n";

import type { Tone } from "@/components/page";
import type { orpc } from "@/utils/orpc";

/** One Audit Event as the trail hands it back. */
export type AuditEvent = Awaited<
  ReturnType<typeof orpc.audit.list.call>
>[number];

/** The kinds of record the trail names, each with the reader's word for it. */
export const ENTITIES = [
  "user",
  "invite",
  "farm",
  "sop_instance",
  "animal",
  "step_completion",
  "report",
  "money_event",
  "sale",
  "mortality",
  "sync_entry",
  "sync_batch",
  "sop_proposal",
  "shed_phone",
  "feed_item",
  "diagnosis",
  "alert",
  "sop",
  "sop_version",
  "push_subscription",
  "pen",
  "shed",
  "money_category",
  "drug_product",
  "dispatch",
  "sop_training",
  "registration_certificate",
  "notifiable_disease",
  "feed_in",
  "dls_report",
  "abortion",
  "withdrawal",
  "weigh_in",
  "vet_fee",
  "ration",
  "prescription",
  "medicine_purchase",
  "repeat_breeder_answer",
  "ready_set_aside",
] as const;
type KnownEntity = (typeof ENTITIES)[number];

const isKnownEntity = (entity: string): entity is KnownEntity =>
  (ENTITIES as readonly string[]).includes(entity);

/** The reader's word for a kind of record, where the screen has one. */
export const entityLabelKey = (entity: string): MessageKey | null =>
  isKnownEntity(entity) ? `audit.entity.${entity}` : null;

/** How loud each kind of act is on the trail: a Correction stands out, a sign-in does not. */
export const ACTION_TONE: Record<AuditEvent["action"], Tone> = {
  create: "success",
  update: "info",
  correct: "warning",
  export: "neutral",
  login: "neutral",
};

/** What closed or reopened a piece of work, as the trail names it — a word for the screen to say in the reader's
 *  language — or nothing for a change a person made. */
export const becauseOf = (after: unknown): MessageKey | null => {
  const said = after as {
    calledOffBy?: unknown;
    raisedAgainBy?: unknown;
  } | null;
  if (typeof said?.calledOffBy === "string") {
    return `audit.calledOffBy.${said.calledOffBy}` as MessageKey;
  }
  if (typeof said?.raisedAgainBy === "string") {
    return `audit.raisedAgainBy.${said.raisedAgainBy}` as MessageKey;
  }
  return null;
};

/** One field of a record, as it stood before and after. */
export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const said = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "—";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
};

/**
 * The fields a change touched, read off what the record said before and after: every field whose value differs, in
 * the order they first appear. Nothing when either side is not a record of fields — the whole of each is shown then.
 */
export const fieldChanges = (
  before: unknown,
  after: unknown
): FieldChange[] => {
  const wasRecord = before === null || before === undefined || isRecord(before);
  if (!(wasRecord && isRecord(after))) {
    return [];
  }
  const was = isRecord(before) ? before : {};
  const fields = [...new Set([...Object.keys(was), ...Object.keys(after)])];
  return fields
    .map((field) => ({
      field,
      before: said(was[field]),
      after: said(after[field]),
    }))
    .filter((change) => change.before !== change.after);
};
