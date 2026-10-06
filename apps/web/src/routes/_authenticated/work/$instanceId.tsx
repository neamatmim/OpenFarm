import type { Step } from "@OpenFarm/domain";
import {
  isClosingStep,
  isFinished,
  isOneTap,
  nothingToNoteOf,
} from "@OpenFarm/domain";
import { buttonVariants } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ClipboardList } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AssignWork } from "@/components/assign-work";
import { Page } from "@/components/page";
import { EvidenceSheet } from "@/components/work/evidence-sheet";
import { PassTheRestWell } from "@/components/work/pass-the-rest-well";
import {
  SopName,
  BackToToday,
  PlaceLine,
  AboutHerLines,
  useHeldByOther,
  ClaimOrWhose,
  HeldByNotice,
  BoardFoot,
  BoardPart,
  NextAnimal,
  roundOf,
  nextInRound,
  everythingRecorded,
  WorkHeader,
  StepRow,
  AnimalTile,
  ClosingAction,
} from "@/components/work/work-board";
import {
  DosesOwedBeforeRelease,
  WhatRaisedIt,
  WorkNotShown,
  WhatChanged,
  BulkOutcomeBanner,
  WorkNotices,
} from "@/components/work/work-notices";
import type {
  Animal,
  Completion,
  BulkOutcome,
} from "@/components/work/work-types";
import { isClosed, finishedWord } from "@/components/work/work-types";
import { useLanguage } from "@/i18n/language-provider";
import {
  correctionRefusalMessage,
  isChangedSince,
} from "@/lib/correction-refusal";
import { cachedWithdrawal, herdCacheQuery } from "@/lib/herd-cache";
import type { StepRecord } from "@/lib/record-offline";
import {
  claimInstance,
  finishInstance,
  recordStep,
} from "@/lib/record-offline";
import { refreshTheScreen } from "@/lib/refresh";
import type { StepAnswer } from "@/lib/step-answer";
import { journeyOf } from "@/lib/step-answer";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** Work opened by Start on the day's list is taken as it opens, once, as the Claim button would take it: not work
 *  somebody else holds, and not work already under way. */
const useClaimOnOpen = ({
  start,
  work,
  mine,
  claim,
}: {
  start: true | undefined;
  work: { state: string } | undefined;
  mine: boolean;
  claim: () => void;
}) => {
  const claimed = useRef(false);
  const state = work?.state;
  useEffect(() => {
    if (start && state === "due" && mine && !claimed.current) {
      claimed.current = true;
      claim();
    }
  }, [start, state, mine, claim]);
};

/** The pen board: chips for the Steps that happen once, the Pen's animals as photo tiles in
 *  any order, and the closing Step only when everything else is done. */
