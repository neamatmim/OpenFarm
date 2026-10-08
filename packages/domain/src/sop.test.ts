import { describe, expect, it } from "vitest";

import type { SopContent, Step } from "./sop";
import {
  describeChanges,
  findStructuralProblems,
  maySkip,
  isOneTap,
  missingEvidence,
  nothingToNoteOf,
} from "./sop";
import { standardPlaybook } from "./standard-playbook";
import { CALVING_STEP, SERVICE_STEP, draftFrom } from "./step-shape";

// Which Steps may be skipped is asked by two readers — the server, refusing a skip it does not allow,
// and the phone, deciding whether to draw the button at all. They used to answer differently. These are
// about the answer they now share.

/** A Step done once for the whole Pen, carrying the Effect named. */
const doneOnce = (
  effect?: Step["effect"]
): Pick<Step, "repeatPerAnimal" | "effect"> => ({
  repeatPerAnimal: false,
  effect,
});

/** A Step done at each animal in turn. */
const doneAtEachAnimal = (
  effect?: Step["effect"]
): Pick<Step, "repeatPerAnimal" | "effect"> => ({
  repeatPerAnimal: true,
  effect,
});

describe("which Steps may be skipped", () => {
  it("lets a Step done at each animal skip the animal, whatever it does", () => {
    expect(maySkip(doneAtEachAnimal())).toBe(true);
    expect(maySkip(doneAtEachAnimal({ kind: "milk_record" }))).toBe(true);
  });

  it("lets a dose be skipped though it is done once for the Pen", () => {
    // The seeded Playbook's own dose Step, which the farm wrote "ওষুধ শেষ" against and nobody on a
    // phone could choose while the screen read repeatPerAnimal alone.
    expect(maySkip(doneOnce({ kind: "treatment" }))).toBe(true);
  });

  it("lets a service be skipped, for the heat that did not need a second one", () => {
    expect(maySkip(doneOnce({ kind: "service" }))).toBe(true);
  });

  it("refuses a Step that is neither, so a milking is not skipped by saying so", () => {
    expect(maySkip(doneOnce())).toBe(false);
    expect(maySkip(doneOnce({ kind: "milk_record" }))).toBe(false);
    expect(maySkip(doneOnce({ kind: "bulk_total" }))).toBe(false);
    expect(maySkip(doneOnce({ kind: "weigh_in" }))).toBe(false);
  });
});

/** Each count the Playbook keeps, the Effect its counting Step carries, and what a Version is told that counts it once
 *  per animal. */
const COUNTS = [
  {
    of: "the store",
    procedure: standardPlaybook().stockCount,
    effect: "stock_count",
    refused: "the store is counted once, not once per animal",
  },
  {
    of: "the medicine",
    procedure: standardPlaybook().medicineCount,
    effect: "medicine_count",
    refused: "the medicine is counted once, not once per animal",
  },
  {
    of: "the cash",
    procedure: standardPlaybook().cashCount,
    effect: "cash_count",
    refused: "the cash is counted once, not once per animal",
  },
  {
    of: "a Pen's head",
    procedure: standardPlaybook().headCount,
    effect: "head_count",
    refused: "a Pen is counted once, not once per animal",
  },
] as const satisfies readonly {
  of: string;
  procedure: SopContent;
  effect: NonNullable<Step["effect"]>["kind"];
  refused: string;
}[];

/** The Step of a count that does the counting. */
const countingStep = ({ procedure, effect }: (typeof COUNTS)[number]) => {
  const step = procedure.steps.find((one) => one.effect?.kind === effect);
  if (!step) {
    throw new Error("a count has its counting Step");
  }
  return step;
};

describe("a count of the store, the medicine, the cash or a Pen's head", () => {
  for (const count of COUNTS) {
    it(`is never skipped: ${count.of} is counted, or the work is missed`, () => {
      expect(maySkip(countingStep(count))).toBe(false);
    });

    it(`is never counted once per animal, so no Version makes ${count.of} a count that may be skipped`, () => {
      const step = countingStep(count);
      const problems = findStructuralProblems({
        ...count.procedure,
        steps: count.procedure.steps.map((one) =>
          one === step ? { ...one, repeatPerAnimal: true } : one
        ),
      });
      expect(problems.some((one) => one.endsWith(count.refused))).toBe(true);
    });
  }
});

