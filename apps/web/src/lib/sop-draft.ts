import type {
  Bilingual,
  Choice,
  Evidence,
  EvidenceType,
  SopContent,
  Step,
  StepEffect,
  Trigger,
} from "@OpenFarm/domain";
import {
  CALVING_STEP,
  DLS_REPORT_STEP,
  LOT_NUMBER_STEP,
  PREGNANCY_CHECK_STEP,
  SERVICE_STEP,
  draftFrom,
} from "@OpenFarm/domain";

/** What reading when a procedure comes up needs of it: its Triggers, and nothing else — so a card that holds only
 *  those can ask as the editor does. */
type Timed = Pick<SopContent, "triggers">;

/** A blank procedure the Owner fills in — Bangla first, everything else optional. */
export const emptyStep = (id: string): Step => ({
  id,
  text: { bn: "", en: "" },
  repeatPerAnimal: false,
  evidence: [{ type: "tick", required: true }],
  skipReasons: [],
});

export const emptySop = (): SopContent => ({
  name: { bn: "", en: "" },
  purpose: { bn: "", en: "" },
  triggers: [{ kind: "schedule", times: ["05:00"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 60,
  steps: [emptyStep("step-1")],
});

export const scheduleTimes = (content: Timed): string[] => {
  const schedule = content.triggers.find(
    (trigger) => trigger.kind === "schedule"
  );
  return schedule?.kind === "schedule" ? schedule.times : [];
};

const scheduleOf = (content: Timed) => {
  const schedule = content.triggers.find(
    (trigger) => trigger.kind === "schedule"
  );
  return schedule?.kind === "schedule" ? schedule : null;
};

/** The schedule with some of its parts changed, keeping the rest — changing the times keeps the days. */
const withSchedule = (
  content: SopContent,
  change: { times?: string[]; weekdays?: number[]; everyOtherWeek?: boolean }
): SopContent => {
  const current = scheduleOf(content);
  const next = {
    kind: "schedule" as const,
    times: change.times ?? current?.times ?? [],
    weekdays: "weekdays" in change ? change.weekdays : current?.weekdays,
    everyOtherWeek:
      "everyOtherWeek" in change
        ? change.everyOtherWeek
        : current?.everyOtherWeek,
  };
  if (!next.weekdays?.length) {
    delete next.weekdays;
    delete next.everyOtherWeek;
  }
  if (!next.everyOtherWeek) {
    delete next.everyOtherWeek;
  }
  return {
    ...content,
    triggers: [next, ...content.triggers.filter((t) => t.kind !== "schedule")],
  };
};

export const withScheduleTimes = (
  content: SopContent,
  times: string[]
): SopContent => withSchedule(content, { times });

export const scheduleWeekdays = (content: Timed): number[] =>
  scheduleOf(content)?.weekdays ?? [];

export const scheduleEveryOtherWeek = (content: Timed): boolean =>
  scheduleOf(content)?.everyOtherWeek ?? false;

export const withScheduleWeekdays = (
  content: SopContent,
  weekdays: number[]
): SopContent =>
  withSchedule(content, { weekdays: [...weekdays].toSorted((a, b) => a - b) });

export const withEveryOtherWeek = (
  content: SopContent,
  everyOtherWeek: boolean
): SopContent => withSchedule(content, { everyOtherWeek });

/** A Trigger that is not a clock: a Move, an arrival, a State an animal reaches — or a
 *  Prescription, which raises a dose of its own accord. */
export type HappeningTrigger = Extract<
  Trigger,
  {
    kind:
      | "event"
      | "state"
      | "prescription"
      | "notifiable_disease"
      | "before_calving"
      | "registration_renewal";
  }
>;

export const happeningTriggers = (content: Timed): HappeningTrigger[] =>
  content.triggers.filter(
    (trigger): trigger is HappeningTrigger => trigger.kind !== "schedule"
  );

export const withHappeningTriggers = (
  content: SopContent,
  happenings: HappeningTrigger[]
): SopContent => ({
  ...content,
  triggers: [
    ...content.triggers.filter((trigger) => trigger.kind === "schedule"),
    ...happenings,
  ],
});

/** A new one starts on the thing the farm records most often. */
export const emptyHappening = (): HappeningTrigger => ({
  kind: "event",
  event: "move",
});

/**
 * What a shaped Step asks for, drafted from the shape itself rather than written out again here.
 *
 * All this supplies is the farm's own words for each fixed word the record reads back. The words may be
 * reworded whenever the farm likes; the values under them may not, and are not written here at all — leaving
 * one of them out is a mistake the compiler makes rather than one publishing finds.
 */
const SERVICE_STEP_EVIDENCE = draftFrom(SERVICE_STEP, {
  ai: { bn: "কৃত্রিম প্রজনন", en: "AI" },
  natural: { bn: "ষাঁড় দিয়ে", en: "Natural" },
});

const CALVING_STEP_EVIDENCE = draftFrom(CALVING_STEP, {
  unassisted: { bn: "নিজে নিজে", en: "Unassisted" },
  assisted: { bn: "সাহায্য লেগেছে", en: "Assisted" },
  vet: { bn: "ভেট লেগেছে", en: "With the vet" },
  female: { bn: "বকনা", en: "Heifer calf" },
  male: { bn: "এঁড়ে", en: "Bull calf" },
  alive: { bn: "জীবিত", en: "Alive" },
  stillborn: { bn: "মৃত", en: "Stillborn" },
});

const [PREGNANCY_CHECK_RESULT] = draftFrom(PREGNANCY_CHECK_STEP, {
  positive: { bn: "গর্ভবতী", en: "Carrying" },
  negative: { bn: "গর্ভবতী নয়", en: "Not carrying" },
});

/** The reference the office files the letter under, and the number off the vial: one written answer each, and
 *  the shape says it is insisted on — a report that cannot be evidenced was not made, and a vaccination
 *  nobody can trace is not one. */
const [DLS_REPORT_NOTE] = draftFrom(DLS_REPORT_STEP, {});
const [LOT_NUMBER_NOTE] = draftFrom(LOT_NUMBER_STEP, {});
const ONCE_WITH_A_NOTE_EVIDENCE: Partial<Record<StepEffect["kind"], Evidence>> =
  {
    dls_report: DLS_REPORT_NOTE,
    lot_number: LOT_NUMBER_NOTE,
  };

/** The effects done once whose record is a written note: the reference a letter went under, a Campaign's Lot
 *  Number. */
const ONCE_WITH_A_NOTE: ReadonlySet<StepEffect["kind"]> = new Set<
  StepEffect["kind"]
>(["dls_report", "lot_number"]);

/** A campaign dose's own Lot Number, for a dose from another vial than the rest of its Campaign: asked at every
 *  vaccine dose, never required. */
const OWN_LOT_NUMBER: Evidence = { type: "note", required: false };

/** What Evidence an effect needs before it can write anything. */
const wantedEvidence = (kind: StepEffect["kind"]): EvidenceType => {
  if (kind === "move" || kind === "observation") {
    return "choice";
  }
  if (ONCE_WITH_A_NOTE.has(kind)) {
    return "note";
  }
  return kind === "treatment" || kind === "dry_off" || kind === "release"
    ? "tick"
    : "number";
};

/** The Evidence an effect needs when what is there does not fit: the farm's Pens for a
 *  Move, an empty list for the Owner to fill in for a Sighting, a figure for the rest. */
const fittedEvidence = (
  kind: StepEffect["kind"],
  current: Evidence | undefined,
  pens: { id: string; name: string }[]
): Evidence => {
  if (kind === "move") {
    return {
      type: "choice",
      required: true,
      choices: pens.map((pen) => ({ value: pen.id, label: { bn: pen.name } })),
    };
  }
  if (kind === "observation") {
    // Nothing to carry over: this is reached only when what is there is not a choice at all.
    // What may be seen is the Owner's to write down.
    return { type: "choice", required: true, choices: [] };
  }
  if (kind === "dry_off" || kind === "release") {
    // Drying a cow off, or letting a bull out of Quarantine, is a thing somebody did or did not do; which animal is
    // the whole record.
    return { type: "tick", required: true };
  }
  if (kind === "treatment") {
    // Giving a dose is a thing somebody did or did not do. There is no figure to write down:
    // how much is the Prescription's or the campaign's to say, not the milker's.
    return { type: "tick", required: true };
  }
  const asked = ONCE_WITH_A_NOTE_EVIDENCE[kind];
  if (asked) {
    return asked;
  }
  return { type: "number", required: true, unit: current?.unit };
};

/**
 * What a Step writes into the farm's records, and the Evidence that implies. A Step that
 * moves an animal asks which Pen, over the Pens the farm actually has; a Step that writes a
 * record asks for a figure. Chosen here rather than left to the Owner to get right, because
 * an effect whose Evidence does not fit it is a Step that cannot be published and does not
 * say why in the Owner's own words.
 *
 * Evidence that already fits is left exactly as authored — the unit, the range, the Pens
 * somebody has already chosen — because a select that silently throws away a morning's
 * authoring is worse than one that refuses.
 */
export const withEffect = (
  step: Step,
  kind: StepEffect["kind"] | "",
  pens: { id: string; name: string }[]
): Step => {
  if (kind === "") {
    const { effect: _dropped, ...rest } = step;
    return rest;
  }
  // A Service asks four things in a fixed order — how, the sire, who served her, and when — so its
  // Step is given all four at once rather than one box the Owner then has to fill out by hand, and
  // anything already authored after them is kept.
  if (kind === "service") {
    return {
      ...step,
      repeatPerAnimal: false,
      effect: { kind },
      evidence: [
        ...SERVICE_STEP_EVIDENCE,
        ...step.evidence.slice(SERVICE_STEP_EVIDENCE.length),
      ],
    };
  }
  if (kind === "calving") {
    // Walked cow by cow on a round of the calving pen: she has calved, or she is skipped.
    return {
      ...step,
      repeatPerAnimal: true,
      effect: { kind },
      evidence: [
        ...CALVING_STEP_EVIDENCE,
        ...step.evidence.slice(CALVING_STEP_EVIDENCE.length),
      ],
    };
  }
  if (kind === "pregnancy_check") {
    return {
      ...step,
      repeatPerAnimal: false,
      effect: { kind },
      evidence: [PREGNANCY_CHECK_RESULT, ...step.evidence.slice(1)],
    };
  }
  const wants: EvidenceType = wantedEvidence(kind);
  const [first, ...rest] = step.evidence;
  // A Pen is fed and its tank read once; everything else is done animal by animal. A dose
  // Step starts as a prescribed dose — the shape that is complete without anything else being
  // chosen — and naming a product turns it into a campaign over the Pen.
  const perAnimal =
    kind !== "bulk_total" &&
    kind !== "treatment" &&
    !ONCE_WITH_A_NOTE.has(kind);
  if (first?.type === wants) {
    return { ...step, repeatPerAnimal: perAnimal, effect: { kind } };
  }
  const fitted: Evidence = fittedEvidence(kind, first, pens);
  return {
    ...step,
    repeatPerAnimal: perAnimal,
    effect: { kind },
    evidence: [fitted, ...rest],
  };
};

/**
 * Which product a campaign's Step gives, or none — and none means the other shape of a dose
 * Step: the farm's Treatment procedure, whose doses a Prescription names one at a time.
 */
export const withProduct = (
  step: Step,
  product: { id: string; vaccine: boolean } | null
): Step => {
  if (step.effect?.kind !== "treatment") {
    return step;
  }
  // The dose is ticked; a vaccine's dose also has room for her own Lot Number.
  const [given = { type: "tick", required: true }] = step.evidence;
  if (!product) {
    return {
      ...step,
      repeatPerAnimal: false,
      effect: { kind: "treatment" },
      evidence: [given],
    };
  }
  return {
    ...step,
    repeatPerAnimal: true,
    effect: { kind: "treatment", productId: product.id },
    evidence: product.vaccine ? [given, OWN_LOT_NUMBER] : [given],
  };
};

export const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

export const toBilingualList = (value: string): Bilingual[] =>
  splitList(value).map((bn) => ({ bn }));

export const fromBilingualList = (values: Bilingual[]): string =>
  values.map((value) => value.bn).join(", ");

/**
 * What may be chosen, as the Owner types it: a comma-separated list in Bangla. A new choice
 * takes its own label as its value, so the record keeps the word somebody actually chose.
 *
 * A choice already in the list keeps the value it had, whatever its label becomes. Records
 * point at values: rewriting them because somebody reworded the list would orphan every
 * Observation the farm has already made.
 */
export const toChoices = (value: string, existing: Choice[] = []): Choice[] =>
  splitList(value).map((bn, index) => {
    const before = existing[index];
    return before
      ? { ...before, label: { ...before.label, bn } }
      : { value: bn, label: { bn } };
  });

export const fromChoices = (choices: Choice[] | undefined): string =>
  (choices ?? []).map((choice) => choice.label.bn).join(", ");

export const needsChoices = (step: Step): boolean =>
  step.effect?.kind === "observation" ||
  (step.effect === undefined && step.evidence[0]?.type === "choice");

export const needsUnit = (type: EvidenceType): boolean => type === "number";
