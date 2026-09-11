import type { AnimalState, Side } from "./lifecycle";
import { STATES } from "./lifecycle";
import type { ROLES } from "./roles";

/** SOP content is authored in Bangla; English is optional and used for reports and a
 *  visiting Vet (i18n decision, ticket 02). */
export interface Bilingual {
  bn: string;
  en?: string;
}

/** 1.5 MB of image becomes 2,000,000 base64 characters. The one bound, shared by every
 *  place a photo can arrive: the single procedure, the batch, and the Animal's own photo. */
export const PHOTO_MAX_BYTES = 2_000_000;

export const EVIDENCE_TYPES = [
  "tick",
  "number",
  "choice",
  "photo",
  "note",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export interface Choice {
  value: string;
  label: Bilingual;
}

export interface Evidence {
  type: EvidenceType;
  required: boolean;
  /** number: what the figure is measured in, and the range outside which to warn. */
  unit?: Bilingual;
  min?: number;
  max?: number;
  /** choice: what may be picked. */
  choices?: Choice[];
}

/** What completing a Step writes into the farm's records, beyond the Evidence itself. The
 *  effect runs in the same transaction as the Completion and is idempotent on its id, so a
 *  replayed entry cannot double-count. */
export type StepEffect =
  /** The litres one cow gave this Milking Session. */
  | { kind: "milk_record" }
  /** The Session's bulk total, reconciled against the sum of the per-cow Bulk records. */
  | { kind: "bulk_total" };

export const STEP_EFFECT_KINDS = ["milk_record", "bulk_total"] as const;

export interface Step {
  id: string;
  text: Bilingual;
  /** Runs once per animal in the Instance's Pen — the milking SOP's per-cow block. */
  repeatPerAnimal: boolean;
  evidence: Evidence[];
  /** Why an animal may be skipped in a per-animal Step. */
  skipReasons: Bilingual[];
  effect?: StepEffect;
}

export const TRIGGER_KINDS = ["schedule", "event", "state"] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/**
 * Things that happen to an animal that the Playbook may hang work on. Only what the farm
 * actually records belongs here: a Trigger naming an event nobody writes is work that never
 * arrives, and the Owner would have no way of knowing. Calving, Service and Diagnosis join
 * the list in the increments that record them.
 */
export const FARM_EVENTS = ["move", "arrival"] as const;
export type FarmEvent = (typeof FARM_EVENTS)[number];

/** How far ahead of the event or the State change work may be hung. */
export const MAX_TRIGGER_OFFSET_DAYS = 365;

export type Trigger =
  /** Fixed times of day, as "HH:MM" on the farm's clock. */
  | { kind: "schedule"; times: string[] }
  /** Something happened to an animal, optionally some days before the work is due. */
  | { kind: "event"; event: FarmEvent; offsetDays?: number }
  /** An animal reached a State — quarantine, dry, ready for sale — optionally some days
   *  before the work is due. Counted from when she reached it, so a cow who comes back to
   *  Milking next lactation is a new occasion and raises the work again. */
  | { kind: "state"; state: AnimalState; offsetDays?: number };

/** Which animals an SOP concerns. A schedule-triggered SOP raises one Instance per Pen
 *  holding at least one matching animal, and its per-animal Steps cover those animals.
 *  Absent means the whole herd. */
export interface AppliesTo {
  side?: Side;
  states?: AnimalState[];
}

export interface SopContent {
  name: Bilingual;
  purpose: Bilingual;
  triggers: Trigger[];
  appliesTo?: AppliesTo;
  /** Who the Instance is assigned to, and who signs it off. */
  assignedRole: (typeof ROLES)[number];
  checkerRole: (typeof ROLES)[number] | null;
  /** Minutes after the due time before the Instance is Overdue. */
  graceMinutes: number;
  steps: Step[];
}

const TIME_PATTERN = /^(?<hour>[01]\d|2[0-3]):[0-5]\d$/u;

const missingBangla = (value: Bilingual | undefined, path: string): string[] =>
  value?.bn?.trim() ? [] : [`${path}.bn`];

/**
 * Every Bangla string an SOP needs before it can be published — Staff read Bangla, so a
 * Version with a gap in it would reach them untranslated. English is optional throughout.
 * Returns the paths that are missing, so the Owner is told exactly what to fill in.
 */
export const findMissingBangla = (content: SopContent): string[] => {
  const missing = [
    ...missingBangla(content.name, "name"),
    ...missingBangla(content.purpose, "purpose"),
  ];
  for (const [stepIndex, step] of content.steps.entries()) {
    const stepPath = `steps[${stepIndex}]`;
    missing.push(...missingBangla(step.text, `${stepPath}.text`));
    for (const [evidenceIndex, evidence] of step.evidence.entries()) {
      const evidencePath = `${stepPath}.evidence[${evidenceIndex}]`;
      if (evidence.type === "number") {
        missing.push(...missingBangla(evidence.unit, `${evidencePath}.unit`));
      }
      for (const [choiceIndex, choice] of (evidence.choices ?? []).entries()) {
        missing.push(
          ...missingBangla(
            choice.label,
            `${evidencePath}.choices[${choiceIndex}].label`
          )
        );
      }
    }
    for (const [reasonIndex, reason] of step.skipReasons.entries()) {
      missing.push(
        ...missingBangla(reason, `${stepPath}.skipReasons[${reasonIndex}]`)
      );
    }
  }
  return missing;
};

/** A Step that writes a farm record must be able to: it needs the figure it writes, and it
 *  must run at the level the record is kept at — litres are per cow, a tank reading is per
 *  Session. A Version that breaks this would raise work nobody can finish. */
const effectProblems = (step: Step, stepIndex: number): string[] => {
  const { effect } = step;
  if (!effect) {
    return [];
  }
  const path = `steps[${stepIndex}]`;
  const problems: string[] = [];
  if (!step.evidence.some((item) => item.type === "number")) {
    problems.push(
      `${path}.evidence: this step records a figure and asks for none`
    );
  }
  if (effect.kind === "milk_record" && !step.repeatPerAnimal) {
    problems.push(`${path}.effect: milk is recorded per animal`);
  }
  if (effect.kind === "bulk_total" && step.repeatPerAnimal) {
    problems.push(
      `${path}.effect: the bulk total is recorded once for the session`
    );
  }
  return problems;
};

/** What is wrong with one Trigger, in the Owner's terms rather than the parser's. */
const triggerProblems = (trigger: Trigger, index: number): string[] => {
  const problems: string[] = [];
  const at = `triggers[${index}]`;
  if (trigger.kind === "schedule") {
    if (trigger.times.length === 0) {
      problems.push(`${at}.times: a schedule needs at least one time`);
    }
    for (const time of trigger.times) {
      if (!TIME_PATTERN.test(time)) {
        problems.push(`${at}.times: "${time}" is not a time of day`);
      }
    }
    return problems;
  }
  // An event or a State the farm does not record is work that would never arrive, and the
  // Owner would have no way of finding that out.
  if (trigger.kind === "event" && !FARM_EVENTS.includes(trigger.event)) {
    problems.push(
      `${at}.event: the farm does not record "${trigger.event}" happening`
    );
  }
  if (trigger.kind === "state" && !STATES.includes(trigger.state)) {
    problems.push(`${at}.state: "${trigger.state}" is not a State an animal has`);
  }
  const offset = trigger.offsetDays;
  if (offset !== undefined) {
    if (!Number.isInteger(offset) || offset < 0) {
      problems.push(`${at}.offsetDays: count whole days, from none upwards`);
    } else if (offset > MAX_TRIGGER_OFFSET_DAYS) {
      problems.push(
        `${at}.offsetDays: ${MAX_TRIGGER_OFFSET_DAYS} days is as far ahead as work may be hung`
      );
    }
  }
  return problems;
};

/** Structural problems that are not about language: an SOP with no steps, a malformed time,
 *  a number with no range, a choice with nothing to choose. */
export const findStructuralProblems = (content: SopContent): string[] => {
  const problems: string[] = [];
  if (content.steps.length === 0) {
    problems.push("steps: an SOP needs at least one step");
  }
  if (content.triggers.length === 0) {
    problems.push("triggers: an SOP needs at least one trigger");
  }
  for (const [index, trigger] of content.triggers.entries()) {
    problems.push(...triggerProblems(trigger, index));
  }
  for (const [stepIndex, step] of content.steps.entries()) {
    if (step.evidence.length === 0) {
      problems.push(
        `steps[${stepIndex}].evidence: a step needs at least one kind of evidence`
      );
    }
    for (const [evidenceIndex, evidence] of step.evidence.entries()) {
      const path = `steps[${stepIndex}].evidence[${evidenceIndex}]`;
      if (
        evidence.type === "number" &&
        evidence.min !== undefined &&
        evidence.max !== undefined &&
        evidence.min > evidence.max
      ) {
        problems.push(`${path}: the range runs backwards`);
      }
      if (evidence.type === "choice" && (evidence.choices?.length ?? 0) === 0) {
        problems.push(`${path}.choices: a choice needs something to choose`);
      }
    }
    problems.push(...effectProblems(step, stepIndex));
  }
  return problems;
};

/** Everything that stops a Version being published, in one list. */
export const findPublishBlockers = (content: SopContent): string[] => [
  ...findStructuralProblems(content),
  ...findMissingBangla(content).map((path) => `${path}: Bangla is required`),
];

/** Does this SOP concern that animal? */
export const appliesToAnimal = (
  appliesTo: AppliesTo | undefined,
  animal: { side: Side; state: AnimalState }
): boolean => {
  if (!appliesTo) {
    return true;
  }
  if (appliesTo.side && appliesTo.side !== animal.side) {
    return false;
  }
  if (appliesTo.states && appliesTo.states.length > 0) {
    return appliesTo.states.includes(animal.state);
  }
  return true;
};

/** The Steps that stand between the Instance and being finished, in the order a phone should
 *  offer them: everything else first, then the closing Step — the bulk total — last. */
export const isClosingStep = (content: SopContent, step: Step): boolean =>
  !step.repeatPerAnimal &&
  content.steps.at(-1)?.id === step.id &&
  content.steps.length > 1;
