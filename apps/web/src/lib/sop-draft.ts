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
import {
  STAYS_A_HEIFER,
  CALVING_STEP,
  HEAT,
  URGENT_ROUND_WORDS,
  DLS_REPORT_STEP,
  LOT_NUMBER_STEP,
  PREGNANCY_CHECK_STEP,
  SERVICE_STEP,
  draftFrom,
} from "@OpenFarm/domain";

/** What reading when a procedure comes up needs of it: its Triggers, and nothing else — so a card that holds only
 *  those can ask as the editor does. */
type Timed = Pick<SopContent, "triggers">;

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

export const scheduleTimes = (content: Timed): string[] => {
  const schedule = content.triggers.find(
    (trigger) => trigger.kind === "schedule"
  );
  return schedule?.kind === "schedule" ? schedule.times : [];
};

const scheduleOf = (content: Timed) => {
  const schedule = content.triggers.find(
    (trigger) => trigger.kind === "schedule"
  );
  return schedule?.kind === "schedule" ? schedule : null;
};

/** The schedule with some of its parts changed, keeping the rest — changing the times keeps the days. */
const withSchedule = (
  content: SopContent,
  change: {
    times?: string[];
    weekdays?: number[];
    everyOtherWeek?: boolean;
    firstOfTheMonth?: boolean;
  }
): SopContent => {
  const current = scheduleOf(content);
  const next = {
    kind: "schedule" as const,
    times: change.times ?? current?.times ?? [],
    weekdays: "weekdays" in change ? change.weekdays : current?.weekdays,
    everyOtherWeek:
      "everyOtherWeek" in change
        ? change.everyOtherWeek
        : current?.everyOtherWeek,
    firstOfTheMonth:
      "firstOfTheMonth" in change
        ? change.firstOfTheMonth
        : current?.firstOfTheMonth,
  };
  // Monthly and fortnightly are two rhythms: choosing one sets the other aside.
  if (change.firstOfTheMonth) {
    delete next.everyOtherWeek;
  }
  if (change.everyOtherWeek) {
    delete next.firstOfTheMonth;
  }
  if (!next.weekdays?.length) {
    delete next.weekdays;
    delete next.everyOtherWeek;
    delete next.firstOfTheMonth;
  }
  if (!next.everyOtherWeek) {
    delete next.everyOtherWeek;
  }
  if (!next.firstOfTheMonth) {
    delete next.firstOfTheMonth;
  }
  const others = content.triggers.filter((t) => t.kind !== "schedule");
  // No time and no day: no clock raises it, so it is raised by hand or by what happens — not an empty schedule the
  // farm refuses, which nothing in the editor could take away.
  if (next.times.length === 0 && !next.weekdays) {
    return { ...content, triggers: others };
  }
  return { ...content, triggers: [next, ...others] };
};

export const withScheduleTimes = (
  content: SopContent,
  times: string[]
): SopContent => withSchedule(content, { times });

export const scheduleWeekdays = (content: Timed): number[] =>
  scheduleOf(content)?.weekdays ?? [];

export const scheduleEveryOtherWeek = (content: Timed): boolean =>
  scheduleOf(content)?.everyOtherWeek ?? false;

export const withScheduleWeekdays = (
  content: SopContent,
  weekdays: number[]
): SopContent =>
  withSchedule(content, { weekdays: [...weekdays].toSorted((a, b) => a - b) });

export const scheduleFirstOfTheMonth = (content: Timed): boolean =>
  scheduleOf(content)?.firstOfTheMonth ?? false;

export const withFirstOfTheMonth = (
  content: SopContent,
  firstOfTheMonth: boolean
): SopContent => withSchedule(content, { firstOfTheMonth });

export const withEveryOtherWeek = (
  content: SopContent,
  everyOtherWeek: boolean
): SopContent => withSchedule(content, { everyOtherWeek });

/** A Trigger that is not a clock: a Move, an arrival, a State an animal reaches — or a
 *  Prescription, which raises a dose of its own accord. */
