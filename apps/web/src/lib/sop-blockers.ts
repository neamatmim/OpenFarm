import type { MessageKey, MessageParams } from "@OpenFarm/i18n";

type Translate = (key: MessageKey, params?: MessageParams) => string;

const STEP = /^steps\[(?<index>\d+)\]/u;

/** The box in a Step a problem is in, by the end of its path. */
const STEP_BOXES: readonly [RegExp, MessageKey][] = [
  [/\.unit/u, "sop.unit"],
  [/\.choices/u, "sop.choices"],
  [/\.skipReasons/u, "sop.skipReasons"],
  [/\.effect/u, "sop.effect"],
  [/\.evidence/u, "sop.evidence"],
  [/\.text/u, "sop.stepText"],
];

/** The box in what raises the work a problem is in. */
const TRIGGER_BOXES: readonly [RegExp, MessageKey][] = [
  [/\.times/u, "sop.times"],
  [/\.offsetDays/u, "sop.trigger.after"],
];

/** Where in the procedure a problem is, as the editor names its parts: a Step by its number and the box in it, the
 *  times, the name — "Step 2 — Unit" rather than "Step 2", which left the Owner looking at the wrong box. */
const whereOf = (path: string, t: Translate): string => {
  const step = STEP.exec(path)?.groups?.index;
  if (step !== undefined) {
    const named = t("sop.stepNumber", { number: Number(step) + 1 });
    const box = STEP_BOXES.find(([pattern]) => pattern.test(path))?.[1];
    return box ? `${named} — ${t(box)}` : named;
  }
  if (path.startsWith("triggers")) {
    const box = TRIGGER_BOXES.find(([pattern]) => pattern.test(path))?.[1];
    return box ? `${t("sop.triggers")} — ${t(box)}` : t("sop.triggers");
  }
  const parts: Record<string, MessageKey> = {
    name: "sop.name",
    purpose: "sop.purpose",
    assignedRole: "sop.assignedRole",
    checkerRole: "sop.assignedRole",
    graceMinutes: "sop.grace",
  };
  const part = Object.entries(parts).find(([start]) => path.startsWith(start));
  return part ? t(part[1]) : t("sop.blocker.whole");
};

/** What a problem says, word for word, and the farm's words for it. */
const SAID: Readonly<Record<string, MessageKey>> = {
  "Bangla is required": "sop.problem.bangla",
  "an SOP needs at least one step": "sop.blocker.noSteps",
  "a step needs at least one kind of evidence": "sop.problem.noEvidence",
  "the range runs backwards": "sop.problem.rangeBackwards",
  "a choice needs something to choose": "sop.problem.noChoices",
  "two choices share one value": "sop.problem.sameValue",
  "this step records a figure and asks for none": "sop.problem.needsFigure",
  "this step moves an animal and offers no pen to move her to":
    "sop.problem.noPen",
  "this step records what was seen and offers nothing to choose":
    "sop.problem.nothingToSee",
  "a weaning step names the fattening pen a weaned bull calf goes to":
    "sop.problem.weanPen",
  "a step that doses every animal in the pen has to say which product":
    "sop.problem.doseProduct",
  "a dose of a prescription is the prescription's to name, not this step's":
    "sop.problem.prescriptionNames",
  "a prescription raises one dose at a time, and no step here records giving one":
    "sop.problem.prescriptionNeedsDose",
  "a step here gives a dose somebody prescribed, and nothing but a prescription raises one":
    "sop.problem.prescriptionOnly",
  "this report is raised by a notifiable diagnosis, and no step here records delivering it":
    "sop.problem.reportNeedsStep",
  "a step here records a report delivered, and nothing but a notifiable diagnosis raises one":
    "sop.problem.notifiableOnly",
  "a procedure gives one dose, and this one gives more than one":
    "sop.problem.oneDose",
  "a procedure reports one disease, and this one reports more than one":
    "sop.problem.oneDisease",
  "a Lot Number belongs to a Campaign, and this procedure doses no Pen":
    "sop.problem.lotNoCampaign",
  "the Campaign's Lot Number is asked before the doses it numbers":
    "sop.problem.lotFirst",
  "a Campaign asks for its Lot Number once, and this one asks more than once":
    "sop.problem.lotOnce",
  "work about the whole farm is about no animal, so the step is walked once":
    "sop.problem.wholeFarmOnce",
  "work about the whole farm is in no Pen, and cannot write a Pen's or an animal's record":
    "sop.problem.wholeFarmNoPen",
  "work about the whole farm is raised by the clock, not by something that happened in a Pen":
    "sop.problem.wholeFarmClock",
  "a schedule needs at least one time": "sop.problem.needsTime",
  "say which day of the week it falls on": "sop.problem.whichDay",
  "a monthly schedule is not also fortnightly":
    "sop.problem.monthlyNotFortnightly",
  "count whole days, from none upwards": "sop.problem.wholeDays",
  "a heat's work falls due in the farm's AI window, not days later":
    "sop.problem.heatTimed",
  "a service's work falls due the farm's days to a pregnancy check after it, not a number set here":
    "sop.problem.serviceTimed",
  "a procedure that records a pregnancy check is raised by a service, and by nothing else":
    "sop.problem.pregnancyByService",
  "grace is whole minutes, at most a day": "sop.problem.grace",
  "a procedure that records a service is the Manager's":
    "sop.problem.whoseService",
  "a procedure that counts the store is the Manager's":
    "sop.problem.whoseStore",
  "a procedure that counts the medicine is the Manager's":
    "sop.problem.whoseMedicine",
  "a procedure that counts the cash is a Manager's or the Owner's":
    "sop.problem.whoseCash",
  "a procedure that renews the Registration is the Owner's":
    "sop.problem.whoseRenewal",
  "a procedure that records a calving is Barn Staff's or the Manager's":
    "sop.problem.whoseCalving",
  "a procedure that records a pregnancy check is the Vet's":
    "sop.problem.whosePregnancy",
  "the report to DLS is the Manager's to take, or the Owner's":
    "sop.problem.whoseReport",
};

