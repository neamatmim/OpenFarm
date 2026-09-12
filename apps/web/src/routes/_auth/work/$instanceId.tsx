import type {
  Evidence,
  MilkDestination,
  SopChange,
  SopContent,
  Step,
} from "@OpenFarm/domain";
import { MILK_DESTINATIONS, isClosingStep } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, Check, Lock, SprayCan } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AnimalPhoto } from "@/components/animal-photo";
import { useLanguage } from "@/i18n/language-provider";
import { refusalMessage, wordedRefusal } from "@/lib/correction-refusal";
import { cachedHerd, cachedWithdrawal } from "@/lib/herd-cache";
import { shrink } from "@/lib/photo";
import type { StepRecord } from "@/lib/record-offline";
import {
  claimInstance,
  finishInstance,
  recordStep,
} from "@/lib/record-offline";
import { orpc } from "@/utils/orpc";

interface Animal {
  id: string;
  tagNumber: string;
  photoUpdatedAt: Date | null;
  /** Her milk cannot go to the tank: the tile locks and the sheet offers Discard only. */
  underMilkWithdrawal: boolean;
}

/**
 * The letter this work exists to deliver, fetched when the Manager asks for it.
 *
 * Written from what the farm already knows, so there is nothing to fill in — the job is to take
 * it to the office and come back with the reference. Asking for it is recorded, because a letter
 * that went is the farm's evidence.
 */
const TheLetter = ({
  report,
}: {
  report: { diagnosisId: string; reference: string | null };
}) => {
  const { t } = useLanguage();
  const letter = useMutation(
    orpc.notifiable.letter.mutationOptions({
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <section
      className="space-y-2 rounded-xl border p-3 text-sm"
      id="dls-letter"
    >
      {/* One page, and only the letter on it: printing the work board with it would send the
          office a page of step tiles. The same shape as the SOP card's. */}
      <style>{`@page { size: A4; margin: 20mm }
        @media print {
          body * { visibility: hidden }
          #dls-letter, #dls-letter * { visibility: visible }
          #dls-letter { position: absolute; inset: 0; border: 0 }
          .no-print { display: none }
          body { font-size: 12pt }
        }`}</style>
      <div className="no-print flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{t("notifiable.letterTitle")}</h2>
        {report.reference ? (
          <span className="text-muted-foreground text-xs">
            {report.reference}
          </span>
        ) : null}
      </div>
      {letter.data ? (
        // Pre-formatted, because it is a letter: the line breaks are the document.
        <pre className="overflow-x-auto font-sans text-sm whitespace-pre-wrap">
          {letter.data.text}
        </pre>
      ) : (
        <Button
          className="no-print"
          onClick={() => letter.mutate({ diagnosisId: report.diagnosisId })}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("notifiable.letter")}
        </Button>
      )}
      {letter.data ? (
        <Button
          className="no-print"
          onClick={() => window.print()}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("common.print")}
        </Button>
      ) : null}
    </section>
  );
};

/** What the server's effect decided, shown back to the person who recorded it — the tank
 *  reading against what the cows account for, and whether that needs the Manager. */
interface BulkOutcome {
  differenceLitres: number;
  flagged: boolean;
}
interface Completion {
  id: string;
  stepId: string;
  animalId: string | null;
  status: string;
  skipReason: string | null;
}

const outOfRangeOf = (
  evidence: Evidence | undefined,
  value: number
): string | null => {
  if (!evidence) {
    return null;
  }
  if (evidence.min !== undefined && value < evidence.min) {
    return `below ${evidence.min}`;
  }
  if (evidence.max !== undefined && value > evidence.max) {
    return `above ${evidence.max}`;
  }
  return null;
};

/** The pen board: chips for the Steps that happen once, the Pen's animals as photo tiles in
 *  any order, and the closing Step only when everything else is done. */
