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

export const scheduleTimes = (content: SopContent): string[] => {
  const schedule = content.triggers.find(
    (trigger) => trigger.kind === "schedule"
  );
  return schedule?.kind === "schedule" ? schedule.times : [];
};

export const withScheduleTimes = (
  content: SopContent,
  times: string[]
): SopContent => ({
  ...content,
  triggers: [
    { kind: "schedule", times },
    ...content.triggers.filter((t) => t.kind !== "schedule"),
  ],
});

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

export const happeningTriggers = (content: SopContent): HappeningTrigger[] =>
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

/** The four things a Service Step asks, in the order the record reads them (SERVICE_EVIDENCE). The
 *  method's labels are the farm's words and may be reworded; its values may not. */
const SERVICE_STEP_EVIDENCE: Evidence[] = [
  {
    type: "choice",
    required: true,
    choices: [
      { value: "ai", label: { bn: "কৃত্রিম প্রজনন", en: "AI" } },
      { value: "natural", label: { bn: "ষাঁড় দিয়ে", en: "Natural" } },
    ],
  },
  { type: "note", required: true },
  { type: "note", required: false },
  { type: "datetime", required: true },
];

/** A choice the Step offers: the fixed word the record reads, and the farm's words for it. */
interface Offered {
  value: string;
  bn: string;
  en: string;
}

const choiceOf = (values: Offered[], required: boolean): Evidence => ({
  type: "choice",
  required,
  choices: values.map(({ value, bn, en }) => ({ value, label: { bn, en } })),
});

const CALF_SEX: Offered[] = [
  { value: "female", bn: "বকনা", en: "Heifer calf" },
  { value: "male", bn: "এঁড়ে", en: "Bull calf" },
];

const CALF_OUTCOME: Offered[] = [
  { value: "alive", bn: "জীবিত", en: "Alive" },
  { value: "stillborn", bn: "মৃত", en: "Stillborn" },
];

/** The things a Calving Step asks, in the order the record reads them (CALVING_EVIDENCE): when, how
 *  it went, and a first calf and up to two more — each one's sex and whether it was alive. */
const CALVING_STEP_EVIDENCE: Evidence[] = [
  { type: "datetime", required: true },
  choiceOf(
    [
      { value: "unassisted", bn: "নিজে নিজে", en: "Unassisted" },
      { value: "assisted", bn: "সাহায্য লেগেছে", en: "Assisted" },
      { value: "vet", bn: "ভেট লেগেছে", en: "With the vet" },
    ],
    true
  ),
  choiceOf(CALF_SEX, true),
  choiceOf(CALF_OUTCOME, true),
  choiceOf(CALF_SEX, false),
  choiceOf(CALF_OUTCOME, false),
  choiceOf(CALF_SEX, false),
  choiceOf(CALF_OUTCOME, false),
];

/** What a Pregnancy Check Step asks first: what the Vet found. The labels are the farm's words; the
 *  values are what Breeding reads back. */
const PREGNANCY_CHECK_RESULT: Evidence = {
  type: "choice",
  required: true,
  choices: [
    { value: "positive", label: { bn: "গর্ভবতী", en: "Carrying" } },
    { value: "negative", label: { bn: "গর্ভবতী নয়", en: "Not carrying" } },
  ],
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
  return kind === "treatment" || kind === "dry_off" ? "tick" : "number";
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
  if (kind === "dry_off") {
    // Drying a cow off is a thing somebody did or did not do; which cow is the whole record.
    return { type: "tick", required: true };
  }
  if (kind === "treatment") {
    // Giving a dose is a thing somebody did or did not do. There is no figure to write down:
    // how much is the Prescription's or the campaign's to say, not the milker's.
    return { type: "tick", required: true };
  }
  if (ONCE_WITH_A_NOTE.has(kind)) {
    // The reference the office files the letter under, or the number off the vial. Required: a report that
    // cannot be evidenced was not made, and a vaccination nobody can trace is not one.
    return { type: "note", required: true };
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