/** Problems that carry what was typed: the word read back in the farm's words, the typed thing quoted. */
const QUOTED: readonly [RegExp, MessageKey][] = [
  [/^"(?<value>.*)" is not a time of day$/u, "sop.problem.notATime"],
  [/^"(?<value>.*)" is not a day of the week$/u, "sop.problem.notADay"],
  [
    /^"(?<value>.*)" is not a State an animal on the farm is in$/u,
    "sop.problem.notAState",
  ],
  [
    /^"(?<value>.*)" is not a lead the farm keeps before a calving$/u,
    "sop.problem.notALead",
  ],
  [
    /^the farm does not record "(?<value>.*)" happening$/u,
    "sop.problem.notAnEvent",
  ],
  [
    /^"(?<value>.*)" is already the id of an earlier step$/u,
    "sop.problem.sameId",
  ],
  [
    /^(?<value>\d+) days is as far ahead as work may be hung$/u,
    "sop.problem.tooFarAhead",
  ],
];

/** The families of problems said one way: done once and not animal by animal, or the other way round, and a shaped
 *  Step whose answers are not the ones its kind asks. */
const FAMILIES: readonly [RegExp, MessageKey][] = [
  [
    /once, not once per animal|once for the session|so this step runs once|not walked animal by animal/u,
    "sop.problem.once",
  ],
  [
    /one at a time|per animal|walked animal by animal/u,
    "sop.problem.perAnimal",
  ],
  [
    /^(?:a service step|a calving step|a pregnancy check first asks|this step records the (?:reference|Lot Number))/u,
    "sop.problem.shape",
  ],
];

/** What a problem the farm finds says, in the farm's words, with what was typed; nothing for one it has no words for. */
export const problemSaid = (problem: string, t: Translate): string | null => {
  const word = SAID[problem];
  if (word) {
    return t(word);
  }
  for (const [pattern, key] of QUOTED) {
    const value = pattern.exec(problem)?.groups?.value;
    if (value !== undefined) {
      // A count of days is a figure, said in the reader's digits; anything else is quoted as it was typed.
      return t(key, {
        value: key === "sop.problem.tooFarAhead" ? Number(value) : value,
      });
    }
  }
  const family = FAMILIES.find(([pattern]) => pattern.test(problem))?.[1];
  return family ? t(family) : null;
};

/** The Step a problem is in, counted from 0, for the line that takes the Owner to it; nothing for the rest. */
export const blockerStep = (blocker: string): number | null => {
  const index = STEP.exec(blocker)?.groups?.index;
  return index === undefined ? null : Number(index);
};

/**
 * What stops a procedure being published, as the editor says it: which box, and what is wrong with it, in the reader's
 * words — the problems the farm finds are written for developers, a path and English. "Step 1: write it in Bangla"
 * left the Owner looking at Bangla Step words while the unit box was the empty one.
 */
export const blockerSaid = (blocker: string, t: Translate): string => {
  const [path = "", ...rest] = blocker.split(": ");
  const problem = rest.join(": ");
  if (path === "steps" && problem === "an SOP needs at least one step") {
    return t("sop.blocker.noSteps");
  }
  const what = problemSaid(problem, t) ?? t("sop.problem.other");
  return t("sop.blocker.said", { where: whereOf(path, t), what });
};
