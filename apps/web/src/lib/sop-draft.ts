import type {
  Bilingual,
  EvidenceType,
  SopContent,
  Step,
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