/** A Step asking for exactly the slots named, in that order. */
const asking = (
  ...evidence: { type: Step["evidence"][number]["type"]; required: boolean }[]
): Pick<Step, "evidence"> => ({ evidence });

const noPhotos = () => false;

describe("what a Step is still missing", () => {
  it("counts a required note filled with spaces as unfilled", () => {
    // The farm has always refused this. The phone used to offer the button for it, because it asked
    // whether the box was empty rather than whether anything had been said in it.
    expect(
      missingEvidence(
        asking({ type: "note", required: true }),
        ["  "],
        noPhotos
      )
    ).toEqual([0]);
    expect(
      missingEvidence(
        asking({ type: "note", required: true }),
        ["ঠিক আছে"],
        noPhotos
      )
    ).toEqual([]);
  });

  it("asks per slot, not by count", () => {
    // An optional note and a required number: filling only the note satisfies nothing.
    const step = asking(
      { type: "note", required: false },
      { type: "number", required: true }
    );
    expect(missingEvidence(step, ["said", ""], noPhotos)).toEqual([1]);
  });

  it("takes a tick that was ticked, and false is an answer", () => {
    expect(
      missingEvidence(
        asking({ type: "tick", required: true }),
        [true],
        noPhotos
      )
    ).toEqual([]);
    expect(
      missingEvidence(
        asking({ type: "tick", required: true }),
        [false],
        noPhotos
      )
    ).toEqual([]);
  });

  it("looks for a photograph where one is asked for, not in the answers", () => {
    const step = asking({ type: "photo", required: true });
    expect(missingEvidence(step, [""], noPhotos)).toEqual([0]);
    expect(missingEvidence(step, [""], () => true)).toEqual([]);
  });

  it("asks nothing of a slot the Version did not require", () => {
    expect(
      missingEvidence(asking({ type: "note", required: false }), [""], noPhotos)
    ).toEqual([]);
  });
});

describe("work about the whole farm", () => {
  const { biosecurity } = standardPlaybook();

  it("is the farm's one biosecurity check, and publishes as it is", () => {
    expect(biosecurity.wholeFarm).toBe(true);
    expect(findStructuralProblems(biosecurity)).toEqual([]);
  });

  it("walks no Pen, so no Step of it repeats at each animal", () => {
    const [first, ...rest] = biosecurity.steps;
    if (!first) {
      throw new Error("the biosecurity check has steps");
    }
    const problems = findStructuralProblems({
      ...biosecurity,
      steps: [{ ...first, repeatPerAnimal: true }, ...rest],
    });

    expect(problems.join(" ")).toContain("walked once");
  });

  it("is raised by the clock, not by something that happened to an animal in a Pen", () => {
    const problems = findStructuralProblems({
      ...biosecurity,
      triggers: [{ kind: "event", event: "arrival" }],
    });

    expect(problems.join(" ")).toContain("raised by the clock");
  });

  it("is a change the people doing the work are told of, either way", () => {
    const perPen = { ...biosecurity, wholeFarm: undefined };

    expect(describeChanges(perPen, biosecurity)).toContainEqual({
      kind: "now_whole_farm",
    });
    expect(describeChanges(biosecurity, perPen)).toContainEqual({
      kind: "now_per_pen",
    });
  });
});

describe("passing an animal as well", () => {
  it("is a tap on every round the standard Playbook walks, found by what the reason means, not its words", () => {
    const rounds = Object.values(standardPlaybook()).flatMap((sop) =>
      sop.steps.filter(
        (step) =>
          step.repeatPerAnimal &&
          step.skipReasons.some((reason) => reason.en?.startsWith("Well"))
      )
    );
    expect(rounds.length).toBeGreaterThan(0);
    for (const step of rounds) {
      expect(nothingToNoteOf(step)?.en).toMatch(/^Well — /u);
    }
    // A reason reworded next season is still the one passed in a tap.
    expect(
      nothingToNoteOf({
        skipReasons: [
          { bn: "পশু পাওয়া যায়নি", means: "not_found" },
          { bn: "ঠিক আছে", means: "nothing_to_note" },
        ],
      })?.bn
    ).toBe("ঠিক আছে");
    expect(
      nothingToNoteOf({ skipReasons: [{ bn: "সুস্থ — চোখে পড়ার মতো কিছু নেই" }] })
    ).toBeNull();
  });
});