const WorkPage = () => {
  const { instanceId } = Route.useParams();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [openAnimal, setOpenAnimal] = useState<Animal | null>(null);
  const [openStep, setOpenStep] = useState<Step | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);

  const instance = useQuery(
    orpc.instances.get.queryOptions({ input: { id: instanceId } })
  );
  // What this phone last knew of the herd. With no signal the board still has to say which
  // cow may not go to the tank: a shed with no bars is exactly where that mistake is made.
  const herd = useQuery({
    queryKey: ["herd-cache"],
    queryFn: () => cachedHerd(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.instances.key() });
  const onError = (error: Error) =>
    toast.error(
      refusalMessage(error, t) ??
        wordedRefusal(error, t) ??
        error.message ??
        t("common.error")
    );

  const instanceKey = orpc.instances.get.queryKey({
    input: { id: instanceId },
  });
  const claim = useMutation({
    mutationFn: () => claimInstance(queryClient, instanceKey, instanceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["outbox"] });
    },
    onError,
  });
  /**
   * Recording goes into the Outbox and onto the screen, in that order, and the farm hears
   * about it when there is signal. A milker in a shed cannot wait for a round trip that may
   * not be possible for hours (ADR 0002).
   */
  const record = useMutation({
    mutationFn: (entry: StepRecord) =>
      recordStep(queryClient, instanceKey, entry),
    onSuccess: () => {
      setOpenAnimal(null);
      setOpenStep(null);
      // Not a refresh: the screen already shows what was recorded, and refetching now would
      // ask the farm about work it has not been told of yet.
      void queryClient.invalidateQueries({ queryKey: ["outbox"] });
    },
    onError,
  });
  const correct = useMutation(
    orpc.instances.correctStep.mutationOptions({
      onSuccess: ({ effect, needsReview }) => {
        setOutcome(effect?.kind === "bulk_total" ? effect : null);
        if (needsReview) {
          toast.warning(t("review.corrected_after_sign_off"));
        }
        setOpenAnimal(null);
        setOpenStep(null);
        refresh();
      },
      onError,
    })
  );
  const finish = useMutation({
    mutationFn: () => finishInstance(queryClient, instanceKey, instanceId),
    onSuccess: () => {
      toast.success(t("work.finished"));
      navigate({ to: "/today" });
    },
    onError,
  });

  if (!instance.data) {
    return <p className="p-6">{t("common.loading")}</p>;
  }

  const {
    content,
    animals: fromFarm,
    completions,
    state,
    feeding,
    fed,
    changed,
    runningOn,
  } = instance.data as unknown as {
    content: SopContent;
    animals: Animal[];
    completions: Completion[];
    state: string;
    /** What this Pen is owed this session, for a Playbook entry that feeds. */
    feeding: {
      items: {
        feedItemId: string;
        nameBn: string;
        unit: string;
        quantity: number;
      }[];
    } | null;
    /** What the Pen was actually given, once somebody has recorded it. */
    fed: { shortfallPercent: number; flaggedAt: string | null } | null;
    /** What changed in the Version this work runs on, until they have done it once. */
    changed: Changed | null;
    /** The Version number this work runs on, when the Playbook has since moved on. */
    runningOn: number | null;
  };
  // The Gate the tile renders comes from whichever the phone has: what the farm said this
  // time, or what it last cached. The farm decides again when the entry lands.
  const cached = new Map(
    (herd.data?.animals ?? []).map((one) => [one.id, one])
  );
  const now = new Date();
  const animals = fromFarm.map((beast) => ({
    ...beast,
    underMilkWithdrawal:
      beast.underMilkWithdrawal || cachedWithdrawal(cached.get(beast.id), now),
  }));
  const perAnimalStep = content.steps.find((step) => step.repeatPerAnimal);
  // The closing Step is the last one *and* not per-animal: a Playbook whose last Step
  // repeats per cow has no closing Step, and a one-Step SOP finishes on that Step.
  const closingStep = content.steps.find((step) =>
    isClosingStep(content, step)
  );
  // A Pen that came well under what it was owed says so where the work is, rather than
  // sitting in a record nobody reopens. The Manager's own queue is a later ticket.
  const shortFed = fed?.flaggedAt ? fed : null;

  const chipSteps = content.steps.filter(
    (step) => !step.repeatPerAnimal && step.id !== closingStep?.id
  );

  const doneFor = (stepId: string, animalId: string | null = null) =>
    completions.find((c) => c.stepId === stepId && c.animalId === animalId);

  const chipsDone = chipSteps.every((step) => doneFor(step.id));
  const animalsDone = perAnimalStep
    ? animals.every((beast) => doneFor(perAnimalStep.id, beast.id))
    : true;
  const readyToClose = chipsDone && animalsDone;

  if (state === "due") {
    return (
      <div className="mx-auto mt-10 w-full max-w-sm space-y-4 p-6 text-center">
        <h1 className="text-2xl font-bold">{content.name.bn}</h1>
        <Button className="h-14 w-full text-lg" onClick={() => claim.mutate()}>
          {t("work.claim")}
        </Button>
      </div>
    );
  }

  /** Recording a Step that already has an entry changes a recorded fact, which is a
   *  Correction: the server wants a reason and checks the Correction Window. */
  const send = (
    step: Step,
    existing: Completion | undefined,
    payload: RecordPayload,
    animalTag?: string
  ) => {
    if (existing && payload.reason) {
      // A Correction changes what was recorded; replacing the photo with it is a later
      // ticket's problem, so the one already attached stays.
      correct.mutate({
        completionId: existing.id,
        destination: payload.destination,
        feeding: payload.feeding,
        evidence: payload.evidence,
        outOfRange: payload.outOfRange,
        reason: payload.reason,
        skipReason: payload.skipReason,
      });
      return;
    }
    // The reason belongs to a Correction, which took the branch above; recording a new
    // entry has nothing to explain.
    const { reason: _forCorrections, ...rest } = payload;
    record.mutate({
      instanceId,
      stepId: step.id,
      animalTag,
      animalId: animalTag ? (openAnimal?.id ?? null) : null,
      ...rest,
    });
  };

  if (openAnimal && perAnimalStep) {
    const existing = doneFor(perAnimalStep.id, openAnimal.id);
    return (
      <EvidenceSheet
        animal={openAnimal}
        correcting={Boolean(existing)}
        key={openAnimal.id}
        onCancel={() => setOpenAnimal(null)}
        onRecord={(payload) =>
          send(perAnimalStep, existing, payload, openAnimal.tagNumber)
        }
        step={perAnimalStep}
      />
    );
  }

  if (openStep) {
    const existing = doneFor(openStep.id);
    return (
      <EvidenceSheet
        correcting={Boolean(existing)}
        feeding={feeding}
        onCancel={() => setOpenStep(null)}
        onRecord={(payload) => send(openStep, existing, payload)}
        step={openStep}
      />
    );
  }

  return (
    <div className="container mx-auto max-w-xl space-y-4 px-3 py-4">
      <header>
        <h1 className="text-xl font-bold">{content.name.bn}</h1>
        <p className="text-muted-foreground text-sm">
          {t("work.progress", {
            done: animals.filter(
              (b) => perAnimalStep && doneFor(perAnimalStep.id, b.id)
            ).length,
            total: animals.length,
          })}
        </p>
      </header>

      {instance.data.report ? (
        <TheLetter report={instance.data.report} />
      ) : null}

      {changed ? <WhatChanged changed={changed} /> : null}

      {runningOn ? (
        <p className="rounded-xl bg-neutral-800 p-3 text-sm text-neutral-200">
          {t("changed.onOlder", { number: runningOn })}
        </p>
      ) : null}

      {shortFed ? (
        <p className="rounded-xl bg-amber-900 p-3 text-sm text-amber-100">
          {t("work.shortFed", { percent: shortFed.shortfallPercent })}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {chipSteps.map((step) => {
          const done = Boolean(doneFor(step.id));
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setOpenStep(step)}
              className={`flex items-center gap-1 rounded-full px-3 py-2 text-sm ${
                done ? "bg-emerald-700" : "bg-neutral-800"
              }`}
            >
              {done ? <Check size={14} /> : <SprayCan size={14} />}{" "}
              {step.text.bn}
            </button>
          );
        })}
      </div>

      {perAnimalStep ? (
        <ul className="grid grid-cols-3 gap-3">
          {animals.map((beast) => {
            const completion = doneFor(perAnimalStep.id, beast.id);
            return (
              <li key={beast.id}>
                <button
                  type="button"
                  onClick={() => setOpenAnimal(beast)}
                  className={`relative flex w-full flex-col items-center gap-1 rounded-2xl p-3 ${
                    completion ? "bg-neutral-900 opacity-70" : "bg-neutral-800"
                  }`}
                >
                  <AnimalPhoto
                    tagNumber={beast.tagNumber}
                    photoUpdatedAt={beast.photoUpdatedAt}
                  />
                  <span className="font-bold">{beast.tagNumber}</span>
                  <span className="text-muted-foreground text-xs">
                    {completion?.status === "skipped"
                      ? completion.skipReason
                      : ""}
                  </span>
                  {beast.underMilkWithdrawal ? (
                    <span className="flex items-center gap-1 rounded-full bg-amber-900 px-2 py-0.5 text-xs text-amber-200">
                      <Lock size={12} /> {t("milk.withdrawalShort")}
                    </span>
                  ) : null}
                  {completion ? (
                    <Check
                      size={16}
                      className="absolute top-2 left-2 text-emerald-400"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {outcome ? <BulkOutcomeBanner outcome={outcome} /> : null}

      <ClosingAction
        ready={readyToClose}
        closingStep={closingStep}
        done={Boolean(closingStep && doneFor(closingStep.id))}
        pending={finish.isPending}
        onOpen={(step) => setOpenStep(step)}
        onFinish={() => finish.mutate()}
      />
    </div>
  );
};

/** "০৫:০০" rather than "05:00" for a Bangla reader: a time is digits with a colon in it. */
const inTheirDigits = (time: string, language: "bn" | "en"): string =>
  time.replaceAll(/\d/gu, (digit) => formatDigits(Number(digit), language));

/** What changed, as the board is handed it. */
interface Changed {
  from: number;
  to: number;
  changes: SopChange[];
}

/** Every kind of change has something to say. Typed by the kind rather than by string, so a
 *  new one is a compile error here rather than a blank line — or, before this was a map, a
 *  white screen on the job when the key was missing. */
const CHANGE_MESSAGE: Record<SopChange["kind"], MessageKey> = {
  step_added: "changed.step_added",
  step_removed: "changed.step_removed",
  step_reworded: "changed.step_reworded",
  step_evidence: "changed.step_evidence",
  step_skip_reasons: "changed.step_skip_reasons",
  step_per_animal: "changed.step_per_animal",
  step_effect: "changed.step_effect",
  steps_reordered: "changed.steps_reordered",
  purpose_changed: "changed.purpose_changed",
  times_changed: "changed.times_changed",
  grace_changed: "changed.grace_changed",
  who_changed: "changed.who_changed",
  checker_changed: "changed.checker_changed",
};

/**
 * What changed in this Version, the first time somebody opens work on it — in the words of
 * the job rather than as a list of fields. It stays until they have done the work once,
 * which is the farm's evidence they read it: there is no button, because a button between
 * somebody and the job is a button that gets pressed without reading (notification
 * channels, R1).
 */
const WhatChanged = ({ changed }: { changed: Changed }) => {
  const { t, language } = useLanguage();
  /** The Step's own words in the reader's language, and a Role named rather than spelled. */
  const said = (change: SopChange): Record<string, string | number> => {
    const words = (value: { bn: string; en?: string }) =>
      (language === "en" ? value.en : value.bn) ?? value.bn;
    return {
      ...("step" in change ? { step: words(change.step) } : {}),
      ...("was" in change ? { was: words(change.was) } : {}),
      ...("times" in change
        ? {
            times: change.times
              .map((at) => inTheirDigits(at, language))
              .join(", "),
          }
        : {}),
      ...("minutes" in change ? { minutes: change.minutes } : {}),
      ...("role" in change
        ? {
            role: change.role ? t(`role.${change.role}`) : t("sop.checkerNone"),
          }
        : {}),
    };
  };
  return (
    <section className="space-y-1 rounded-xl bg-sky-900 p-3 text-sky-50">
      <p className="font-medium">{t("changed.title")}</p>
      <p className="text-sm text-sky-200">
        {t("changed.versions", { from: changed.from, to: changed.to })}
      </p>
      <ul className="space-y-1 text-sm">
        {changed.changes.map((change, index) => (
          <li key={`${change.kind}-${index}`}>
            {t(CHANGE_MESSAGE[change.kind], said(change))}
          </li>
        ))}
      </ul>
    </section>
  );
};

/** What the tank reading came to. A difference beyond the farm's tolerance has already been
 *  flagged for the Manager server-side; this says so, rather than asking the person to fix
 *  it in the parlour. */
const BulkOutcomeBanner = ({ outcome }: { outcome: BulkOutcome }) => {
  const { t, language } = useLanguage();
  const litres = new Intl.NumberFormat(
    language === "bn" ? "bn-BD" : "en-GB"
  ).format(Math.abs(outcome.differenceLitres));
  return (
    <div
      className={`rounded-xl p-3 text-sm ${
        outcome.flagged ? "bg-amber-900 text-amber-100" : "bg-neutral-800"
      }`}
    >
      <p>
        {outcome.differenceLitres === 0
          ? t("milk.matched")
          : t("milk.difference", { litres })}
      </p>
      {outcome.flagged ? <p>{t("milk.flagged")}</p> : null}
    </div>
  );
};

/** The closing Step — the bulk total — appears only when every chip and tile is done. */
const ClosingAction = ({
  ready,
  closingStep,
  done,
  pending,
  onOpen,
  onFinish,
}: {
  ready: boolean;
  closingStep: Step | undefined;
  done: boolean;
  pending: boolean;
  onOpen: (step: Step) => void;
  onFinish: () => void;
}) => {
  const { t } = useLanguage();
  if (!ready) {
    return (
      <p className="text-muted-foreground text-center text-sm">
        {t("work.notFinished")}
      </p>
    );
  }
  // An SOP with no closing Step — one Step, or a last Step that repeats per animal —
  // finishes as soon as everything else is done.
  if (!(closingStep && !done)) {
    return (
      <Button
        className="h-14 w-full text-lg"
        disabled={pending}
        onClick={onFinish}
      >
        {t("work.finish")}
      </Button>
    );
  }
  return (
    <Button
      className="h-14 w-full text-lg"
      variant="outline"
      onClick={() => onOpen(closingStep)}
    >
      {closingStep.text.bn}
    </Button>
  );
};

/** What this Pen is owed, and what actually went out. Prefilled from the Ration, because a
 *  normal day is confirming figures and a sick pen is the one where somebody changes them. */
const FeedingFields = ({
  rows,
  cannotFeed,
  given,
  leftover,
  onGiven,
  onLeftover,
}: {
  rows: {
    feedItemId: string;
    nameBn: string;
    unit: string;
    quantity: number;
  }[];
  /** The phone has never seen this Pen's Ration, so it cannot say what was owed. */
  cannotFeed: boolean;
  given: Typed;
  leftover: Typed;
  onGiven: (next: (current: Typed) => Typed) => void;
  onLeftover: (next: (current: Typed) => Typed) => void;
}) => {
  const { t } = useLanguage();
  if (cannotFeed) {
    return (
      <p className="rounded-xl bg-amber-900 p-3 text-amber-100">
        {t("work.noRation")}
      </p>
    );
  }
  return (
    <>
      {rows.map((line) => (
        <div className="space-y-2" key={line.feedItemId}>
          <p className="text-sm">
            {line.nameBn} · {t("feed.target")}: {line.quantity} {line.unit}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label={`${line.nameBn} ${t("work.given")}`}
              className="h-14 text-lg"
              inputMode="decimal"
              onChange={(event) =>
                onGiven((current) => ({
                  ...current,
                  [line.feedItemId]: event.target.value,
                }))
              }
              placeholder={t("work.given")}
              type="number"
              value={given[line.feedItemId] ?? String(line.quantity)}
            />
            <Input
              aria-label={`${line.nameBn} ${t("work.leftover")}`}
              className="h-14 text-lg"
              inputMode="decimal"
              onChange={(event) =>
                onLeftover((current) => ({
                  ...current,
                  [line.feedItemId]: event.target.value,
                }))
              }
              placeholder={t("work.leftover")}
              type="number"
              value={leftover[line.feedItemId] ?? ""}
            />
          </div>
        </div>
      ))}
    </>
  );
};

/** The first figure the person has entered that its Step calls odd, if any. A warning to
 *  acknowledge at the animal, never a refusal: the cow is standing there and they can see her. */
const outsideItsRange = (step: Step, values: Entered): string | null => {
  for (const [index, item] of step.evidence.entries()) {
    if (item.type !== "number") {
      continue;
    }
    const typed = Number(values[index]);
    if (!Number.isNaN(typed)) {
      const outside = outOfRangeOf(item, typed);
      if (outside) {
        return outside;
      }
    }
  }
  return null;
};

/** Has everything the Version asks for been given? A tick needs no answer to be true, and a
 *  photo is answered by the camera rather than by a value. */
const everythingAsked = (step: Step, values: Entered, photos: Taken): boolean =>
  step.evidence.every((item, index) => {
    if (!item.required || item.type === "tick") {
      return true;
    }
    if (item.type === "photo") {
      return Boolean(photos[index]);
    }
    return values[index] !== undefined && values[index] !== "";
  });

/** Skipping an animal: the Version's own reasons, and nothing typed into a free box. A
 *  Correction still has to say why, because changing a recorded fact is the person speaking. */
const SkipSheet = ({
  step,
  correcting,
  reason,
  onReason,
  onSkip,
  onBack,
}: {
  step: Step;
  correcting: boolean;
  reason: string;
  onReason: (value: string) => void;
  onSkip: (payload: RecordPayload) => void;
  onBack: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="mx-auto mt-8 w-full max-w-sm space-y-3 p-4">
      <p className="text-lg">{t("work.skipWhy")}</p>
      {correcting ? (
        <Input
          aria-label={t("correct.why")}
          onChange={(event) => onReason(event.target.value)}
          placeholder={t("correct.why")}
          value={reason}
        />
      ) : null}
      {step.skipReasons.map((skip) => (
        <Button
          className="h-14 w-full text-lg"
          disabled={correcting && !reason.trim()}
          key={skip.bn}
          onClick={() =>
            onSkip({
              evidence: [],
              skipReason: skip.bn,
              // Never the skip label standing in for a reason: changing what was recorded is
              // a Correction, and a Correction is the person saying why.
              reason: correcting ? reason.trim() : undefined,
            })
          }
          variant="outline"
        >
          {skip.bn}
        </Button>
      ))}
      <Button className="w-full" onClick={onBack} variant="ghost">
        {t("work.back")}
      </Button>
    </div>
  );
};

/** What was typed into one set of number boxes, by Feed Item. */
type Typed = Record<string, string>;

/** What has been entered against each Evidence slot the Version asks for. */
type Entered = Record<number, boolean | number | string>;

/** A picture taken against an Evidence slot, before it is queued. */
type Taken = Record<number, { contentType: "image/jpeg"; data: string }>;

/**
 * What this Pen is owed, and whether this phone can say. A phone that has never opened
 * today's work with signal has no Ration to prefill from, and recording zeros against a
 * target it does not know would put a false shortfall on the farm.
 */
const feedingState = (
  feeds: boolean,
  feeding:
    | {
        items: {
          feedItemId: string;
          nameBn: string;
          unit: string;
          quantity: number;
        }[];
      }
    | null
    | undefined
) => {
  const rows = feeds ? (feeding?.items ?? []) : [];
  return { rows, cannotFeed: feeds && rows.length === 0 };
};

/**
 * What went out, per Feed Item. A box left as it was handed over means the figure that was
 * handed over: somebody who clears one to retype it has not yet said the Pen got nothing.
 */
const whatWentOut = (
  rows: { feedItemId: string; quantity: number }[],
  given: Typed,
  leftover: Typed
) =>
  rows.map((line) => ({
    feedItemId: line.feedItemId,
    givenKg: numberOr(given[line.feedItemId], line.quantity),
    leftoverKg: numberOr(leftover[line.feedItemId], 0),
  }));

/** A field left as it was handed over means the figure that was handed over. */
const numberOr = (value: string | undefined, fallback: number): number => {
  const typed = Number(value);
  return value === undefined || value.trim() === "" || Number.isNaN(typed)
    ? fallback
    : typed;
};

interface RecordPayload {
  evidence: (boolean | number | string)[];
  skipReason?: string;
  outOfRange?: string;
  destination?: MilkDestination;
  /** What a Step that feeds a Pen actually put out, per Feed Item. */
  feeding?: { feedItemId: string; givenKg: number; leftoverKg?: number }[];
  /** One per Evidence slot that asked for a picture. */
  photos?: { slot: number; contentType: "image/jpeg"; data: string }[];
  /** Set when the entry already exists: changing a recorded fact is a Correction, and a
   *  Correction carries a reason. */
  reason?: string;
}

/** The full-screen sheet: one control per piece of Evidence the Version asks for, skip with
 *  a reason for a per-animal Step, and a warning that must be acknowledged for an odd figure. */
const EvidenceSheet = ({
  step,
  animal,
  correcting,
  feeding,
  onCancel,
  onRecord,
}: {
  step: Step;
  animal?: Animal;
  /** The entry already exists, so saving it again is a Correction. */
  correcting: boolean;
  /** What this Pen is owed this session, for a Step that feeds. */
  feeding?: {
    items: {
      feedItemId: string;
      nameBn: string;
      unit: string;
      quantity: number;
    }[];
  } | null;
  onCancel: () => void;
  onRecord: (payload: RecordPayload) => void;
}) => {
  const { t, language } = useLanguage();
  // A date and time the Step asks for starts as now: it is changed only when the thing happened
  // earlier than it is being written down, which is the exception and not the rule.
  const [values, setValues] = useState<Entered>(() =>
    Object.fromEntries(
      step.evidence.flatMap((item, index) =>
        item.type === "datetime" ? [[index, new Date().toISOString()]] : []
      )
    )
  );
  const [skipping, setSkipping] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Taken>({});
  const [reason, setReason] = useState("");
  // A cow under Withdrawal has no choice to make. The server decides again when the entry
  // lands — this phone may have been offline since before she was treated.
  const locked = Boolean(animal?.underMilkWithdrawal);
  const [destination, setDestination] = useState<MilkDestination>(
    locked ? "discard" : "bulk"
  );
  const recordsMilk = step.effect?.kind === "milk_record";
  const feedsThePen = step.effect?.kind === "feeding";
  const [given, setGiven] = useState<Typed>({});
  const [leftover, setLeftover] = useState<Typed>({});

  const { rows: feedingRows, cannotFeed } = feedingState(feedsThePen, feeding);

  const setValue = (index: number, value: boolean | number | string) => {
    setValues((current) => ({ ...current, [index]: value }));
    setWarning(null);
  };

  const assembled = step.evidence.map((item, index) => {
    if (item.type === "tick") {
      return true;
    }
    return values[index] ?? "";
  });

  const firstOutOfRange = () => outsideItsRange(step, values);
  const ready = everythingAsked(step, values, photos);

  const submit = (force: boolean) => {
    const outside = firstOutOfRange();
    if (outside && !force) {
      setWarning(outside);
      return;
    }
    onRecord({
      evidence: assembled.map((value, index) =>
        step.evidence[index]?.type === "number" ? Number(value) : value
      ),
      outOfRange: outside ?? undefined,
      destination: recordsMilk ? destination : undefined,
      feeding: feedsThePen
        ? whatWentOut(feedingRows, given, leftover)
        : undefined,
      photos: Object.entries(photos).map(([slot, taken]) => ({
        slot: Number(slot),
        ...taken,
      })),
      reason: correcting ? reason.trim() : undefined,
    });
  };

  if (skipping) {
    return (
      <SkipSheet
        correcting={correcting}
        onBack={() => setSkipping(false)}
        onReason={setReason}
        onSkip={onRecord}
        reason={reason}
        step={step}
      />
    );
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-sm space-y-4 p-4">
      <header className="flex items-center gap-3">
        {animal ? (
          <AnimalPhoto
            tagNumber={animal.tagNumber}
            photoUpdatedAt={animal.photoUpdatedAt}
            size={64}
          />
        ) : null}
        <div>
          <p className="text-2xl font-bold">
            {animal?.tagNumber ?? step.text.bn}
          </p>
          {animal ? (
            <p className="text-muted-foreground">{step.text.bn}</p>
          ) : null}
        </div>
      </header>

      {step.evidence.map((item, index) => (
        <EvidenceControl
          key={`${step.id}-${index}`}
          evidence={item}
          language={language}
          value={values[index]}
          hasPhoto={Boolean(photos[index])}
          onValue={(value) => setValue(index, value)}
          onPhoto={(taken) =>
            setPhotos((current) => ({ ...current, [index]: taken }))
          }
        />
      ))}

      {recordsMilk ? (
        <DestinationChoice
          value={destination}
          locked={locked}
          onChange={setDestination}
        />
      ) : null}

      <FeedingFields
        cannotFeed={cannotFeed}
        given={given}
        leftover={leftover}
        onGiven={setGiven}
        onLeftover={setLeftover}
        rows={feedingRows}
      />

      {correcting ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">{t("correct.why")}</p>
          <Input
            aria-label={t("correct.why")}
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </div>
      ) : null}

      {warning ? (
        <div className="space-y-2 rounded-xl border-2 border-amber-500 p-3">
          <p className="flex items-center gap-2 text-amber-300">
            <Lock size={16} /> {t("work.outOfRange")}
          </p>
          <Button className="w-full" onClick={() => submit(true)}>
            {t("work.keepAnyway")}
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Button variant="ghost" className="h-14" onClick={onCancel}>
          {t("work.back")}
        </Button>
        {step.repeatPerAnimal ? (
          <Button
            variant="outline"
            className="h-14"
            onClick={() => setSkipping(true)}
          >
            {t("work.skip")}
          </Button>
        ) : null}
        <Button
          className={`h-14 text-lg ${step.repeatPerAnimal ? "" : "col-span-2"}`}
          disabled={cannotFeed || !(ready && (!correcting || reason.trim()))}
          onClick={() => submit(false)}
        >
          {correcting ? t("correct.save") : t("work.confirm")}
        </Button>
      </div>
    </div>
  );
};

/** Where the milk goes. Three buttons, because that is the whole vocabulary — and none at
 *  all when a Withdrawal has already decided it. */
const DestinationChoice = ({
  value,
  locked,
  onChange,
}: {
  value: MilkDestination;
  locked: boolean;
  onChange: (next: MilkDestination) => void;
}) => {
  const { t } = useLanguage();
  if (locked) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-amber-900 p-3 text-amber-100">
        <Lock size={16} /> {t("milk.withdrawal")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">{t("milk.destination")}</p>
      <div className="grid grid-cols-3 gap-2">
        {MILK_DESTINATIONS.map((option) => (
          <Button
            key={option}
            variant={value === option ? "default" : "outline"}
            className="h-12"
            onClick={() => onChange(option)}
          >
            {t(`milk.${option}`)}
          </Button>
        ))}
      </div>
    </div>
  );
};

/** One piece of Evidence: a big number pad, a note, a choice, or the camera. A tick needs no
 *  control — confirming the Step is the tick. */
/** An instant as a `datetime-local` field holds it: the phone's own day and minute, no zone. */
const asLocalField = (value: boolean | number | string | undefined): string => {
  if (typeof value !== "string" || value === "") {
    return "";
  }
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) {
    return "";
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

const EvidenceControl = ({
  evidence,
  language,
  value,
  hasPhoto,
  onValue,
  onPhoto,
}: {
  evidence: Evidence;
  language: string;
  value: boolean | number | string | undefined;
  hasPhoto: boolean;
  onValue: (value: string) => void;
  onPhoto: (photo: { contentType: "image/jpeg"; data: string }) => void;
}) => {
  const { t } = useLanguage();

  if (evidence.type === "tick") {
    return null;
  }

  if (evidence.type === "number") {
    const typed = String(value ?? "");
    return (
      <div className="space-y-2">
        <p className="text-center text-5xl font-bold tabular-nums">
          {typed === ""
            ? "০"
            : new Intl.NumberFormat(
                language === "bn" ? "bn-BD" : "en-GB"
              ).format(Number(typed))}{" "}
          <span className="text-xl">{evidence.unit?.bn}</span>
        </p>
        <Input
          inputMode="decimal"
          value={typed}
          onChange={(event) =>
            onValue(event.target.value.replaceAll(/[^\d.]/gu, ""))
          }
          className="text-center text-2xl"
          aria-label={evidence.unit?.bn ?? t("work.confirm")}
        />
      </div>
    );
  }

  if (evidence.type === "choice") {
    return (
      <div className="flex flex-wrap gap-2">
        {(evidence.choices ?? []).map((choice) => (
          <Button
            key={choice.value}
            variant={value === choice.value ? "default" : "outline"}
            className="h-12"
            onClick={() => onValue(choice.value)}
          >
            {choice.label.bn}
          </Button>
        ))}
      </div>
    );
  }

  if (evidence.type === "datetime") {
    return (
      <Input
        aria-label={t("work.when")}
        // The field speaks the phone's own clock, which on this farm is the farm's; what is kept
        // is the instant, so a phone set a zone away still records the right moment.
        onChange={(event) =>
          onValue(
            event.target.value === ""
              ? ""
              : new Date(event.target.value).toISOString()
          )
        }
        type="datetime-local"
        value={asLocalField(value)}
      />
    );
  }

  if (evidence.type === "note") {
    return (
      <Input
        value={String(value ?? "")}
        onChange={(event) => onValue(event.target.value)}
        placeholder={t("work.note")}
        aria-label={t("work.note")}
      />
    );
  }

  return (
    <label className="flex items-center gap-2 rounded-xl bg-neutral-800 p-3 text-base">
      <Camera size={20} /> {hasPhoto ? t("work.saved") : t("work.photo")}
      <input
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          try {
            // Shrunk here, on the device. A camera makes three or four megabytes; a
            // morning of those would sit in the Outbox and time out on every attempt.
            onPhoto(await shrink(file));
          } catch (error) {
            toast.error((error as Error).message || t("common.error"));
          }
        }}
        type="file"
      />
    </label>
  );
};

export const Route = createFileRoute("/_auth/work/$instanceId")({
  component: WorkPage,
});