export type HappeningTrigger = Extract<
  Trigger,
  {
    kind:
      | "event"
      | "state"
      | "prescription"
      | "notifiable_disease"
      | "before_calving"
      | "registration_renewal";
  }
>;

export const happeningTriggers = (content: Timed): HappeningTrigger[] =>
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
 * What a shaped Step asks for, drafted from the shape itself rather than written out again here.
 *
 * All this supplies is the farm's own words for each fixed word the record reads back. The words may be
 * reworded whenever the farm likes; the values under them may not, and are not written here at all — leaving
 * one of them out is a mistake the compiler makes rather than one publishing finds.
 */
const SERVICE_STEP_EVIDENCE = draftFrom(SERVICE_STEP, {
  ai: { bn: "কৃত্রিম প্রজনন", en: "AI" },
  natural: { bn: "ষাঁড় দিয়ে", en: "Natural" },
});

const CALVING_STEP_EVIDENCE = draftFrom(CALVING_STEP, {
  unassisted: { bn: "নিজে নিজে", en: "Unassisted" },
  assisted: { bn: "সাহায্য লেগেছে", en: "Assisted" },
  vet: { bn: "ভেট লেগেছে", en: "With the vet" },
  female: { bn: "বকনা", en: "Heifer calf" },
  male: { bn: "এঁড়ে", en: "Bull calf" },
  alive: { bn: "জীবিত", en: "Alive" },
  stillborn: { bn: "মৃত", en: "Stillborn" },
});

const [PREGNANCY_CHECK_RESULT] = draftFrom(PREGNANCY_CHECK_STEP, {
  positive: { bn: "গর্ভবতী", en: "Carrying" },
  negative: { bn: "গর্ভবতী নয়", en: "Not carrying" },
});

/** The reference the office files the letter under, and the number off the vial: one written answer each, and
 *  the shape says it is insisted on — a report that cannot be evidenced was not made, and a vaccination
 *  nobody can trace is not one. */
const [DLS_REPORT_NOTE] = draftFrom(DLS_REPORT_STEP, {});
const [LOT_NUMBER_NOTE] = draftFrom(LOT_NUMBER_STEP, {});
const ONCE_WITH_A_NOTE_EVIDENCE: Partial<Record<StepEffect["kind"], Evidence>> =
  {
    dls_report: DLS_REPORT_NOTE,
    lot_number: LOT_NUMBER_NOTE,
  };

/** The effects done once whose record is a written note: the reference a letter went under, a Campaign's Lot
 *  Number. */
const ONCE_WITH_A_NOTE: ReadonlySet<StepEffect["kind"]> = new Set<
  StepEffect["kind"]
>(["dls_report", "lot_number"]);

/** A campaign dose's own Lot Number, for a dose from another vial than the rest of its Campaign: asked at every
 *  vaccine dose, never required. */
const OWN_LOT_NUMBER: Evidence = { type: "note", required: false };

/** The effects done once that ask only that they were done: the Pen fed by its Ration, the stores counted Item by
 *  Item, the Registration renewed with its own dates — none asks a figure of the Step, and none is walked animal by
 *  animal. */
const DONE_ONCE_WITH_A_TICK: ReadonlySet<StepEffect["kind"]> = new Set<
  StepEffect["kind"]
>(["feeding", "stock_count", "medicine_count", "registration_renewal"]);

/** The effects done once for the Pen or the farm rather than animal by animal. */
const DONE_ONCE: ReadonlySet<StepEffect["kind"]> = new Set<StepEffect["kind"]>([
  ...DONE_ONCE_WITH_A_TICK,
  "bulk_total",
  "head_count",
  "cash_count",
  "treatment",
  ...ONCE_WITH_A_NOTE,
]);

/** The effects whose Step is a whole shape of its own — every answer it asks, in order. */
const SHAPED: ReadonlySet<StepEffect["kind"]> = new Set<StepEffect["kind"]>([
  "service",
  "calving",
  "pregnancy_check",
]);

