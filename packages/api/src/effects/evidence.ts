import type {
  Choice,
  Held,
  Slot,
  SlotName,
  SlotNamed,
  Step,
  StepShape,
  TurnOf,
} from "@OpenFarm/domain";
import { positionOf, slotsOf, turnsOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { EffectInput } from "./effect";

// How an Effect reads a Step's Evidence: by the positions and choices the Version declares, refusing what it never
// offered.

/**
 * What the published Version says a Step always carries — a required answer, the animal of a Step walked animal by
 * animal — read without asking the entry again what publishing already settled. Missing, the farm is at fault, not
 * the entry.
 */
export const asPublished = <Value>(
  value: Value | null | undefined,
  what: string
): Value => {
  if (value === null || value === undefined) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: `The published Step says it carries ${what}, and it does not`,
    });
  }
  return value;
};

/** The figure a record-writing Step asks for: the first `number` slot the Version declares.
 *  A Step that writes a record has exactly one figure to write — litres, kilograms, a dose. */
export const numberIn = (step: Step, evidence: unknown[]): number => {
  const index = step.evidence.findIndex((item) => item.type === "number");
  const value = index === -1 ? undefined : evidence[index];
  const typed = Number(value);
  if (
    index === -1 ||
    value === undefined ||
    value === "" ||
    Number.isNaN(typed)
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step records a figure, and none was given",
    });
  }
  return typed;
};

/** What was written in the Step's note, trimmed, or nothing when it was left empty. */
export const noteIn = (step: Step, evidence: unknown[]): string | null => {
  const index = step.evidence.findIndex((item) => item.type === "note");
  const value = index === -1 ? undefined : evidence[index];
  const written = typeof value === "string" ? value.trim() : "";
  return written === "" ? null : written;
};

/** The note a Step recorded, or nothing when the Step was skipped. */
export const writtenNote = (
  input: Pick<EffectInput, "skipped" | "step" | "evidence">
): string | null => (input.skipped ? null : noteIn(input.step, input.evidence));

/** What was chosen at one position, as the Version declares it there — or null when nothing was.
 *  A value the Version never offered at that position is refused, not ignored. */
export const declaredChoiceAt = (
  step: Step,
  evidence: unknown[],
  position: number
): Choice | null => {
  const value = evidence[position];
  if (typeof value !== "string" || value === "") {
    return null;
  }
  const declared = step.evidence[position]?.choices?.find(
    (choice) => choice.value === value
  );
  if (!declared) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That is not one of the things this step offers",
    });
  }
  return declared;
};

/**
 * What the person chose, as the Version declares it — the value, and the Bangla they were
 * reading when they chose it. Checked against the Step's own choices, the way a Move's Pen is
 * checked against the farm's: a value no Version ever offered is not something anybody saw.
 */
export const choiceIn = (
  step: Step,
  evidence: unknown[],
  nothingChosen: string
): Choice => {
  const index = step.evidence.findIndex((item) => item.type === "choice");
  const chosen = index === -1 ? null : declaredChoiceAt(step, evidence, index);
  if (!chosen) {
    throw new ORPCError("BAD_REQUEST", { message: nothingChosen });
  }
  return chosen;
};

/**
 * What was chosen at one position of the Evidence, as one of the fixed words the record reads back —
 * or null when that slot was left empty.
 */
export const choiceAt = <Value extends string>(
  step: Step,
  evidence: unknown[],
  position: number,
  allowed: readonly Value[]
): Value | null => {
  const value = declaredChoiceAt(step, evidence, position)?.value ?? null;
  if (value !== null && !(allowed as readonly string[]).includes(value)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That is not one of the things this step offers",
    });
  }
  return value as Value | null;
};

/** What was written at one position of the Evidence, trimmed, or null when it was left empty. */
export const textAt = (
  evidence: unknown[],
  position: number
): string | null => {
  const value = evidence[position];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};

/** The Pen a Pen's Step records into. Feeding a Pen and milking one are about a Pen, and work about the whole
 *  farm cannot carry them. */
export const penOf = (input: Pick<EffectInput, "instance">): string => {
  if (input.instance.penId === null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This Step records a Pen's work, and this work is in no Pen",
      data: { refusal: "work_in_no_pen" },
    });
  }
  return input.instance.penId;
};

/** What was answered at one position, as the slot there says it is held. Null for a slot left empty — and for
 *  a date nobody can read, which is a slot nobody answered. */
const heldAt = (
  step: Step,
  evidence: unknown[],
  slot: Slot,
  at: number
): unknown => {
  if (slot.kind === "choice") {
    const chosen = declaredChoiceAt(step, evidence, at)?.value ?? null;
    if (chosen !== null && !slot.values.includes(chosen)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "That is not one of the things this step offers",
      });
    }
    return chosen;
  }
  if (slot.kind === "datetime") {
    const when = new Date(String(evidence[at]));
    return Number.isNaN(when.getTime()) ? null : when;
  }
  return textAt(evidence, at);
};

/**
 * What one slot of a shaped Step holds, by the name the shape gives it: a choice one of its own words, a date
 * and time the instant the farm means, a note what was written. Nothing for a slot left empty.
 *
 * Read by name rather than by position, so an Effect and the rule publishing checked cannot come to disagree
 * about which answer is which (CONTEXT: SOP Definition).
 */
export const heldIn = <Shape extends StepShape, Name extends SlotName<Shape>>(
  input: { step: Step; evidence: unknown[] },
  shape: Shape,
  name: Name
): Held<SlotNamed<Shape, Name>> | null => {
  const at = positionOf(shape, name);
  const slot = slotsOf(shape).find((one) => one.at === at)?.slot;
  if (!slot) {
    throw new Error(`no slot called ${String(name)} in this shape`);
  }
  return heldAt(input.step, input.evidence, slot, at) as Held<
    SlotNamed<Shape, Name>
  > | null;
};

/** Each turn of a repeated group, in order — the calves of one calving — with what every slot of that turn
 *  holds, and nothing for the turns the farm left empty. */
export const turnsIn = <Shape extends StepShape, Name extends string>(
  input: { step: Step; evidence: unknown[] },
  shape: Shape,
  name: Name
): TurnOf<Shape, Name>[] => {
  const group = shape.find(
    (asked) => "kind" in asked && asked.kind === "repeat" && asked.name === name
  );
  const slots = group && "of" in group ? group.of : [];
  return turnsOf(shape, name).map(
    ({ at }) =>
      Object.fromEntries(
        slots.map((slot) => [
          slot.name,
          heldAt(input.step, input.evidence, slot, at[slot.name] ?? -1),
        ])
      ) as TurnOf<Shape, Name>
  );
};
