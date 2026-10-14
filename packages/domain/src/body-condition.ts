import type { Evidence, Step } from "./sop";

/**
 * Body Condition: how much flesh an Animal carries, judged by eye on the common five-point scale — one very thin, five
 * fat. Asked wherever the farm has an animal in front of it and a reason to want it: at every Weigh-in, at Dry-off and at
 * her Calving — and never insisted on, since not everybody has the eye for it (DLS GLPP 2023 §16.2.4.1.2).
 */
export const BODY_CONDITION_SCORES = ["1", "2", "3", "4", "5"] as const;
export type BodyConditionScore = 1 | 2 | 3 | 4 | 5;

/** The scale's words, the same on the phone that asks it and on every screen that says it. */
const SCALE: Record<
  (typeof BODY_CONDITION_SCORES)[number],
  { bn: string; en: string }
> = {
  "1": { bn: "১ — খুব রোগা", en: "1 — very thin" },
  "2": { bn: "২ — রোগা", en: "2 — thin" },
  "3": { bn: "৩ — ঠিক আছে", en: "3 — moderate" },
  "4": { bn: "৪ — ভালো গোশত", en: "4 — good flesh" },
  "5": { bn: "৫ — খুব মোটা", en: "5 — fat" },
};

/** The words a score is said in, as the Playbook's slot says it. */
export const bodyConditionWords = (
  score: BodyConditionScore
): { bn: string; en: string } => SCALE[String(score) as keyof typeof SCALE];

/**
 * The slot that asks it, as the Standard Playbook writes it, and as the Playbook editor adds it to a Step: marked as Body
 * Condition, so the farm reads it as that whatever the question above it is reworded to.
 */
export const BODY_CONDITION: Evidence = {
  type: "choice",
  required: false,
  label: {
    bn: "শরীরের অবস্থা (জানলে)",
    en: "Body condition (if you can judge it)",
  },
  choices: BODY_CONDITION_SCORES.map((value) => ({
    value,
    label: SCALE[value],
  })),
  means: "body_condition",
};

/** Whether a choice offers the five scores, no more and none missing: what a slot marked as Body Condition must. */
export const offersTheFiveScores = (evidence: Evidence): boolean => {
  const offered = (evidence.choices ?? []).map((one) => one.value);
  return (
    evidence.type === "choice" &&
    offered.length === BODY_CONDITION_SCORES.length &&
    BODY_CONDITION_SCORES.every((score) => offered.includes(score))
  );
};

/**
 * Whether a slot asks Body Condition: one marked so — publishing refuses one that does not offer the five scores — or,
 * written before the slot carried its mark, the Playbook's own slot as it was: the five scores, each in the Playbook's
 * own words. An Owner's own one-to-five choice — a lameness score typed "1, 2, 3, 4, 5" — has the same values and its
 * own words, and is not read as it.
 */
const asksIt = (evidence: Evidence): boolean => {
  if (evidence.means === "body_condition") {
    return true;
  }
  return (
    evidence.means === undefined &&
    offersTheFiveScores(evidence) &&
    (evidence.choices ?? []).every(
      (one) => one.label.bn === SCALE[one.value as keyof typeof SCALE]?.bn
    )
  );
};

/** Where a Step asks Body Condition, or -1 where it does not. */
export const bodyConditionSlot = (step: Pick<Step, "evidence">): number =>
  step.evidence.findIndex(asksIt);

/** Whether a Step asks Body Condition. */
export const asksBodyConditionIn = (step: Pick<Step, "evidence">): boolean =>
  bodyConditionSlot(step) !== -1;

/** The score a Step's answer gave her, or nothing where it was not judged or the Step does not ask it. */
export const bodyConditionIn = (
  step: Pick<Step, "evidence">,
  evidence: readonly unknown[]
): BodyConditionScore | null => {
  const at = bodyConditionSlot(step);
  const value = at === -1 ? undefined : evidence[at];
  return typeof value === "string" &&
    (BODY_CONDITION_SCORES as readonly string[]).includes(value)
    ? (Number(value) as BodyConditionScore)
    : null;
};

/**
 * When she was judged: the moment the Step says the thing happened — when she calved — where it asks one and it was
 * answered, since a Calving is often written up hours after; otherwise when the Step was written.
 */
export const judgedAtOf = (
  step: Pick<Step, "evidence">,
  evidence: readonly unknown[],
  recordedAt: Date
): Date => {
  const at = step.evidence.findIndex((item) => item.type === "datetime");
  const said = at === -1 ? undefined : evidence[at];
  const when = typeof said === "string" && said !== "" ? new Date(said) : null;
  return when && !Number.isNaN(when.getTime()) ? when : recordedAt;
};
