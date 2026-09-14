/* oxlint-disable no-await-in-loop */
import type { Herd } from "./herd";
import { dailyYield } from "./herd";
import type { PlaybookKey } from "./playbook";
import type { ApiClient } from "./runtime";
import { DAY, addDays, onFarm } from "./runtime";
import type { Farm, PersonKey } from "./standing";

const MINUTE = 60_000;

type Board = Awaited<ReturnType<ApiClient["instances"]["get"]>>;
type StepOf = Board["content"]["steps"][number];
type AnimalOf = Board["animals"][number];

/** What one Step is answered with: the Evidence, or why it was skipped, and anything that travels beside it. */
export interface Answer {
  evidence?: (string | number | boolean)[];
  skipReason?: string;
  feeding?: { feedItemId: string; givenKg: number; leftoverKg?: number }[];
  counts?: { feedItemId: string; counted: number; reason?: string }[];
}

export interface WorkContext {
  farm: Farm;
  herd: Herd;
  day: string;
  board: Board;
  /** What earlier Steps of this same work came to — the tank reading is the sum of the cows' bulk milk. */
  tally: { bulkLitres: number };
}

export type Responder = (
  step: StepOf,
  beast: AnimalOf | null,
  work: WorkContext
) => Answer | null;

/** Who does each piece of the Playbook, and who signs it off. */
const CREW: Record<PlaybookKey, { worker: PersonKey; checker?: PersonKey }> = {
  morningMilking: { worker: "milker", checker: "manager" },
  eveningMilking: { worker: "milker", checker: "manager" },
  feeding: { worker: "feeder", checker: "manager" },
  healthRound: { worker: "stockman", checker: "manager" },
  insemination: { worker: "manager" },
  pregnancyCheck: { worker: "vet" },
  dryOff: { worker: "stockman", checker: "manager" },
  calvingPrep: { worker: "stockman" },
  calvingRecord: { worker: "milker", checker: "manager" },
  weighIn: { worker: "stockman", checker: "manager" },
  fmdVaccination: { worker: "stockman", checker: "vet" },
  lsdVaccination: { worker: "stockman", checker: "vet" },
  deworming: { worker: "stockman", checker: "vet" },
  treatmentDose: { worker: "stockman", checker: "manager" },
  burial: { worker: "stockman", checker: "manager" },
  dlsReport: { worker: "manager" },
  stockCount: { worker: "manager" },
  biosecurity: { worker: "manager" },
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** The responders the day's work is answered with, one per Playbook entry the seed knows how to do. */
export const RESPONDERS: Partial<Record<PlaybookKey, Responder>> = {};

const milking =
  (share: number): Responder =>
  (step, beast, { farm, herd, day, tally }) => {
    if (step.id === "udder") {
      return { evidence: [true] };
    }
    if (step.id === "tank") {
      // Now and then the tank is read wrong or a bucket goes in uncounted, and the Manager's queue has something in it.
      const misread = farm.random.chance(0.02);
      const reading =
        tally.bulkLitres *
        (misread
          ? farm.random.between(1.08, 1.12)
          : farm.random.between(0.985, 1.015));
      return { evidence: [round1(reading)] };
    }
    const cow = beast ? herd.cows.get(beast.tagNumber) : undefined;
    const litres = cow ? dailyYield(cow, day) * share : 0;
    if (!cow || litres <= 0.5) {
      return { skipReason: "অসুস্থ" };
    }
    if (farm.random.chance(0.004)) {
      return { skipReason: "লাথি মারছে, দোহন করা যায়নি" };
    }
    return { evidence: [round1(litres * farm.random.between(0.9, 1.1))] };
  };
RESPONDERS.morningMilking = milking(0.56);
RESPONDERS.eveningMilking = milking(0.44);

RESPONDERS.feeding = (step, _beast, { farm, board }) => {
  if (step.id === "water") {
    return { evidence: [true] };
  }
  const items = board.feeding?.items ?? [];
  return {
    evidence: [true],
    feeding: items.map((item) => {
      const given = Math.max(
        0,
        Number(item.quantity) * farm.random.between(0.96, 1.04)
      );
      return {
        feedItemId: item.feedItemId,
        givenKg: round1(given),
        leftoverKg: round1(given * farm.random.between(0, 0.06)),
      };
    }),
  };
};

RESPONDERS.biosecurity = (step, _beast, { farm }) =>
  step.id === "visitors"
    ? { evidence: [farm.random.int(0, 5)] }
    : { evidence: [true] };

const STAFF: PersonKey[] = ["milker", "stockman", "feeder"];

/** The person named for the work if the Pen is theirs; otherwise whichever Staff member works that Pen. */
const whoWorks = (
  farm: Farm,
  named: PersonKey,
  penId: string | null
): PersonKey => {
  const crew = farm.crews[named];
  if (!(crew && penId) || crew.has(penId)) {
    return named;
  }
  return STAFF.find((key) => farm.crews[key]?.has(penId)) ?? named;
};

const keyOf = (farm: Farm, definitionId: string): PlaybookKey | null =>
  (Object.entries(farm.sops).find(([, id]) => id === definitionId)?.[0] as
    | PlaybookKey
    | undefined) ?? null;

/** One Step answered for everything it asks about — once, or every animal in the Pen, going round again for any that
 *  came in while the work was open (a calf born during the round). */
const answerTheStep = async ({
  api,
  instanceId,
  step,
  work,
  respond,
  pace,
}: {
  api: ApiClient;
  instanceId: string;
  step: StepOf;
  work: WorkContext;
  respond: Responder;
  pace: { at: number };
}) => {
  const { farm, board } = work;
  const answered = new Set<string>();
  let subjects: (AnimalOf | null)[] = step.repeatPerAnimal
    ? board.animals
    : [null];
  for (let pass = 0; pass < 3 && subjects.length > 0; pass += 1) {
    for (const beast of subjects) {
      answered.add(beast?.tagNumber ?? "");
      const answer = respond(step, beast, work);
      if (!answer) {
        continue;
      }
      pace.at += farm.random.int(20, 70) * 1000;
      farm.clock.set(new Date(pace.at));
      const recorded = await api.instances.completeStep({
        instanceId,
        stepId: step.id,
        animalTag: beast?.tagNumber,
        evidence: answer.evidence ?? [],
        skipReason: answer.skipReason,
        feeding: answer.feeding,
        counts: answer.counts,
      });
      const effect = recorded.effect as {
        kind?: string;
        destination?: string;
      } | null;
      if (effect?.kind === "milk_record" && effect.destination === "bulk") {
        work.tally.bulkLitres += Number(answer.evidence?.[0] ?? 0);
      }
    }
    if (!step.repeatPerAnimal) {
      return;
    }
    const again = await api.instances.get({ id: instanceId });
    subjects = again.animals.filter((beast) => !answered.has(beast.tagNumber));
  }
};

/**
 * One piece of work done start to finish by the person whose it is: claimed, every Step answered in order at a
 * believable pace, finished, and signed off a while later by whoever checks it.
 */
export const doTheWork = async (
  farm: Farm,
  herd: Herd,
  instance: {
    id: string;
    definitionId: string;
    dueAt: Date;
    penId: string | null;
  },
  { day, signOff }: { day: string; signOff: boolean }
): Promise<"done" | "unknown"> => {
  const key = keyOf(farm, instance.definitionId);
  const respond = key ? RESPONDERS[key] : undefined;
  if (!(key && respond)) {
    return "unknown";
  }
  const crew = CREW[key];
  const worker = whoWorks(farm, crew.worker, instance.penId);
  const api = farm.as[worker];
  const at = instance.dueAt.getTime() + farm.random.int(3, 25) * MINUTE;
  farm.clock.set(new Date(at));
  await api.instances.claim({ id: instance.id });
  const board = await api.instances.get({ id: instance.id });
  const work: WorkContext = {
    farm,
    herd,
    day,
    board,
    tally: { bulkLitres: 0 },
  };

  const pace = { at };
  for (const step of board.content.steps) {
    await answerTheStep({
      api,
      instanceId: instance.id,
      step,
      work,
      respond,
      pace,
    });
  }
  const finishedAt = pace.at + 2 * MINUTE;
  farm.clock.set(new Date(finishedAt));
  await api.instances.complete({ id: instance.id });

  if (signOff && crew.checker) {
    farm.clock.set(new Date(finishedAt + farm.random.int(40, 180) * MINUTE));
    await farm.as[crew.checker].instances.approve({ id: instance.id });
  }
  return "done";
};

const dueToday = async (farm: Farm, day: string, skip: Set<string>) => {
  const from = onFarm(day, "00:00");
  const to = new Date(from.getTime() + DAY);
  const rows = await farm.db.query.sopInstance.findMany({
    where: {
      farmId: farm.farmId,
      state: { in: ["due", "in_progress"] },
      dueAt: { gte: from, lt: to },
    },
    columns: { id: true, definitionId: true, dueAt: true, penId: true },
    orderBy: { dueAt: "asc", id: "asc" },
  });
  return rows.filter((row) => !skip.has(row.id));
};

const MISSED_REASONS = [
  "লোক কম ছিল, বিদ্যুৎ চলে যাওয়ায় সময়মতো হয়নি",
  "ঝড়-বৃষ্টির কারণে করা যায়নি",
  "দায়িত্বপ্রাপ্ত কর্মী ছুটিতে ছিলেন",
];

/** Each morning the Manager closes what was not done two days ago, with the reason — the last two days stay open,
 *  which is what the overdue list is for. */
const closeWhatWasMissed = async (farm: Farm, day: string) => {
  const before = onFarm(addDays(day, -2), "00:00");
  const missed = await farm.db.query.sopInstance.findMany({
    where: {
      farmId: farm.farmId,
      state: { in: ["due", "in_progress"] },
      dueAt: { lt: before },
    },
    columns: { id: true },
  });
  farm.clock.set(onFarm(day, "06:00"));
  for (const row of missed) {
    await farm.as.manager.instances.closeAsMissed({
      id: row.id,
      reason: farm.random.pick(MISSED_REASONS),
    });
  }
};

/** Something the farm did on a day that is not answering the Playbook: a lorry arriving, a campaign raised. */
export interface Happening {
  day: string;
  time: string;
  what: string;
  run: (farm: Farm, herd: Herd) => Promise<void>;
}

/**
 * The farm's days, one after another: every morning the work falls due, and the day goes by answering it and
 * doing whatever else happened, in the order it happened. Today stops at the real hour, so what is still to do is
 * still to do.
 */
export const liveTheDays = async (
  farm: Farm,
  herd: Herd,
  happenings: Happening[],
  report: (line: string) => void
): Promise<void> => {
  const realNow = new Date();
  for (let day = farm.start; day <= farm.today; day = addDays(day, 1)) {
    const cutoff =
      day === farm.today ? realNow : new Date(onFarm(day, "23:59"));
    // Yesterday's work goes unsigned now and then — and the last two days' sign-offs are left for the Manager.
    const signOff = day < addDays(farm.today, -1);
    const tried = new Set<string>();
    const events = happenings
      .filter((happening) => happening.day === day)
      .toSorted((a, b) => a.time.localeCompare(b.time));
    const started = Date.now();
    let done = 0;

    farm.clock.set(onFarm(day, "04:30"));
    await farm.as.manager.instances.ensureDue();
    await closeWhatWasMissed(farm, day);

    for (;;) {
      const pending = await dueToday(farm, day, tried);
      const [nextWork] = pending;
      const [nextEvent] = events;
      const workAt = nextWork?.dueAt.getTime() ?? Number.POSITIVE_INFINITY;
      const eventAt = nextEvent
        ? onFarm(day, nextEvent.time).getTime()
        : Number.POSITIVE_INFINITY;
      const at = Math.min(workAt, eventAt);
      if (!Number.isFinite(at) || at > cutoff.getTime()) {
        break;
      }
      if (nextEvent && eventAt <= workAt) {
        events.shift();
        farm.clock.set(new Date(eventAt));
        await nextEvent.run(farm, herd);
        farm.clock.set(new Date(eventAt + MINUTE));
        await farm.as.manager.instances.ensureDue();
        continue;
      }
      if (!nextWork) {
        break;
      }
      tried.add(nextWork.id);
      // Now and then a piece of work is not done at all, and waits for the Manager on the overdue list.
      if (farm.random.chance(0.012)) {
        continue;
      }
      const outcome = await doTheWork(farm, herd, nextWork, { day, signOff });
      for (const followUp of herd.followUps.splice(0)) {
        await followUp();
      }
      if (outcome === "done") {
        done += 1;
        farm.clock.set(
          new Date(
            Math.max(farm.clock.now().getTime(), nextWork.dueAt.getTime())
          )
        );
        await farm.as.manager.instances.ensureDue();
      }
    }
    report(
      `${day}: ${done} pieces of work in ${Math.round((Date.now() - started) / 100) / 10}s`
    );
  }
};
