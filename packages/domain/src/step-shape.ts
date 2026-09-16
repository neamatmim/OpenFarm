import {
  CALF_OUTCOMES,
  CALF_SEXES,
  CALVING_EASES,
  PREGNANCY_CHECK_RESULTS,
  SERVICE_METHODS,
} from "./breeding";
import type { Evidence, Step } from "./sop";

/**
 * What a shaped Step asks for, said once.
 *
 * A handful of Steps are not the farm's to word as it likes: what a Service, a Calving or a Pregnancy Check
 * records is read back by every later act in the breeding chain, so the slots those Steps carry — what kind of
 * answer, in what order, which of them may be left empty, and for a choice the exact words the record reads —
 * are fixed. They were written out three times: the rule publishing checks, the positions an Effect read by,
 * and the draft the phone builds for an Owner writing the Version. Only the first was ever verified.
 *
 * Here they are once. Publishing checks a Step against its shape, an Effect reads a slot by its name and is
 * handed what that slot holds, and the phone builds its draft from the same list — supplying only the farm's
 * own words for each choice, which are the farm's to reword and the record's to never read.
 */

/** One thing a Step asks for. `says` is what publishing tells an Owner whose Step does not ask it. */
interface Asks {
  name: string;
  required: boolean;
  says: string;
}

/** A fixed choice: the words the record reads back, which the farm may label as it likes but not change. */
export interface ChoiceSlot<Value extends string = string> extends Asks {
  kind: "choice";
  values: readonly Value[];
}

/** Something written: a straw's number, a technician's name, the reference a letter went under. */
export interface NoteSlot extends Asks {
  kind: "note";
}

/** A day and a time the farm means, which is not when it was written down. */
export interface DateTimeSlot extends Asks {
  kind: "datetime";
}

export type Slot = ChoiceSlot | NoteSlot | DateTimeSlot;

/**
 * A group of slots asked over again — the calves of one calving. The first `atLeast` of them are required and
 * the rest are not, so a Step can ask for room the farm may leave empty.
 */
export interface Repeated {
  name: string;
  kind: "repeat";
  of: readonly Slot[];
  atLeast: number;
  upTo: number;
}

/** What a Step asks for, in the order the record reads it. */
export type StepShape = readonly (Slot | Repeated)[];

/** Where each slot of a shape sits in the Step's Evidence, flattened as an Owner's Version carries it. */
export const slotsOf = (
  shape: StepShape
): { slot: Slot; at: number; required: boolean }[] => {
  const flat: { slot: Slot; at: number; required: boolean }[] = [];
  let at = 0;
  for (const asked of shape) {
    if ("kind" in asked && asked.kind === "repeat") {
      for (let turn = 0; turn < asked.upTo; turn += 1) {
        for (const slot of asked.of) {
          flat.push({ slot, at, required: turn < asked.atLeast });
          at += 1;
        }
      }
      continue;
    }
    flat.push({ slot: asked, at, required: asked.required });
    at += 1;
  }
  return flat;
};

/** Whether a slot offers exactly the words the record reads back — no more, and none missing. */
const offersExactly = (
  evidence: Evidence | undefined,
  values: readonly string[]
): boolean => {
  const offered = evidence?.choices?.map((one) => one.value) ?? [];
  return (
    offered.length === values.length &&
    values.every((value) => offered.includes(value))
  );
};

/** Whether what an Owner's Step asks at one position is what the shape says it must. */
const asksAsItMust = (
  slot: Slot,
  required: boolean,
  evidence: Evidence | undefined
): boolean => {
  if (evidence?.type !== slot.kind || evidence.required !== required) {
    return false;
  }
  return slot.kind === "choice" ? offersExactly(evidence, slot.values) : true;
};

/** What is wrong with a Step that has a shape to keep, in the words an Owner reads. */
export const problemsAgainst = (
  shape: StepShape,
  step: Step,
  path: string
): string[] =>
  slotsOf(shape).flatMap(({ slot, at, required }) =>
    asksAsItMust(slot, required, step.evidence[at])
      ? []
      : [`${path}.evidence[${at}]: ${slot.says}`]
  );

/**
 * What a Service Step asks for. The Step's own words are the farm's, but the record is read back by every later
 * act in the breeding chain, so its shape is not.
 *
 * Who served her is not required, because a bull running with the herd has nobody standing over him — an AI
 * service is refused without it when the dose is read, where the farm knows which it was.
 */
export const SERVICE_STEP = [
  {
    name: "method",
    kind: "choice",
    values: SERVICE_METHODS,
    required: true,
    says: 'a service step first asks how she was served, offering "ai" and "natural"',
  },
  {
    name: "sire",
    kind: "note",
    required: true,
    says: "a service step then asks for the sire, as a required note",
  },
  {
    name: "servedBy",
    kind: "note",
    required: false,
    says: "a service step then asks who served her, as a note",
  },
  {
    // When she was served, which is not when it was written down: every later date in the chain — the
    // Pregnancy Check, the Expected Calving — counts from this day (Owner's decision, 2026-09-13).
    name: "servedAt",
    kind: "datetime",
    required: true,
    says: "a service step then asks when she was served, as a required date and time",
  },
] as const satisfies StepShape;