describe("a Step done in one tap", () => {
  const tick = { type: "tick" as const, required: true };
  it("is a tick and nothing else, with nothing to skip it with and nothing it writes", () => {
    expect(
      isOneTap({ repeatPerAnimal: false, evidence: [tick], skipReasons: [] })
    ).toBe(true);
    expect(
      isOneTap({ repeatPerAnimal: false, evidence: [], skipReasons: [] })
    ).toBe(true);
  });

  it("is never a Step with a figure, a choice, a reason to skip, an Effect, or one done at each animal", () => {
    const base = { repeatPerAnimal: false, evidence: [tick], skipReasons: [] };
    expect(
      isOneTap({
        ...base,
        evidence: [tick, { type: "photo" as const, required: false }],
      })
    ).toBe(false);
    expect(isOneTap({ ...base, skipReasons: [{ bn: "ওষুধ শেষ" }] })).toBe(false);
    expect(isOneTap({ ...base, effect: { kind: "treatment" } })).toBe(false);
    expect(isOneTap({ ...base, repeatPerAnimal: true })).toBe(false);
  });

  it("is not the feed's hot-day Step, which says whether it was hot", () => {
    const cool = standardPlaybook().feeding.steps.find(
      (step) => step.id === "cool"
    );
    expect(cool && isOneTap(cool)).toBe(false);
  });
});

describe("a Step that asks several things", () => {
  it("says what each answer is, on every one the standard Playbook writes", () => {
    const unlabeled = Object.entries(standardPlaybook()).flatMap(([key, sop]) =>
      sop.steps.flatMap((step) => {
        const asked = step.evidence.filter((item) => item.type !== "tick");
        return asked.length > 1
          ? asked
              .filter((item) => item.label === undefined)
              .map(() => `${key}.${step.id}`)
          : [];
      })
    );
    expect([...new Set(unlabeled)]).toEqual([]);
  });
});

/** What each answer is said to be, in order. */
const labels = (evidence: readonly { label?: unknown }[]) =>
  evidence.map((item) => item.label);

describe("the words above a shaped Step's answers", () => {
  it("are the same on the standard Playbook's Steps as on a Step the Owner drafts", () => {
    const playbook = standardPlaybook();
    const calving = playbook.calvingRecord.steps[0]?.evidence ?? [];
    const service = playbook.insemination.steps[0]?.evidence ?? [];
    // Only the labels are compared; the choices' own words are the farm's to word.
    const any = { bn: "—" };
    expect(labels(calving)).toEqual(
      labels(
        draftFrom(CALVING_STEP, {
          unassisted: any,
          assisted: any,
          vet: any,
          female: any,
          male: any,
          alive: any,
          stillborn: any,
        })
      )
    );
    expect(labels(service)).toEqual(
      labels(draftFrom(SERVICE_STEP, { ai: any, natural: any }))
    );
  });
});

describe("a Version's Steps", () => {
  it("each has its own id, and each choice its own value", () => {
    const { biosecurity } = standardPlaybook();
    const [first, ...rest] = biosecurity.steps;
    if (!first) {
      throw new Error("the biosecurity check has steps");
    }
    // Two Steps with one id: answering the first finished the work, and the second was never asked.
    expect(
      findStructuralProblems({
        ...biosecurity,
        steps: [first, { ...first, text: { bn: "আবার" } }, ...rest],
      }).some((problem) => problem.includes("already the id"))
    ).toBe(true);
    const choosing = {
      ...first,
      evidence: [
        {
          type: "choice" as const,
          required: true,
          choices: [
            { value: "yes", label: { bn: "হ্যাঁ" } },
            { value: "yes", label: { bn: "হ্যাঁ আবার" } },
          ],
        },
      ],
    };
    expect(
      findStructuralProblems({ ...biosecurity, steps: [choosing] }).some(
        (problem) => problem.includes("share one value")
      )
    ).toBe(true);
  });
});

describe("a procedure's grace", () => {
  it("is refused as the farm refuses it: not whole minutes, or more than a day", () => {
    const { feeding } = standardPlaybook();
    const graceOf = (graceMinutes: number) =>
      findStructuralProblems({ ...feeding, graceMinutes }).filter((problem) =>
        problem.startsWith("graceMinutes")
      );
    expect(graceOf(2000)).toHaveLength(1);
    expect(graceOf(30.5)).toHaveLength(1);
    expect(graceOf(Number.NaN)).toHaveLength(1);
    expect(graceOf(1440)).toEqual([]);
  });
});
