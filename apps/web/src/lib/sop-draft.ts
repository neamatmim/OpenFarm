import type {
  Bilingual,
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

/** A Trigger that is not a clock: a Move, an arrival, or a State an animal reaches. */
export type HappeningTrigger = Extract<Trigger, { kind: "event" | "state" }>;

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
  const wants: EvidenceType = kind === "move" ? "choice" : "number";
  const [first, ...rest] = step.evidence;
  if (first?.type === wants) {
    return {
      ...step,
      repeatPerAnimal: kind === "bulk_total" ? false : true,
      effect: { kind },
    };
  }
  const fitted: Evidence =
    kind === "move"
      ? {
          type: "choice",
          required: true,
          choices: pens.map((pen) => ({
            value: pen.id,
            label: { bn: pen.name },
          })),
        }
      : { type: "number", required: true, unit: first?.unit };
  return {
    ...step,
    repeatPerAnimal: kind === "bulk_total" ? false : true,
    effect: { kind },
    evidence: [fitted, ...rest],
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

export const needsUnit = (type: EvidenceType): boolean => type === "number";