/**
 * What a Calving Step asks for: when she calved, how it went, and a first calf and up to two more — twins, and
 * rarely triplets, are one calving. The first calf is required, because a calving with no calf is an abortion
 * and is recorded as one; the others are not.
 */
export const CALVING_STEP = [
  {
    name: "calvedAt",
    kind: "datetime",
    required: true,
    says: "a calving step first asks when she calved, as a required date and time",
  },
  {
    name: "ease",
    kind: "choice",
    values: CALVING_EASES,
    required: true,
    says: 'a calving step then asks how it went, offering "unassisted", "assisted" and "vet"',
  },
  {
    name: "calves",
    kind: "repeat",
    atLeast: 1,
    upTo: 3,
    of: [
      {
        name: "sex",
        kind: "choice",
        values: CALF_SEXES,
        required: true,
        says: 'a calving step asks each calf\'s sex ("female", "male") — the first calf required, the others not',
      },
      {
        name: "outcome",
        kind: "choice",
        values: CALF_OUTCOMES,
        required: true,
        says: 'a calving step asks whether each calf was born "alive" or "stillborn" — the first calf required, the others not',
      },
    ],
  },
] as const satisfies StepShape;

/**
 * What a Pregnancy Check Step asks for: what the Vet found. Anything else the Vet wants to write sits after it.
 */
export const PREGNANCY_CHECK_STEP = [
  {
    name: "result",
    kind: "choice",
    values: PREGNANCY_CHECK_RESULTS,
    required: true,
    says: 'a pregnancy check first asks what was found, as a required choice offering "positive" and "negative"',
  },
] as const satisfies StepShape;

/** What a Step that records delivering the letter asks for: the reference the office files it under, written
 *  rather than counted — required, because a report that cannot be evidenced is a report that was not made. */
export const DLS_REPORT_STEP = [
  {
    name: "reference",
    kind: "note",
    required: true,
    says: "this step records the reference the report was delivered under, and it has to be asked for and required",
  },
] as const satisfies StepShape;

/** What a Step that records a Campaign's Lot Number asks for: the number off the vial. */
export const LOT_NUMBER_STEP = [
  {
    name: "lotNumber",
    kind: "note",
    required: true,
    says: "this step records the Lot Number off the vial, and it has to be asked for and required",
  },
] as const satisfies StepShape;

/** What a slot holds when it has been answered: a choice gives back one of its own words, a note what was
 *  written, and a date and time the instant the farm means. */
export type Held<Of> =
  Of extends ChoiceSlot<infer Value>
    ? Value
    : Of extends DateTimeSlot
      ? Date
      : string;

/** The slot of a shape that goes by this name — how a reader says which one it wants. */
export type SlotNamed<Shape extends StepShape, Name> = Extract<
  Shape[number],
  { name: Name }
>;

/** The names a shape's slots go by, the repeated ones left out: they are read as a group. */
export type SlotName<Shape extends StepShape> = Extract<
  Shape[number],
  Slot
>["name"];

/** Where the slot of this name sits in a Step's Evidence. */
export const positionOf = <Shape extends StepShape>(
  shape: Shape,
  name: SlotName<Shape>
): number => {
  const found = slotsOf(shape).find((one) => one.slot.name === name);
  if (!found) {
    throw new Error(`no slot called ${name} in this shape`);
  }
  return found.at;
};

/** Where each turn of a repeated group sits, turn by turn: the calves of one calving. */
export const turnsOf = <Shape extends StepShape>(
  shape: Shape,
  name: string
): { at: Record<string, number>; required: boolean }[] => {
  const group = shape.find(
    (asked): asked is Repeated =>
      "kind" in asked && asked.kind === "repeat" && asked.name === name
  );
  if (!group) {
    throw new Error(`no group called ${name} in this shape`);
  }
  const flat = slotsOf(shape);
  const first = flat.findIndex((one) => one.slot === group.of[0]);
  return Array.from({ length: group.upTo }, (_, turn) => {
    const at: Record<string, number> = {};
    for (const [offset, slot] of group.of.entries()) {
      at[slot.name] = first + turn * group.of.length + offset;
    }
    return { at, required: turn < group.atLeast };
  });
};

/** One turn of a repeated group, as it is read back: every slot of the group by its own name, holding what
 *  that slot holds, and nothing where the farm left it empty. */
export type TurnOf<Shape extends StepShape, Name> = {
  [
    Of in Extract<
      Shape[number],
      { kind: "repeat"; name: Name }
    >["of"][number] as Of["name"]
  ]: Held<Of> | null;
};
