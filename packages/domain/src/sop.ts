import type { ROLES } from "./roles";

/** SOP content is authored in Bangla; English is optional and used for reports and a
 *  visiting Vet (i18n decision, ticket 02). */
export interface Bilingual {
  bn: string;
  en?: string;
}

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

export interface Step {
  id: string;
  text: Bilingual;
  /** Runs once per animal in the Instance's Pen — the milking SOP's per-cow block. */
  repeatPerAnimal: boolean;
  evidence: Evidence[];
  /** Why an animal may be skipped in a per-animal Step. */
  skipReasons: Bilingual[];
}

export const TRIGGER_KINDS = ["schedule", "event", "state"] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export type Trigger =
  /** Fixed times of day, as "HH:MM" on the farm's clock. */
  | { kind: "schedule"; times: string[] }
  /** Something happened — a Calving, a Diagnosis. */
  | { kind: "event"; event: string; offsetDays?: number }
  /** An animal reached a condition — under Withdrawal, near Expected Calving. */
  | { kind: "state"; state: string; offsetDays?: number };

export interface SopContent {
  name: Bilingual;
  purpose: Bilingual;
  triggers: Trigger[];
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
    if (trigger.kind === "schedule") {
      if (trigger.times.length === 0) {
        problems.push(
          `triggers[${index}].times: a schedule needs at least one time`
        );
      }
      for (const time of trigger.times) {
        if (!TIME_PATTERN.test(time)) {
          problems.push(
            `triggers[${index}].times: "${time}" is not a time of day`
          );
        }
      }
    }
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
  }
  return problems;
};

/** Everything that stops a Version being published, in one list. */
export const findPublishBlockers = (content: SopContent): string[] => [
  ...findStructuralProblems(content),
  ...findMissingBangla(content).map((path) => `${path}: Bangla is required`),
];
