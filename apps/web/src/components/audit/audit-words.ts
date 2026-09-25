import { startOfFarmDay } from "@OpenFarm/domain";
import type { Language, MessageKey, MessageParams } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

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
  "investor",
  "eid_announcement",
  "paper_template",
  "paper_template_version",
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A line of why, in the reader's words. */
export interface Saying {
  key: MessageKey;
  params?: MessageParams;
}

const countOf = (after: Record<string, unknown>, field: string): number => {
  const value = after[field];
  return typeof value === "number" ? value : 0;
};

/**
 * Why the farm raised work, where the farm did and not a person: the day's turn — how much it raised and by what —
 * or work raised by hand. A turn written before the trail said how much it raised says only that the farm looked.
 * Nothing for any other event, whose why is the reason somebody gave.
 */
export const whyRaised = (
  event: Pick<AuditEvent, "entity" | "entityId" | "action" | "after">
): Saying[] => {
  if (event.entity !== "sop_instance" || event.action !== "create") {
    return [];
  }
  const after = isRecord(event.after) ? event.after : {};
  if (!event.entityId.startsWith("schedule:")) {
    return typeof after.definitionId === "string"
      ? [{ key: "audit.raised.byHand" }]
      : [];
  }
  if (typeof after.raised !== "number") {
    return [{ key: "audit.raised.checked" }];
  }
  const said: Saying[] = [];
  const onTheSchedule = countOf(after, "byTheSchedule");
  const byWhatHappened = countOf(after, "byWhatHappened");
  if (onTheSchedule > 0) {
    said.push({
      key: "audit.raised.onSchedule",
      params: { count: onTheSchedule },
    });
  }
  if (byWhatHappened > 0) {
    said.push({
      key: "audit.raised.byWhatHappened",
      params: { count: byWhatHappened },
    });
  }
  if (countOf(after, "forTheRenewal") > 0) {
    said.push({ key: "audit.raised.forTheRenewal" });
  }
  return said;
};

/** One field of a record, as it stood before and after. */
export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

/** A figure the database keeps as text: always with its decimals, so a phone or an NID, which has none, is not one. */
const DECIMAL_TEXT = /^-?\d+\.\d+$/u;
const FARM_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u;

/** A text value as the reader would read it: a figure in their numerals, a day or a moment as the screens say one,
 *  and anything else — a tag, a phone, a code — as it was written. */
const saidText = (value: string, language: Language): string => {
  if (DECIMAL_TEXT.test(value)) {
    return formatNumber(Number(value), language);
  }
  if (FARM_DAY.test(value)) {
    return formatDate(startOfFarmDay(value), language, "date");
  }
  if (INSTANT.test(value) && !Number.isNaN(Date.parse(value))) {
    return formatDate(new Date(value), language, "dateTime");
  }
  return value;
};

const said = (value: unknown, language: Language): string => {
  if (value === undefined || value === null) {
    return "—";
  }
  if (typeof value === "number") {
    return formatNumber(value, language);
  }
  return typeof value === "string"
    ? saidText(value, language)
    : JSON.stringify(value);
};

/**
 * The fields a change touched, read off what the record said before and after: every field whose value differs, in
 * the order they first appear. Nothing when either side is not a record of fields — the whole of each is shown then.
 */
export const fieldChanges = (
  before: unknown,
  after: unknown,
  language: Language
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
      before: said(was[field], language),
      after: said(after[field], language),
    }))
    .filter((change) => change.before !== change.after);
};

/** The fields of a record the trail has a word for: what a change touched, named as the screens name it. */
const NAMED_FIELDS = new Set<string>([
  "phone",
  "address",
  "nid",
  "bankAccount",
  "nominee",
  "nomineePhone",
  "nomineeRelation",
  "state",
  "assignedTo",
  "claimedBy",
  "claimedAt",
  "completedAt",
  "status",
  "animalId",
  "destination",
  "skipReason",
  "outOfRange",
  "evidence",
  "effect",
  "stepId",
  "slots",
  "raised",
  "byTheSchedule",
  "byWhatHappened",
  "forTheRenewal",
  "penId",
  "id",
  "definitionId",
  "money",
  "recordedAt",
  "farmId",
  "recordedByRole",
  "recordedBy",
  "side",
  "tagNumber",
  "sex",
  "source",
  "breed",
  "aliases",
  "officialTag",
  "birthDate",
  "lactationNumber",
  "lactationStartedAt",
  "expectedCalvingAt",
  "milkWithdrawalUntil",
  "meatWithdrawalUntil",
  "milkWithdrawalFromDoses",
  "meatWithdrawalFromDoses",
  "withdrawalShortenedAt",
  "withdrawalShortenedReason",
  "photoUpdatedAt",
  "stateChangedAt",
  "amountBdt",
  "approval",
  "approvedBy",
  "approvedAt",
  "note",
  "counterpartyId",
  "priceBdt",
  "kind",
  "receivedOn",
  "quantity",
  "feedItemId",
  "dispatchedAt",
  "challan",
  "litres",
  "pricePerLitreBdt",
  "fatPercent",
  "snfPercent",
  "buyerId",
  "buyerName",
  "buyerAddress",
  "name",
  "nameBn",
  "nameEn",
  "intake",
  "rationId",
  "language",
  "wageMonth",
  "categoryId",
  "paymentMethod",
  "direction",
  "receiptKeptAt",
  "occurredAt",
  "version",
  "versionId",
  "roles",
  "trainedAt",
  "userId",
  "milkWithdrawalDays",
  "meatWithdrawalDays",
  "number",
  "items",
  "registrationNumber",
  "shedId",
  "lowStockAt",
  "unit",
  "email",
  "doses",
  "days",
  "productId",
  "route",
  "times",
  "dose",
  "visitUntil",
  "disease",
  "diseaseEn",
  "observationId",
  "buyer",
  "driver",
  "vehicle",
  "soldAt",
  "weightKg",
  "vetId",
  "vaccine",
  "retiredAt",
  "invitedAt",
  "acceptedAt",
  "revokedAt",
  "revokedWhy",
  "codeExpiresAt",
  "signedOn",
  "withdrawnOn",
  "withdrawnHow",
  "visitedOn",
  "pinSet",
  "from",
  "to",
  "format",
  "report",
]);

/** The reader's word for a field a change touched, where the trail has one; a field it has no word for is shown as it
 *  is stored. */
export const fieldLabelKey = (field: string): MessageKey | null =>
  NAMED_FIELDS.has(field) ? (`auditField.${field}` as MessageKey) : null;
