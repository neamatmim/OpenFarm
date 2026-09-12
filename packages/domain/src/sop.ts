import {
  HEAT,
  PREGNANCY_CHECK_RESULTS,
  SERVICE,
  SERVICE_METHODS,
} from "./breeding";
import type { AnimalState, Side } from "./lifecycle";
import { LIVE_STATES } from "./lifecycle";
import type { ROLES, RoleName } from "./roles";

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
  "datetime",
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
  | { kind: "bulk_total" }
  /** The Pen she was walked to, recorded as a Move by the work that walked her. */
  | { kind: "move" }
  /** What somebody saw of her on the round — off her feed, limping, bulling. */
  | { kind: "observation" }
  /** What this Pen was actually given, against what its Ration owed it. */
  | { kind: "feeding" }
  /**
   * One dose given, and the Withdrawal it earns. Two shapes, because a dose reaches an animal
   * two ways:
   *
   * - a dose of a Prescription: the work is about the one animal it names, and the
   *   Prescription says what she is given, so the Step names no product;
   * - a campaign over a Pen — a vaccination, a deworming — where the work is done animal by
   *   animal and it is this Version that says what every one of them gets.
   */
  | { kind: "treatment"; productId?: string }
  /** The letter to the Upazila Livestock Officer went, and under what reference. */
  | { kind: "dls_report" }
  /** What one animal weighed on the scale this round. */
  | { kind: "weigh_in" }
  /** She was served: how, by what sire, and by whom. The event the breeding chain counts from. */
  | { kind: "service" }
  /** What the Vet found: positive or negative, of the attempt the Service began. */
  | { kind: "pregnancy_check" };

export const STEP_EFFECT_KINDS = [
  "milk_record",
  "bulk_total",
  "move",
  "observation",
  "feeding",
  "treatment",
  "dls_report",
  "weigh_in",
  "service",
  "pregnancy_check",
] as const;

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