/** What Evidence an effect needs before it can write anything. */
const wantedEvidence = (kind: StepEffect["kind"]): EvidenceType => {
  if (kind === "move" || kind === "observation" || kind === "wean") {
    return "choice";
  }
  if (ONCE_WITH_A_NOTE.has(kind)) {
    return "note";
  }
  return kind === "treatment" ||
    kind === "dry_off" ||
    kind === "release" ||
    DONE_ONCE_WITH_A_TICK.has(kind)
    ? "tick"
    : "number";
};

/** The Evidence an effect needs when what is there does not fit: the farm's Pens for a
 *  Move, an empty list for the Owner to fill in for a Sighting, a figure for the rest. */
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
  if (kind === "wean") {
    // Where a weaned calf goes: a Heifer here, or one of the farm's Pens — the Fattening Pen the Owner picks.
    return {
      type: "choice",
      required: true,
      choices: [
        {
          value: STAYS_A_HEIFER,
          label: { bn: "বকনা হিসেবে থাকবে", en: "Stays as a heifer" },
        },
        ...pens.map((pen) => ({ value: pen.id, label: { bn: pen.name } })),
      ],
    };
  }
  if (kind === "observation") {
    // Nothing to carry over: this is reached only when what is there is not a choice at all.
    // What may be seen is the Owner's to write down.
    return { type: "choice", required: true, choices: [] };
  }
  if (
    kind === "dry_off" ||
    kind === "release" ||
    DONE_ONCE_WITH_A_TICK.has(kind)
  ) {
    // Drying a cow off, or letting a bull out of Quarantine, is a thing somebody did or did not do; which animal is
    // the whole record.
    return { type: "tick", required: true };
  }
  if (kind === "treatment") {
    // Giving a dose is a thing somebody did or did not do. There is no figure to write down:
    // how much is the Prescription's or the campaign's to say, not the milker's.
    return { type: "tick", required: true };
  }
  const asked = ONCE_WITH_A_NOTE_EVIDENCE[kind];
  if (asked) {
    return asked;
  }
  return { type: "number", required: true, unit: current?.unit };
};

/** A Step given an effect it did not have, from one plain answer. */
const withNewEffect = (
  step: Step,
  kind: StepEffect["kind"],
  pens: { id: string; name: string }[]
): Step => {
  // A Service asks four things in a fixed order — how, the sire, who served her, and when — so its
  // Step is given all four at once rather than one box the Owner then has to fill out by hand.
  if (kind === "service") {
    return {
      ...step,
      repeatPerAnimal: false,
      effect: { kind },
      evidence: [...SERVICE_STEP_EVIDENCE],
    };
  }
  if (kind === "calving") {
    // Walked cow by cow on a round of the calving pen: she has calved, or she is skipped.
    return {
      ...step,
      repeatPerAnimal: true,
      effect: { kind },
      evidence: [...CALVING_STEP_EVIDENCE],
    };
  }
  if (kind === "pregnancy_check") {
    return {
      ...step,
      repeatPerAnimal: false,
      effect: { kind },
      evidence: [PREGNANCY_CHECK_RESULT],
    };
  }
  const wants: EvidenceType = wantedEvidence(kind);
  const [first] = step.evidence;
  // A Pen is fed, its tank read, its store and head counted once; everything else is done animal by animal. A dose
  // Step starts as a prescribed dose — the shape that is complete without anything else being
  // chosen — and naming a product turns it into a campaign over the Pen.
  const perAnimal = !DONE_ONCE.has(kind);
  if (first?.type === wants) {
    return { ...step, repeatPerAnimal: perAnimal, effect: { kind } };
  }
  return {
    ...step,
    repeatPerAnimal: perAnimal,
    effect: { kind },
    evidence: [fittedEvidence(kind, first, pens)],
  };
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
  // The same effect chosen again changes nothing: an adopted standard Step stays as it was written.
  if ((step.effect?.kind ?? "") === kind) {
    return step;
  }
  // What it asked for its old effect goes with it — a milk record that was a service still asked every milker for a
  // straw number, unseen, after the service was gone. One answer is kept where it is a plain one; a shape's own
  // answers are not.
  const was = step.effect?.kind;
  const [kept] = step.evidence;
  const plain: Evidence =
    kept && !(was && SHAPED.has(was)) ? kept : { type: "tick", required: true };
  const bare: Step = { ...step, evidence: [plain] };
  if (kind === "") {
    const { effect: _dropped, ...rest } = bare;
    return { ...rest, repeatPerAnimal: false };
  }
  return withNewEffect(bare, kind, pens);
};

