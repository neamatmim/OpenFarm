import type { Bilingual, SkipMeaning, Step } from "@OpenFarm/domain";
import { HEAT, UNWELL_URGENT, eventOfObservation } from "@OpenFarm/domain";

/** What a choice on a round means to the farm beyond its words: a heat sends the breeding work, and the urgent words
 *  call the Manager within the hour. Every other sighting is the Manager's on a day's clock, whatever it is called. */
export type ChoiceMeaning = "heat" | "urgent";

/** What a choice's value means, on a Step that records what was seen; nothing on any other. */
export const choiceMeaningOf = (
  step: Pick<Step, "effect">,
  value: string
): ChoiceMeaning | null => {
  if (step.effect?.kind !== "observation") {
    return null;
  }
  if (value === HEAT) {
    return "heat";
  }
  return eventOfObservation(value) === UNWELL_URGENT ? "urgent" : null;
};

/** A meaning the Step had when the editing began and has no longer: the words it was on, and what it meant. */
export type LostMeaning =
  | { kind: "choice"; value: string; was: Bilingual; means: ChoiceMeaning }
  | { kind: "skip"; was: Bilingual; means: SkipMeaning };

/** The words on a Step that could be given a lost meaning: those written in this draft, which no record points at. */
export interface Taker {
  index: number;
  words: Bilingual;
}

/**
 * The meanings the Step held when the editing began that nothing on it holds now. Rewording "পশু পাওয়া যায়নি" made a
 * new reason that opened no Missing, and a word put in the place of "গরম হয়েছে" took its heat unasked: so a meaning
 * is never carried by place, and one left behind is shown to be given back.
 */
export const lostMeaningsOf = (
  before: Step | undefined,
  after: Step
): LostMeaning[] => {
  if (!before) {
    return [];
  }
  const values = new Set(
    after.evidence.flatMap((one) => one.choices ?? []).map((one) => one.value)
  );
  const lostChoices = before.evidence
    .flatMap((one) => one.choices ?? [])
    .flatMap((choice): LostMeaning[] => {
      const means = choiceMeaningOf(after, choice.value);
      return means && !values.has(choice.value)
        ? [{ kind: "choice", value: choice.value, was: choice.label, means }]
        : [];
    });
  const held = new Set(after.skipReasons.map((reason) => reason.means));
  const lostReasons = before.skipReasons.flatMap((reason): LostMeaning[] =>
    reason.means && !held.has(reason.means)
      ? [{ kind: "skip", was: { bn: reason.bn }, means: reason.means }]
      : []
  );
  return [...lostChoices, ...lostReasons];
};

/** Who on the Step could take a lost meaning: a choice or reason written in this draft, and none the farm acts on. */
export const takersOf = (
  before: Step | undefined,
  after: Step,
  lost: LostMeaning
): Taker[] => {
  if (lost.kind === "skip") {
    const had = new Set((before?.skipReasons ?? []).map((one) => one.bn));
    return after.skipReasons.flatMap((reason, index) =>
      reason.means || had.has(reason.bn)
        ? []
        : [{ index, words: { bn: reason.bn } }]
    );
  }
  const had = new Set(
    (before?.evidence ?? [])
      .flatMap((one) => one.choices ?? [])
      .map((one) => one.value)
  );
  return (after.evidence[0]?.choices ?? []).flatMap((choice, index) =>
    had.has(choice.value) || choiceMeaningOf(after, choice.value)
      ? []
      : [{ index, words: choice.label }]
  );
};

/** The Step with a lost meaning given to one of its new choices or reasons, as the Owner says: the same thing, in new
 *  words. */
export const withMeaningGiven = (
  step: Step,
  lost: LostMeaning,
  index: number
): Step => {
  if (lost.kind === "skip") {
    return {
      ...step,
      skipReasons: step.skipReasons.map((reason, at) =>
        at === index ? { ...reason, means: lost.means } : reason
      ),
    };
  }
  const [first, ...rest] = step.evidence;
  if (!first) {
    return step;
  }
  return {
    ...step,
    evidence: [
      {
        ...first,
        choices: (first.choices ?? []).map((choice, at) =>
          at === index ? { ...choice, value: lost.value } : choice
        ),
      },
      ...rest,
    ],
  };
};