export const TRIGGER_KINDS = [
  "schedule",
  "event",
  "state",
  "prescription",
  "notifiable_disease",
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/**
 * Things that happen to an animal that the Playbook may hang work on. Only what the farm
 * actually records belongs here: a Trigger naming an event nobody writes is work that never
 * arrives, and the Owner would have no way of knowing. Service, Calving and Diagnosis join
 * the list in the tickets that record them.
 *
 * A Heat is the first of Breeding's: an Observation of oestrus, and the work it raises falls due
 * in the farm's AI window rather than a whole number of days later. A Service is the second: the
 * work it raises — the Pregnancy Check — falls due the farm's number of days after the attempt's
 * first service, and once per attempt however many times she was served.
 *
 * A death is the one that raises work about an animal who is no longer on the farm — burying
 * her to the depth the rule names, and reporting her if what killed her is notifiable. That is
 * work precisely because she has gone.
 */
export const FARM_EVENTS = ["move", "arrival", "death", HEAT, SERVICE] as const;
export type FarmEvent = (typeof FARM_EVENTS)[number];

/**
 * The events whose work the farm times rather than the Trigger, and why: a Heat's in the AI window's
 * hours; a Service's the farm's days to a Pregnancy Check, set once for every check, so that a second
 * number on a Trigger would be a second answer to the same question.
 */
const FARM_TIMED_EVENTS: Partial<Record<FarmEvent, string>> = {
  [HEAT]: "a heat's work falls due in the farm's AI window, not days later",
  [SERVICE]:
    "a service's work falls due the farm's days to a pregnancy check after it, not a number set here",
};

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
  | { kind: "state"; state: AnimalState; offsetDays?: number }
  /** A Vet wrote a Prescription: one Instance per dose, at the times the Vet set. Nothing
   *  else raises this work — not the clock, and nothing that happens to an animal — so the
   *  farm can have exactly one procedure for giving a dose and raise it only when a dose is
   *  actually owed. */
  | { kind: "prescription" }
  /** A Vet named a disease on the farm's notifiable list. Raised the moment the Diagnosis is
   *  recorded and due immediately, because the Act says the report goes without delay. */
  | { kind: "notifiable_disease" };

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
/** What a Step that records delivering the letter has to ask for. The reference the office
 *  files it under is what the farm keeps, and it is written rather than counted — required,
 *  because a report that cannot be evidenced is a report that was not made. */
const reportStepProblems = (step: Step, path: string): string[] => {
  const problems: string[] = [];
  if (!step.evidence.some((item) => item.type === "note" && item.required)) {
    problems.push(
      `${path}.evidence: this step records the reference the report was delivered under, and it has to be asked for and required`
    );
  }
  if (step.repeatPerAnimal) {
    problems.push(
      `${path}.effect: one letter reports one animal, so this step runs once`
    );
  }
  return problems;
};

/** The two shapes of a dose Step. A campaign goes round the Pen animal by animal and this
 *  Version says what each of them gets; a Prescription's dose is about the one animal it names,
 *  and the Prescription says what she gets. Anything between the two records a dose nobody can
 *  account for. */
const doseStepProblems = (
  step: Step,
  effect: { productId?: string },
  path: string
): string[] => {
  const problems: string[] = [];
  if (step.repeatPerAnimal && !effect.productId) {
    problems.push(
      `${path}.effect: a step that doses every animal in the pen has to say which product`
    );
  }
  if (effect.productId && !step.repeatPerAnimal) {
    problems.push(
      `${path}.effect: a dose of a prescription is the prescription's to name, not this step's`
    );
  }
  return problems;
};

/** Where each fact sits in a Service Step's Evidence. Validated and read by the same positions,
 *  so what the Step asks for and what the record takes from it cannot drift apart. */
export const SERVICE_EVIDENCE = {
  method: 0,
  sire: 1,
  servedBy: 2,
  servedAt: 3,
} as const;

/**
 * What a Service Step has to ask for. The Step's own words are the farm's, but the record is read
 * back by every later act in the breeding chain, so its shape is not.
 *
 * How she was served, as a choice offering exactly `ai` and `natural`; the sire, as a required note
 * — a straw's number, or the farm's own bull by his Tag Number; who served her, as a note; and when,
 * as a required date and time. Who served her is not required here, because a bull running with the
 * herd has nobody standing over him, but an AI service is refused without it: the story asks for the
 * technician.
 *
 * The Step may be per animal. A Heat raises work about one cow, but a bull running with the herd
 * serves cows nobody saw in heat, and the round that walks the Pen afterwards is where that is
 * written down — refusing a per-animal Service Step would leave that service no way in at all.
 */
const serviceStepProblems = (step: Step, path: string): string[] => {
  const problems: string[] = [];
  const method = step.evidence[SERVICE_EVIDENCE.method];
  const sire = step.evidence[SERVICE_EVIDENCE.sire];
  const servedBy = step.evidence[SERVICE_EVIDENCE.servedBy];
  const servedAt = step.evidence[SERVICE_EVIDENCE.servedAt];
  const offered = method?.choices?.map((choice) => choice.value) ?? [];
  const exactlyTheMethods =
    method?.type === "choice" &&
    offered.length === SERVICE_METHODS.length &&
    SERVICE_METHODS.every((one) => offered.includes(one));
  if (!exactlyTheMethods) {
    problems.push(
      `${path}.evidence[0]: a service step first asks how she was served, offering "ai" and "natural"`
    );
  }
  if (sire?.type !== "note" || !sire.required) {
    problems.push(
      `${path}.evidence[1]: a service step then asks for the sire, as a required note`
    );
  }
  if (servedBy?.type !== "note") {
    problems.push(
      `${path}.evidence[2]: a service step then asks who served her, as a note`
    );
  }
  // When she was served, which is not when it was written down: every later date in the chain —
  // the Pregnancy Check, Expected Calving — counts from this day (Owner's decision, 2026-09-13).
  if (servedAt?.type !== "datetime" || !servedAt.required) {
    problems.push(
      `${path}.evidence[3]: a service step then asks when she was served, as a required date and time`
    );
  }
  return problems;
};

/**
 * What a Pregnancy Check Step has to ask: what the Vet found, as a required choice offering exactly
 * `positive` and `negative`. Anything else the Vet wants to write sits after it.
 *
 * Not per animal: a check is of the attempt that raised it, and that work is about one cow. A Vet
 * walking a Pen could not say which of a cow's heats a pregnancy dates from; the farm can.
 */
const pregnancyCheckStepProblems = (step: Step, path: string): string[] => {
  const problems: string[] = [];
  if (step.repeatPerAnimal) {
    problems.push(
      `${path}: a pregnancy check is of one cow's service, not walked animal by animal`
    );
  }
  const [result] = step.evidence;
  const offered = result?.choices?.map((choice) => choice.value) ?? [];
  const exactlyTheResults =
    result?.type === "choice" &&
    result.required &&
    offered.length === PREGNANCY_CHECK_RESULTS.length &&
    PREGNANCY_CHECK_RESULTS.every((one) => offered.includes(one));
  if (!exactlyTheResults) {
    problems.push(
      `${path}.evidence[0]: a pregnancy check first asks what was found, as a required choice offering "positive" and "negative"`
    );
  }
  return problems;
};

/**
 * A procedure recording a Pregnancy Check is the Vet's (roles matrix: Breeding — PD is `C R U` to the
 * Vet and read to everybody else), because whether she is carrying is a clinical finding. And it is
 * raised by a Service and by nothing else: the check is of the attempt that raised it, and work the
 * clock raised over a Pen would be a check of no service at all.
 */
const pregnancyCheckProcedureProblems = (content: SopContent): string[] => {
  if (!content.steps.some((step) => step.effect?.kind === "pregnancy_check")) {
    return [];
  }
  const problems: string[] = [];
  if (content.assignedRole !== "vet") {
    problems.push(
      "assignedRole: a procedure that records a pregnancy check is the Vet's"
    );
  }
  const raisedByAServiceAlone =
    content.triggers.length > 0 &&
    content.triggers.every(
      (trigger) => trigger.kind === "event" && trigger.event === SERVICE
    );
  if (!raisedByAServiceAlone) {
    problems.push(
      "triggers: a procedure that records a pregnancy check is raised by a service, and by nothing else"
    );
  }
  return problems;
};

const SHAPED_STEPS: Partial<
  Record<StepEffect["kind"], (step: Step, path: string) => string[]>
> = {
  dls_report: reportStepProblems,
  service: serviceStepProblems,
  pregnancy_check: pregnancyCheckStepProblems,
};

const effectProblems = (step: Step, stepIndex: number): string[] => {
  const { effect } = step;
  if (!effect) {
    return [];
  }
  const path = `steps[${stepIndex}]`;
  const problems: string[] = [];
  if (effect.kind === "feeding") {
    // What was given is a figure per Feed Item, and the Items come from the Pen's Ration
    // rather than from the Version — so this Step declares no Evidence of its own beyond
    // whatever the Owner wants recorded alongside.
    if (step.repeatPerAnimal) {
      problems.push(`${path}.effect: a Pen is fed once, not once per animal`);
    }
    return problems;
  }
  // A letter, a service and a pregnancy check each record something other than a figure: their
  // shapes are their own.
  const shaped = SHAPED_STEPS[effect.kind];
  if (shaped) {
    return shaped(step, path);
  }
  if (effect.kind === "treatment") {
    return doseStepProblems(step, effect, path);
  }
  if (effect.kind === "move" || effect.kind === "observation") {
    // Both are a choice the person makes about one animal: which Pen she was walked to, or
    // what was seen of her. A Step that offers nothing to choose would silently do nothing.
    if (!step.evidence.some((item) => item.type === "choice")) {
      problems.push(
        effect.kind === "move"
          ? `${path}.evidence: this step moves an animal and offers no pen to move her to`
          : `${path}.evidence: this step records what was seen and offers nothing to choose`
      );
    }
    if (!step.repeatPerAnimal) {
      problems.push(
        effect.kind === "move"
          ? `${path}.effect: an animal is moved one at a time`
          : `${path}.effect: animals are looked at one at a time`
      );
    }
    return problems;
  }
  if (!step.evidence.some((item) => item.type === "number")) {
    problems.push(
      `${path}.evidence: this step records a figure and asks for none`
    );
  }
  if (effect.kind === "milk_record" && !step.repeatPerAnimal) {
    problems.push(`${path}.effect: milk is recorded per animal`);
  }
  if (effect.kind === "weigh_in" && !step.repeatPerAnimal) {
    problems.push(`${path}.effect: an animal is weighed one at a time`);
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
  // A Prescription says when its own doses fall due, and a notifiable Diagnosis is due the
  // moment it is made, so there is nothing in either to be wrong.
  if (
    trigger.kind === "prescription" ||
    trigger.kind === "notifiable_disease"
  ) {
    return problems;
  }
  // An event or a State the farm does not record is work that would never arrive, and the
  // Owner would have no way of finding that out.
  if (trigger.kind === "event" && !FARM_EVENTS.includes(trigger.event)) {
    problems.push(
      `${at}.event: the farm does not record "${trigger.event}" happening`
    );
  }
  if (
    trigger.kind === "state" &&
    !(LIVE_STATES as readonly string[]).includes(trigger.state)
  ) {
    // Sold, Died and Culled are States too, but an animal that has left the farm is not one
    // anybody can do work about: the Trigger would publish and raise nothing, for ever.
    problems.push(
      `${at}.state: "${trigger.state}" is not a State an animal on the farm is in`
    );
  }
  const offset = trigger.offsetDays;
  // A Heat's and a Service's work are timed by the farm, not by the Trigger. A number of days here
  // would be quietly ignored — and a setting the Playbook accepts and then does not honour is how an
  // author comes to believe the farm does something it does not.
  const timedByTheFarm =
    trigger.kind === "event" ? FARM_TIMED_EVENTS[trigger.event] : undefined;
  if (timedByTheFarm && offset !== undefined) {
    problems.push(`${at}.offsetDays: ${timedByTheFarm}`);
  }
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

/**
 * Which Trigger raises its own work the moment an act happens, rather than waiting for the clock
 * or for something to happen to an animal. Both are raised inside the transaction that records
 * the act, which is why nothing in the scheduler goes looking for them.
 */
export const raisesItsOwnWork = (
  trigger: Trigger
): trigger is Extract<
  Trigger,
  { kind: "prescription" | "notifiable_disease" }
> => trigger.kind === "prescription" || trigger.kind === "notifiable_disease";

/**
 * The Triggers and the Step Effects that only make sense together, and what to say when one is
 * there without the other.
 *
 * Three of these now, which is why they are a table rather than three near-identical functions:
 * a procedure raised by an act that records nothing of that act is work whose point is lost, and
 * a Step that records an act nothing raises is a Step that can never find what it is recording.
 */
const PAIRS: {
  trigger: Trigger["kind"];
  effect: NonNullable<Step["effect"]>["kind"];
  /** True when this Step is the paired one — a dose Step naming a product is a campaign's, and
   *  campaigns are raised by the clock or by hand, not by a Prescription. */
  isPaired?: (step: Step) => boolean;
  missingStep: string;
  missingTrigger: string;
}[] = [
  {
    trigger: "prescription",
    effect: "treatment",
    isPaired: (step) =>
      step.effect?.kind === "treatment" && !step.effect.productId,
    missingStep:
      "steps: a prescription raises one dose at a time, and no step here records giving one",
    missingTrigger:
      "triggers: a step here gives a dose somebody prescribed, and nothing but a prescription raises one",
  },
  {
    trigger: "notifiable_disease",
    effect: "dls_report",
    missingStep:
      "steps: this report is raised by a notifiable diagnosis, and no step here records delivering it",
    missingTrigger:
      "triggers: a step here records a report delivered, and nothing but a notifiable diagnosis raises one",
  },
];

const pairProblems = (content: SopContent): string[] => {
  const problems: string[] = [];
  for (const pair of PAIRS) {
    const raised = content.triggers.some(
      (trigger) => trigger.kind === pair.trigger
    );
    const recorded = content.steps.some((step) =>
      pair.isPaired ? pair.isPaired(step) : step.effect?.kind === pair.effect
    );
    if (raised && !recorded) {
      problems.push(pair.missingStep);
    }
    if (recorded && !raised) {
      problems.push(pair.missingTrigger);
    }
  }
  return problems;
};

/**
 * A procedure gives one dose, and reports one disease. Two of either in one Version would write
 * over each other's record of what was done.
 */
const oneOfEachProblems = (content: SopContent): string[] => {
  const problems: string[] = [];
  for (const effect of ["treatment", "dls_report"] as const) {
    const count = content.steps.filter(
      (step) => step.effect?.kind === effect
    ).length;
    if (count > 1) {
      problems.push(
        effect === "treatment"
          ? "steps: a procedure gives one dose, and this one gives more than one"
          : "steps: a procedure reports one disease, and this one reports more than one"
      );
    }
  }
  return problems;
};

/**
 * The letter is the Manager's to take, with the Owner checking it (the farm's Playbook). A report
 * assigned to Barn Staff is a legal notice resting on whoever is nearest the shed.
 */
const reportRoleProblems = (content: SopContent): string[] => {
  const reports = content.steps.some(
    (step) => step.effect?.kind === "dls_report"
  );
  const carried =
    content.assignedRole === "manager" || content.assignedRole === "owner";
  return reports && !carried
    ? [
        "assignedRole: the report to DLS is the Manager's to take, or the Owner's",
      ]
    : [];
};

/** Structural problems that are not about language: an SOP with no steps, a malformed time,
 *  a number with no range, a choice with nothing to choose. */
export const findStructuralProblems = (content: SopContent): string[] => {
  const problems: string[] = [
    ...pairProblems(content),
    ...oneOfEachProblems(content),
    ...reportRoleProblems(content),
  ];
  if (content.steps.length === 0) {
    problems.push("steps: an SOP needs at least one step");
  }
  // No Trigger is no longer work that never arrives: the Manager can raise a piece of work for
  // a Pen when the farm decides to do it, which is exactly how a campaign happens. A quarterly
  // deworming has no time of day, and giving it one would put it on the shed's list every
  // morning for ever.
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
  // A Service is the Manager's to record (roles matrix: Breeding — Service is `C R U` to the
  // Manager and to nobody else who records). The work is completed by whoever it is assigned to,
  // so a procedure recording a Service and assigned to anybody else would hand parentage to the
  // wrong person the day it was published.
  if (
    content.steps.some((step) => step.effect?.kind === "service") &&
    content.assignedRole !== "manager"
  ) {
    problems.push(
      "assignedRole: a procedure that records a service is the Manager's"
    );
  }
  problems.push(...pregnancyCheckProcedureProblems(content));
  return problems;
};

/**
 * Whether a Step writes the clinical record — a finding only a Vet may make, and so one the Vet's
 * correction window covers. A Pregnancy Check is; a dose given on a round is the farm's work, and
 * the Diagnosis and Prescription behind it are corrected where they are made.
 */
export const isClinicalStep = (step: Step): boolean =>
  step.effect?.kind === "pregnancy_check";

/** Everything that stops a Version being published, in one list. */
export const findPublishBlockers = (content: SopContent): string[] => [
  ...findStructuralProblems(content),
  ...findMissingBangla(content).map((path) => `${path}: Bangla is required`),
];

/**
 * How many times a day this Playbook entry falls due — which is how often a Pen it feeds is
 * fed, and therefore what a day's Ration is divided by. Stated here and nowhere else: the
 * schedule that raises the work is the only honest answer to "how often".
 */
export const sessionsPerDayOf = (content: SopContent): number => {
  const times = content.triggers.flatMap((trigger) =>
    trigger.kind === "schedule" ? trigger.times : []
  );
  // Work raised by something that happened is fed as one session when it happens.
  return Math.max(times.length, 1);
};

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

/** One thing that is different between two Versions of an SOP, in the terms somebody who
 *  does the work would put it. Rendered by the reader's app in their own language. */
export type SopChange =
  | { kind: "step_added"; step: Bilingual }
  | { kind: "step_removed"; step: Bilingual }
  | { kind: "step_reworded"; step: Bilingual; was: Bilingual }
  | { kind: "step_evidence"; step: Bilingual }
  | { kind: "step_skip_reasons"; step: Bilingual }
  | { kind: "step_per_animal"; step: Bilingual; perAnimal: boolean }
  | { kind: "step_effect"; step: Bilingual }
  | { kind: "steps_reordered" }
  | { kind: "purpose_changed" }
  | { kind: "times_changed"; times: string[] }
  | { kind: "grace_changed"; minutes: number }
  | { kind: "who_changed"; role: RoleName }
  | { kind: "checker_changed"; role: RoleName | null };

/** Everything about one piece of Evidence that a person would notice changing: not only
 *  what kind it is, but the unit it asks for, the range it calls odd, and what may be
 *  chosen — a move Step whose Pens changed is a changed Step. */
const evidenceShape = (step: Step): string =>
  step.evidence
    .map((item) =>
      [
        item.type,
        item.required ? "!" : "",
        item.unit?.bn ?? "",
        item.min ?? "",
        item.max ?? "",
        (item.choices ?? []).map((choice) => choice.value).join("|"),
      ].join(":")
    )
    .join(",");

const timesOf = (content: SopContent): string[] =>
  content.triggers.flatMap((trigger) =>
    trigger.kind === "schedule" ? trigger.times : []
  );

const sameWords = (a: Bilingual, b: Bilingual): boolean =>
  a.bn === b.bn && (a.en ?? "") === (b.en ?? "");

const skipShape = (step: Step): string =>
  step.skipReasons.map((reason) => reason.bn).join("|");

/** What is different about one Step that exists in both Versions. */
const stepChanges = (previous: Step, step: Step): SopChange[] => {
  const changes: SopChange[] = [];
  if (!sameWords(previous.text, step.text)) {
    changes.push({
      kind: "step_reworded",
      step: step.text,
      was: previous.text,
    });
  }
  if (evidenceShape(previous) !== evidenceShape(step)) {
    changes.push({ kind: "step_evidence", step: step.text });
  }
  if (skipShape(previous) !== skipShape(step)) {
    changes.push({ kind: "step_skip_reasons", step: step.text });
  }
  if (previous.repeatPerAnimal !== step.repeatPerAnimal) {
    changes.push({
      kind: "step_per_animal",
      step: step.text,
      perAnimal: step.repeatPerAnimal,
    });
  }
  if ((previous.effect?.kind ?? "") !== (step.effect?.kind ?? "")) {
    changes.push({ kind: "step_effect", step: step.text });
  }
  return changes;
};

/**
 * What is different between two Versions, for somebody about to do the work.
 *
 * Steps are matched by their id, so a reworded Step reads as a rewording rather than as one
 * Step gone and another arrived. Everything here is what a person would notice on the job —
 * a new Step, a Step that is gone, different words, something else to record, a different
 * order, a different time. Nothing about who published it or when: that is on the Card.
 *
 * An empty list means the Versions differ in ways nobody doing the work would see, and the
 * caller should say nothing rather than announce a change with nothing under it.
 */
export const describeChanges = (
  before: SopContent,
  after: SopContent
): SopChange[] => {
  const changes: SopChange[] = [];
  const was = new Map(before.steps.map((step) => [step.id, step]));
  const now = new Map(after.steps.map((step) => [step.id, step]));

  for (const step of after.steps) {
    const previous = was.get(step.id);
    if (previous) {
      changes.push(...stepChanges(previous, step));
    } else {
      changes.push({ kind: "step_added", step: step.text });
    }
  }
  for (const step of before.steps) {
    if (!now.has(step.id)) {
      changes.push({ kind: "step_removed", step: step.text });
    }
  }
  // The order Steps come in is the order they are done in, and the closing Step is the last
  // one — so moving them about changes the job even when every Step is the same.
  const kept = after.steps.filter((step) => was.has(step.id)).map((s) => s.id);
  const keptBefore = before.steps
    .filter((step) => now.has(step.id))
    .map((s) => s.id);
  if (kept.join(",") !== keptBefore.join(",")) {
    changes.push({ kind: "steps_reordered" });
  }

  if (!sameWords(before.purpose, after.purpose)) {
    changes.push({ kind: "purpose_changed" });
  }
  const wasTimes = timesOf(before);
  const nowTimes = timesOf(after);
  if (wasTimes.join(",") !== nowTimes.join(",")) {
    changes.push({ kind: "times_changed", times: nowTimes });
  }
  if (before.graceMinutes !== after.graceMinutes) {
    changes.push({ kind: "grace_changed", minutes: after.graceMinutes });
  }
  if (before.assignedRole !== after.assignedRole) {
    changes.push({ kind: "who_changed", role: after.assignedRole });
  }
  if (before.checkerRole !== after.checkerRole) {
    changes.push({ kind: "checker_changed", role: after.checkerRole });
  }
  return changes;
};
