import type { Evidence, Step } from "./sop";

/**
 * Body Condition: how much flesh an Animal carries, judged by eye on the common five-point scale — one very thin, five
 * fat. Asked wherever the farm has an animal in front of it and a reason to want it: at every Weigh-in, at Dry-off and at
 * her Calving — and never insisted on, since not everybody has the eye for it (DLS GLPP 2023 §16.2.4.1.2).
 */
export const BODY_CONDITION_SCORES = ["1", "2", "3", "4", "5"] as const;
export type BodyConditionScore = 1 | 2 | 3 | 4 | 5;

/**
 * The slot that asks it, as the Standard Playbook writes it. The values are the record's words, read back as the score
 * whatever the farm calls them; the words above them are the farm's to reword.
 */
export const BODY_CONDITION: Evidence = {
  type: "choice",
  required: false,
  label: {
    bn: "শরীরের অবস্থা (জানলে)",
    en: "Body condition (if you can judge it)",
  },
  choices: [
    { value: "1", label: { bn: "১ — খুব রোগা", en: "1 — very thin" } },
    { value: "2", label: { bn: "২ — রোগা", en: "2 — thin" } },
    { value: "3", label: { bn: "৩ — ঠিক আছে", en: "3 — moderate" } },
    { value: "4", label: { bn: "৪ — ভালো গোশত", en: "4 — good flesh" } },
    { value: "5", label: { bn: "৫ — খুব মোটা", en: "5 — fat" } },
  ],
};

/** Whether a slot asks Body Condition: a choice of the five scores, no more and none missing. */
const asksBodyCondition = (evidence: Evidence): boolean => {
  const offered = (evidence.choices ?? []).map((one) => one.value);
  return (
    evidence.type === "choice" &&
    offered.length === BODY_CONDITION_SCORES.length &&
    BODY_CONDITION_SCORES.every((score) => offered.includes(score))
  );
};

/** Where a Step asks Body Condition, or -1 where it does not. */
export const bodyConditionSlot = (step: Pick<Step, "evidence">): number =>
  step.evidence.findIndex(asksBodyCondition);

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
