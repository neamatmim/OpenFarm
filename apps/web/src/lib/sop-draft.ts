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
  { kind: "event" | "state" | "prescription" | "notifiable_disease" }
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

/** The Evidence an effect needs when what is there does not fit: the farm's Pens for a
 *  Move, an empty list for the Owner to fill in for a Sighting, a figure for the rest. */
/** What Evidence an effect needs before it can write anything. */
const wantedEvidence = (kind: StepEffect["kind"]): EvidenceType => {
  if (kind === "move" || kind === "observation") {
    return "choice";
  }
  if (kind === "dls_report") {
    return "note";
  }
  return kind === "treatment" ? "tick" : "number";
};

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
  if (kind === "treatment") {
    // Giving a dose is a thing somebody did or did not do. There is no figure to write down:
    // how much is the Prescription's or the campaign's to say, not the milker's.
    return { type: "tick", required: true };
  }
  if (kind === "dls_report") {
    // The reference the office files the letter under. Required, because a report that cannot
    // be evidenced is a report that was not made.
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
  const wants: EvidenceType = wantedEvidence(kind);
  const [first, ...rest] = step.evidence;
  // A Pen is fed and its tank read once; everything else is done animal by animal. A dose
  // Step starts as a prescribed dose — the shape that is complete without anything else being
  // chosen — and naming a product turns it into a campaign over the Pen.
  const perAnimal =
    kind !== "bulk_total" && kind !== "treatment" && kind !== "dls_report";
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
export const withProduct = (step: Step, productId: string): Step => {
  if (step.effect?.kind !== "treatment") {
    return step;
  }
  return productId
    ? {
        ...step,
        repeatPerAnimal: true,
        effect: { kind: "treatment", productId },
      }
    : { ...step, repeatPerAnimal: false, effect: { kind: "treatment" } };
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