/**
 * Which product a campaign's Step gives, or none — and none means the other shape of a dose
 * Step: the farm's Treatment procedure, whose doses a Prescription names one at a time.
 */
export const withProduct = (
  step: Step,
  product: { id: string; vaccine: boolean } | null
): Step => {
  if (step.effect?.kind !== "treatment") {
    return step;
  }
  // The dose is ticked; a vaccine's dose also has room for her own Lot Number.
  const [given = { type: "tick", required: true }] = step.evidence;
  if (!product) {
    return {
      ...step,
      repeatPerAnimal: false,
      effect: { kind: "treatment" },
      evidence: [given],
    };
  }
  return {
    ...step,
    repeatPerAnimal: true,
    effect: { kind: "treatment", productId: product.id },
    evidence: product.vaccine ? [given, OWN_LOT_NUMBER] : [given],
  };
};

export const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/** Whether two lists as typed say the same: a comma just typed after the last, before the next is written, changes
 *  nothing — so a box rebuilt from the list would swallow it, and one kept as typed does not. */
export const sameList = (typed: string, shown: string): boolean =>
  splitList(typed).join(",") === splitList(shown).join(",");

/** A Step with its first Evidence put right and every other kept: the editor's unit, range and choices are the first
 *  slot's, and a weigh-in's condition score after it is the Step's too. */
export const withFirstEvidence = (step: Step, first: Evidence): Step => ({
  ...step,
  evidence: [first, ...step.evidence.slice(1)],
});

/**
 * Skip reasons, as the Owner types them: a comma-separated list in Bangla. A reason still in the list keeps what it
 * had — its English, and what it means to the farm — so rewording the others does not quietly stop "Animal not found"
 * opening a Missing.
 */
export const toBilingualList = <Reason extends Bilingual>(
  value: string,
  existing: readonly Reason[] = []
): (Reason | Bilingual)[] =>
  splitList(value).map(
    (bn) => existing.find((before) => before.bn === bn) ?? { bn }
  );

/**
 * Words in Bangla rewritten: the English said what the old words said, so it goes with them rather than staying beside
 * new Bangla it no longer translates — read in English, a Step said what it used to. Unchanged words keep theirs.
 */
export const reworded = (
  before: Bilingual | undefined,
  bn: string
): Bilingual => (before && before.bn === bn ? before : { bn });

/** A name for a new Step that no Step has had in this draft, so a Step taken out and one added are never read as one
 *  reworded — the changes a Version lists match Steps by their names. */
export const freshStepId = (steps: readonly Step[]): string => {
  const taken = new Set(steps.map((step) => step.id));
  for (;;) {
    const id = `step-${Math.random().toString(36).slice(2, 10)}`;
    if (!taken.has(id)) {
      return id;
    }
  }
};

/** Most a choice's value may be, as the farm keeps it. */
const CHOICE_VALUE_LENGTH = 40;

/** A new choice's value: its own words, cut to what the farm keeps, and never one another choice holds. */
const freshValue = (bn: string, taken: ReadonlySet<string>): string => {
  const cut = bn.slice(0, CHOICE_VALUE_LENGTH).trim();
  if (!taken.has(cut)) {
    return cut;
  }
  for (let next = 2; ; next += 1) {
    const suffix = `-${next}`;
    const value = `${cut.slice(0, CHOICE_VALUE_LENGTH - suffix.length).trim()}${suffix}`;
    if (!taken.has(value)) {
      return value;
    }
  }
};