const WorkPage = () => {
  const { instanceId } = Route.useParams();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // By id, and found among the animals the board draws, so she carries the Withdrawal the phone's herd says.
  const [openAnimalId, setOpenAnimalId] = useState<string | null>(null);
  const [openStep, setOpenStep] = useState<Step | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);

  const instance = useQuery(
    orpc.work.get.queryOptions({ input: { id: instanceId } })
  );
  const someoneElse = useHeldByOther(instance.data);
  // Opened by tapping Start on the day's list: taken as it opens, as the Claim button would take it.
  const { start } = Route.useSearch();
  // What this phone last knew of the herd. With no signal the board still has to say which
  // cow may not go to the tank: a shed with no bars is exactly where that mistake is made.
  const herd = useQuery(herdCacheQuery);
  const onError = (error: Error) =>
    toast.error(
      correctionRefusalMessage(error, t) ?? error.message ?? t("common.error")
    );

  const instanceKey = orpc.work.get.queryKey({
    input: { id: instanceId },
  });
  const claim = useMutation({
    mutationFn: () => claimInstance(queryClient, instanceKey, instanceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["outbox"] });
    },
    onError,
  });
  const finish = useMutation({
    mutationFn: () => finishInstance(queryClient, instanceKey, instanceId),
    onSuccess: () => {
      toast.success(t(finishedWord(instance.data?.checkerRole)));
      navigate({ to: "/work" });
    },
    onError,
  });
  /**
   * Recording goes into the Outbox and onto the screen, in that order, and the farm hears
   * about it when there is signal. A milker in a shed cannot wait for a round trip that may
   * not be possible for hours (ADR 0002).
   */
  useClaimOnOpen({
    start,
    work: instance.data,
    mine: someoneElse === null,
    claim: claim.mutate,
  });
  const record = useMutation({
    mutationFn: (entry: StepRecord) =>
      recordStep(queryClient, instanceKey, entry),
    onSuccess: (_id, entry) => {
      // On to the next animal the round has not reached, not back to the board: a milker goes cow to cow.
      const held = queryClient.getQueryData(instanceKey);
      setOpenAnimalId(nextInRound(held, entry.animalId));
      setOpenStep(null);
      // The entry that leaves nothing undone finishes the work: a Finish of its own would be one more tap for nothing.
      if (everythingRecorded(held)) {
        finish.mutate();
      }
      // Not a refresh: the screen already shows what was recorded, and refetching now would
      // ask the farm about work it has not been told of yet.
      void queryClient.invalidateQueries({ queryKey: ["outbox"] });
    },
    onError,
  });
  const renew = useMutation(
    orpc.work.completeStep.mutationOptions({
      onSuccess: () => {
        setOpenStep(null);
      },
      onError,
    })
  );
  const correct = useMutation(
    orpc.work.correctStep.mutationOptions({
      onSuccess: ({ effect, needsReview }) => {
        setOutcome(effect?.kind === "bulk_total" ? effect : null);
        if (needsReview) {
          toast.warning(t("review.corrected_after_sign_off"));
        }
        setOpenAnimalId(null);
        setOpenStep(null);
      },
      onError: (error) => {
        onError(error);
        // Put right by somebody else since: read the work again, and start from what it says now.
        if (isChangedSince(error)) {
          setOpenAnimalId(null);
          setOpenStep(null);
          refreshTheScreen(queryClient);
        }
      },
    })
  );

  if (!instance.data) {
    return <WorkNotShown error={instance.error} />;
  }

  const {
    content,
    animals: fromFarm,
    completions: recorded,
    state,
    feeding,
    fed,
    stockCount,
    medicineCount,
    renewal,
    changed,
    runningOn,
  } = instance.data;
  /** A Step answered by doing it is done on the tap; any other opens its sheet. Nothing for work held by another. */
  const openStepIfMine = (step: Step) => {
    if (someoneElse) {
      return;
    }
    if (isOneTap(step) && !doneFor(step.id)) {
      send(step, undefined, { evidence: step.evidence.map(() => true) });
      return;
    }
    setOpenStep(step);
  };
  const openAnimalIfMine = (beast: Animal) => {
    if (!someoneElse) {
      setOpenAnimalId(beast.id);
    }
  };
  // The farm holds a Step's answers as a blob, so it says `unknown` of them and means it. This is the
  // one thing the board has to assert about what it is given, and it asserts only this: everything else
  // — including whether a Registration's expiry is a date or a string — is the router's own word,
  // which is the point of asking it rather than describing it.
  const completions: Completion[] = recorded.map((one) => ({
    ...one,
    evidence: one.evidence as (boolean | number | string)[],
  }));
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
  const openAnimal = animals.find((beast) => beast.id === openAnimalId);
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

  const { pen } = instance.data as {
    pen?: Parameters<typeof PlaceLine>[0]["pen"];
  };

  if (state === "due") {
    return (
      <Page width="narrow">
        <div className="mx-auto flex w-full max-w-md flex-col gap-3">
          <BackToToday />
          <div className="surface flex w-full flex-col items-center gap-5 p-6 text-center sm:p-8">
            <span className="bg-secondary text-secondary-foreground grid size-16 place-items-center rounded-xl">
              <ClipboardList aria-hidden className="size-8" />
            </span>
            <div className="flex flex-col items-center gap-1.5">
              <h1 className="text-2xl font-semibold">
                <SopName name={content.name} />
              </h1>
              <PlaceLine pen={pen} />
              <AboutHerLines about={instance.data} className="items-center" />
              <p className="text-muted-foreground mt-1 text-sm text-balance">
                {t("work.claimHint")}
              </p>
            </div>
            <ClaimOrWhose
              onClaim={() => claim.mutate()}
              someoneElse={someoneElse}
            />
          </div>
          {/* What the Manager is taking on, before they take it. */}
          <WhatRaisedIt report={null} seen={instance.data.seen} />
        </div>
        <AssignWork
          className="mx-auto w-full max-w-md"
          assignedRole={instance.data.assignedRole}
          assignedTo={instance.data.assignedTo}
          instanceId={instanceId}
          state={state}
        />
      </Page>
    );
  }

  /** Recording a Step that already has an entry changes a recorded fact, which is a
   *  Correction: the server wants a reason and checks the Correction Window. */
  const send = (
    step: Step,
    existing: Completion | undefined,
    payload: StepAnswer,
    animalTag?: string
  ) => {
    // Where the answer goes — put right, renewed online, or into the Outbox — is the Step answer's to say
    // (lib/step-answer).
    const journey = journeyOf(payload, {
      instanceId,
      stepId: step.id,
      animalTag,
      animalId: openAnimal?.id ?? null,
      recorded: existing,
    });
    if (journey.by === "correction") {
      correct.mutate(journey.input);
    } else if (journey.by === "renewal") {
      renew.mutate(journey.input);
    } else {
      record.mutate(journey.input);
    }
  };

  if (openAnimal && perAnimalStep) {
    const existing = doneFor(perAnimalStep.id, openAnimal.id);
    return (
      <EvidenceSheet
        animal={openAnimal}
        correcting={Boolean(existing)}
        existing={existing}
        key={openAnimal.id}
        onCancel={() => setOpenAnimalId(null)}
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
        existing={existing}
        feeding={feeding}
        stockCount={stockCount}
        medicineCount={medicineCount}
        renewal={renewal}
        onCancel={() => setOpenStep(null)}
        onRecord={(payload) => send(openStep, existing, payload)}
        step={openStep}
      />
    );
  }

  const { tally, nextAnimal } = roundOf(animals, perAnimalStep, doneFor);

  // Closed as Missed or Called Off: nothing more is recorded on it, so it offers nothing to tap — only why.
  if (isClosed(state)) {
    return (
      <Page className="mx-auto max-w-4xl pb-2">
        <WorkHeader
          about={instance.data}
          name={content.name}
          pen={pen}
          tally={tally}
        />
        <WorkNotices runningOn={runningOn} shortFed={shortFed} state={state} />
        <Link
          className={buttonVariants({
            className: "h-12 w-full sm:w-fit md:h-12",
            variant: "outline",
          })}
          search={{}}
          to="/work"
        >
          <ChevronLeft data-icon="inline-start" />
          {t("nav.today")}
        </Link>
      </Page>
    );
  }

  return (
    <Page className="mx-auto max-w-4xl gap-5 pb-2 md:gap-6">
      <WorkHeader
        about={instance.data}
        name={content.name}
        pen={pen}
        tally={tally}
      />
      <HeldByNotice someoneElse={someoneElse} />
      <AssignWork
        assignedRole={instance.data.assignedRole}
        assignedTo={instance.data.assignedTo}
        instanceId={instanceId}
        state={state}
      />

      <WhatRaisedIt report={instance.data.report} seen={instance.data.seen} />
      <DosesOwedBeforeRelease animals={animals} content={content} />

      {changed ? <WhatChanged changed={changed} /> : null}

      <WorkNotices runningOn={runningOn} shortFed={shortFed} state={state} />

      {chipSteps.length ? (
        <BoardPart title={t("sop.steps")}>
          <div className="flex flex-col gap-2">
            {chipSteps.map((step) => (
              <StepRow
                done={Boolean(doneFor(step.id))}
                key={step.id}
                oneTap={isOneTap(step)}
                onOpen={() => openStepIfMine(step)}
                step={step}
              />
            ))}
          </div>
        </BoardPart>
      ) : null}

      {perAnimalStep ? (
        <BoardPart title={t("work.animalsTitle")}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {animals.map((beast) => (
              <li key={beast.id}>
                <AnimalTile
                  animal={beast}
                  completion={doneFor(perAnimalStep.id, beast.id)}
                  well={nothingToNoteOf(perAnimalStep)?.bn}
                  next={beast.id === nextAnimal?.id}
                  onOpen={() => openAnimalIfMine(beast)}
                />
              </li>
            ))}
          </ul>
          <PassTheRestWell
            heldByAnother={someoneElse !== null}
            instanceId={instanceId}
            onPassed={() => {
              // As the last tap would: the work with nothing left undone is finished.
              if (everythingRecorded(queryClient.getQueryData(instanceKey))) {
                finish.mutate();
              }
            }}
            rest={animals.filter(
              (beast) => !doneFor(perAnimalStep.id, beast.id)
            )}
            state={state}
            step={perAnimalStep}
          />
        </BoardPart>
      ) : null}

      {outcome ? <BulkOutcomeBanner outcome={outcome} /> : null}

      {/* Finished work has nothing left to finish: a Step on it is put right, not done. */}
      <BoardFoot hidden={someoneElse !== null || isFinished(state)}>
        {nextAnimal ? (
          <NextAnimal
            animal={nextAnimal}
            onOpen={() => setOpenAnimalId(nextAnimal.id)}
          />
        ) : (
          <ClosingAction
            closingStep={closingStep}
            done={Boolean(closingStep && doneFor(closingStep.id))}
            onFinish={() => finish.mutate()}
            onOpen={(step) => setOpenStep(step)}
            pending={finish.isPending}
            ready={readyToClose}
          />
        )}
      </BoardFoot>
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/work/$instanceId")({
  staticData: { focusedWork: true },
  component: WorkPage,
  /** Opened by Start on the day's list, which means take it: the page claims it as it opens. */
  validateSearch: (search: Record<string, unknown>): { start?: true } =>
    search.start === true || search.start === "true" ? { start: true } : {},
});
