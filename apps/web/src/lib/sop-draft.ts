import type {
  Bilingual,
  EvidenceType,
  SopContent,
  Step,
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

/** Everything that raises this work apart from the clock: a Move, an arrival, a State. */
export type Happening = Extract<Trigger, { kind: "event" | "state" }>;

export const happeningTriggers = (content: SopContent): Happening[] =>
  content.triggers.filter(
    (trigger): trigger is Happening => trigger.kind !== "schedule"
  );

export const withHappeningTriggers = (
  content: SopContent,
  happenings: Happening[]
): SopContent => ({
  ...content,
  triggers: [
    ...content.triggers.filter((trigger) => trigger.kind === "schedule"),
    ...happenings,
  ],
});

/** A new one starts on the thing the farm records most often. */
export const emptyHappening = (): Happening => ({ kind: "event", event: "move" });

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