export const fromBilingualList = (values: Bilingual[]): string =>
  values.map((value) => value.bn).join(", ");

/**
 * What may be chosen, as the Owner types it: a comma-separated list in Bangla. A new choice
 * takes its own label as its value, so the record keeps the word somebody actually chose.
 *
 * A choice already in the list keeps the value it had. Records point at values: a choice still
 * there by its words keeps its own, wherever it has moved to and whatever was taken out around it
 * — matched by place, taking out "lame" handed the next choice its value, and a heat was then a
 * lame sighting. Reworded where it stood, in a list as long as it was, it keeps its value too:
 * rewriting records because somebody reworded the list would orphan every Observation already made.
 */
/** The values of a round's choices the farm acts on, never handed to other words by their place in the list. */
const MEANINGFUL_VALUES: ReadonlySet<string> = new Set([
  HEAT,
  ...URGENT_ROUND_WORDS,
]);

export const toChoices = (value: string, existing: Choice[] = []): Choice[] => {
  const labels = splitList(value);
  const byLabel = new Map(existing.map((choice) => [choice.label.bn, choice]));
  const stillThere = new Set(labels.filter((bn) => byLabel.has(bn)));
  const inPlace = labels.length === existing.length;
  const taken = new Set(existing.map((choice) => choice.value));
  return labels.map((bn, index) => {
    const same = byLabel.get(bn);
    if (same) {
      return same;
    }
    const before = existing[index];
    // Never a meaning by its place: a word put where "গরম হয়েছে" stood is not a heat until the Owner says it is the
    // same thing (`lib/sop-meanings.ts`).
    if (
      inPlace &&
      before &&
      !stillThere.has(before.label.bn) &&
      !MEANINGFUL_VALUES.has(before.value)
    ) {
      return { ...before, label: { bn } };
    }
    const fresh = freshValue(bn, taken);
    taken.add(fresh);
    return { value: fresh, label: { bn } };
  });
};

export const fromChoices = (choices: Choice[] | undefined): string =>
  (choices ?? []).map((choice) => choice.label.bn).join(", ");

export const needsChoices = (step: Step): boolean =>
  step.effect?.kind === "observation" ||
  (step.effect === undefined && step.evidence[0]?.type === "choice");

export const needsUnit = (type: EvidenceType): boolean => type === "number";

/** The effects whose Step asks a fixed set of answers in a fixed order: shown in the editor, never changed there. */
const FIXED_ANSWERS: ReadonlySet<StepEffect["kind"]> = new Set<
  StepEffect["kind"]
>([...SHAPED, ...ONCE_WITH_A_NOTE]);

/** Whether a Step's answers are its effect's own, fixed in kind and order. */
export const answersFixed = (step: Pick<Step, "effect">): boolean =>
  step.effect !== undefined && FIXED_ANSWERS.has(step.effect.kind);

/** The answers a Step may be given besides its first: a note, or a photograph — asked when somebody wants them, not
 *  insisted on, so a photo is not demanded of every animal on the round. */
export const ADDABLE_ANSWERS = ["note", "photo"] as const;

export const withAnswerAdded = (
  step: Step,
  type: (typeof ADDABLE_ANSWERS)[number]
): Step => ({
  ...step,
  evidence: [...step.evidence, { type, required: false }],
});

/** The Step with one of its answers after the first put right. */
export const withAnswerAt = (
  step: Step,
  at: number,
  answer: Evidence
): Step => ({
  ...step,
  evidence: step.evidence.map((one, index) => (index === at ? answer : one)),
});

/** The Step without one of its answers after the first; the first is what the Step records, and stays. */
export const withoutAnswer = (step: Step, at: number): Step =>
  at === 0
    ? step
    : { ...step, evidence: step.evidence.filter((_, index) => index !== at) };

/** An answer's label rewritten: none at all when emptied, rather than a label of no words the phone would show. */
export const withLabel = (answer: Evidence, bn: string): Evidence => {
  const { label, ...rest } = answer;
  return bn.trim() === "" ? rest : { ...rest, label: reworded(label, bn) };
};
