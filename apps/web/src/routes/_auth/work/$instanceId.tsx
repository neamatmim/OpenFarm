import type { FactsAsShown } from "@OpenFarm/api/effects/effect";
import type {
  Bilingual,
  Evidence,
  MilkDestination,
  SopChange,
  Step,
} from "@OpenFarm/domain";
import {
  MILK_DESTINATIONS,
  isClosingStep,
  isFinished,
  mayTransition,
  missingEvidence,
} from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import {
  formatDate,
  formatDayField,
  formatDigits,
  numberAsTyped,
} from "@OpenFarm/i18n";
import { Button, buttonVariants } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Camera,
  Check,
  CheckCheck,
  ChevronLeft,
  CircleDashed,
  ChevronRight,
  ClipboardList,
  Info,
  Lock,
  MapPin,
  Milk,
  SkipForward,
  SprayCan,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { AnimalPhoto } from "@/components/animal-photo";
import { AssignWork } from "@/components/assign-work";
import {
  Notice,
  Page,
  StatusBadge,
  StickyAction,
  TagChip,
} from "@/components/page";
import { PhotoField } from "@/components/photo-field";
import { useLanguage } from "@/i18n/language-provider";
import {
  correctionRefusalMessage,
  isChangedSince,
} from "@/lib/correction-refusal";
import { cachedWithdrawal, herdCacheQuery } from "@/lib/herd-cache";
import type { Photo } from "@/lib/photo";
import { shrink } from "@/lib/photo";
import type { StepRecord, StockCountEntry } from "@/lib/record-offline";
import {
  claimInstance,
  finishInstance,
  recordStep,
} from "@/lib/record-offline";
import { refreshTheScreen } from "@/lib/refresh";
import { useRefused } from "@/lib/refused";
import { skipReasonsOffered } from "@/lib/skipping";
import { placeOfWork } from "@/lib/work-place";
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
  const refused = useRefused();
  const letter = useMutation(
    orpc.notifiable.letter.mutationOptions({
      onError: refused,
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
/** Work closed without being done — Missed or Called Off: neither owed any more nor finished. */
const isClosed = (state: string) =>
  !(mayTransition("record", state) || isFinished(state));

interface Completion {
  id: string;
  stepId: string;
  animalId: string | null;
  status: string;
  skipReason: string | null;
  /** The answer as it stands, which a Correction says it was shown. */
  evidence: (boolean | number | string)[];
  destination: MilkDestination | null;
  outOfRange: string | null;
  /** What the Step's Effect recorded beside its Evidence — the feed given, the store counted — as it was shown. */
  facts: FactsAsShown;
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

/** A Playbook entry's name in the language the page is showing, Bangla where it has no English. */
const SopName = ({ name }: { name: { bn: string; en?: string } }) => {
  const { language } = useLanguage();
  return <span>{language === "en" && name.en ? name.en : name.bn}</span>;
};

/** The work before it arrives: its outline while loading, and a way back to the day's list when it cannot come. */
const WorkNotShown = ({ error }: { error: Error | null }) => {
  const { t } = useLanguage();
  if (!error) {
    return (
      <Page width="narrow">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </Page>
    );
  }
  const missing = (error as { code?: unknown }).code === "NOT_FOUND";
  return (
    <Page width="narrow">
      <Notice
        action={
          <Link className={buttonVariants({ variant: "outline" })} to="/today">
            {t("nav.today")}
          </Link>
        }
        title={missing ? t("common.notFound") : t("common.loadFailed")}
        tone="danger"
      />
    </Page>
  );
};

/** The way back to the day's list, big enough for a thumb in a glove. */
const BackToToday = () => {
  const { t } = useLanguage();
  return (
    <Link
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ms-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-2"
      search={{}}
      to="/today"
    >
      <ChevronLeft aria-hidden className="size-4" />
      {t("nav.today")}
    </Link>
  );
};

/** Where the work is — the shed and the Pen, or the whole farm — said once under its name. Nothing is said when the
 *  phone's cached copy of the work is older than the farm's saying so. */
const PlaceLine = ({
  pen,
}: {
  pen: { name: string; shed: { name: string } } | null | undefined;
}) => {
  const { t } = useLanguage();
  if (pen === undefined) {
    return null;
  }
  return (
    <p className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
      <MapPin aria-hidden className="size-4 shrink-0" />
      {placeOfWork(pen, t("work.wholeFarm"))}
    </p>
  );
};

/** Who else holds this work — pinned to them, or claimed by them — or nobody. Somebody else's work is read here, not
 *  done: the farm takes an entry on it only from them, so a Claim or a tile that opens would be a refusal waiting to
 *  happen. Not known until the phone knows who it is, and then only said of someone else. */
const useHeldByOther = (
  work: { heldBy: { id: string; name: string } | null } | undefined
): { id: string; name: string } | null => {
  const me = useQuery(orpc.people.me.queryOptions());
  const heldBy = work?.heldBy;
  if (!(heldBy && me.data)) {
    return null;
  }
  return heldBy.id === me.data.id ? null : heldBy;
};

/** Work not yet begun: the button to begin it — or, where it is pinned to somebody else, whose it is. */
const ClaimOrWhose = ({
  someoneElse,
  onClaim,
}: {
  someoneElse: { name: string } | null;
  onClaim: () => void;
}) => {
  const { t } = useLanguage();
  if (someoneElse) {
    return (
      <p className="text-sm font-medium">
        {t("work.theirsToStart", { name: someoneElse.name })}
      </p>
    );
  }
  return (
    <Button className="h-14 w-full text-lg md:h-12" onClick={onClaim}>
      {t("work.claim")}
    </Button>
  );
};

/** Over a board somebody else is working: whose it is, and that it is theirs to record. */
const HeldByNotice = ({
  someoneElse,
}: {
  someoneElse: { name: string } | null;
}) => {
  const { t } = useLanguage();
  return someoneElse ? (
    <Notice title={t("work.heldBy", { name: someoneElse.name })} tone="info" />
  ) : null;
};

/** The board's foot — the next animal, or finishing — left off where the work is somebody else's to finish. */
const BoardFoot = ({
  hidden,
  children,
}: {
  hidden: boolean;
  children: ReactNode;
}) => (hidden ? null : <StickyAction>{children}</StickyAction>);

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
  const someoneElse = useHeldByOther(instance.data);
  // What this phone last knew of the herd. With no signal the board still has to say which
  // cow may not go to the tank: a shed with no bars is exactly where that mistake is made.
  const herd = useQuery(herdCacheQuery);
  const onError = (error: Error) =>
    toast.error(
      correctionRefusalMessage(error, t) ?? error.message ?? t("common.error")
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
  const renew = useMutation(
    orpc.instances.completeStep.mutationOptions({
      onSuccess: () => {
        setOpenStep(null);
      },
      onError,
    })
  );
  const correct = useMutation(
    orpc.instances.correctStep.mutationOptions({
      onSuccess: ({ effect, needsReview }) => {
        setOutcome(effect?.kind === "bulk_total" ? effect : null);
        if (needsReview) {
          toast.warning(t("review.corrected_after_sign_off"));
        }
        setOpenAnimal(null);
        setOpenStep(null);
      },
      onError: (error) => {
        onError(error);
        // Put right by somebody else since: read the work again, and start from what it says now.
        if (isChangedSince(error)) {
          setOpenAnimal(null);
          setOpenStep(null);
          refreshTheScreen(queryClient);
        }
      },
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
    renewal,
    changed,
    runningOn,
  } = instance.data;
  const openStepIfMine = (step: Step) => {
    if (!someoneElse) {
      setOpenStep(step);
    }
  };
  const openAnimalIfMine = (beast: Animal) => {
    if (!someoneElse) {
      setOpenAnimal(beast);
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
          <div className="bg-card flex w-full flex-col items-center gap-5 rounded-2xl border p-6 text-center shadow-sm sm:p-8">
            <span className="bg-secondary text-secondary-foreground grid size-16 place-items-center rounded-2xl">
              <ClipboardList aria-hidden className="size-8" />
            </span>
            <div className="flex flex-col items-center gap-1.5">
              <h1 className="text-2xl leading-tight font-semibold tracking-tight">
                <SopName name={content.name} />
              </h1>
              <PlaceLine pen={pen} />
              <p className="text-muted-foreground mt-1 text-sm text-balance">
                {t("work.claimHint")}
              </p>
            </div>
            <ClaimOrWhose
              onClaim={() => claim.mutate()}
              someoneElse={someoneElse}
            />
          </div>
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
    payload: RecordPayload,
    animalTag?: string
  ) => {
    if (existing && payload.reason) {
      // A Correction changes what was recorded; replacing the photo with it is a later
      // ticket's problem, so the one already attached stays.
      correct.mutate({
        id: existing.id,
        changes: {
          answer: {
            from: {
              skipReason: existing.skipReason,
              evidence: existing.evidence,
              destination: existing.destination,
              outOfRange: existing.outOfRange,
              ...existing.facts,
            },
            to: {
              destination: payload.destination,
              evidence: payload.evidence,
              outOfRange: payload.outOfRange,
              skipReason: payload.skipReason,
              feeding: payload.feeding,
              counts: payload.counts,
              renewal: payload.renewal,
            },
          },
        },
        reason: payload.reason,
      });
      return;
    }
    // The renewal is sent as it is taken: a certificate's photograph is not something to hold in a shed
    // phone's queue, and the renewal is the Owner's own act on their own phone.
    if (payload.renewal) {
      renew.mutate({
        instanceId,
        stepId: step.id,
        evidence: payload.evidence,
        renewal: payload.renewal,
      });
      return;
    }
    // The reason belongs to a Correction, which took the branch above; recording a new
    // entry has nothing to explain.
    const { reason: _forCorrections, renewal: _online, ...rest } = payload;
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
        existing={existing}
        feeding={feeding}
        stockCount={stockCount}
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
        <WorkHeader name={content.name} pen={pen} tally={tally} />
        <WorkNotices runningOn={runningOn} shortFed={shortFed} state={state} />
        <Link
          className={buttonVariants({
            className: "h-12 w-full sm:w-fit",
            variant: "outline",
          })}
          search={{}}
          to="/today"
        >
          <ChevronLeft data-icon="inline-start" />
          {t("nav.today")}
        </Link>
      </Page>
    );
  }

  return (
    <Page className="mx-auto max-w-4xl gap-5 pb-2 md:gap-6">
      <WorkHeader name={content.name} pen={pen} tally={tally} />
      <HeldByNotice someoneElse={someoneElse} />
      <AssignWork
        assignedRole={instance.data.assignedRole}
        assignedTo={instance.data.assignedTo}
        instanceId={instanceId}
        state={state}
      />

      {instance.data.report ? (
        <TheLetter report={instance.data.report} />
      ) : null}

      {changed ? <WhatChanged changed={changed} /> : null}

      <WorkNotices runningOn={runningOn} shortFed={shortFed} state={state} />

      {chipSteps.length ? (
        <BoardPart title={t("sop.steps")}>
          <div className="flex flex-col gap-2">
            {chipSteps.map((step) => (
              <StepRow
                done={Boolean(doneFor(step.id))}
                key={step.id}
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
                  next={beast.id === nextAnimal?.id}
                  onOpen={() => openAnimalIfMine(beast)}
                />
              </li>
            ))}
          </ul>
        </BoardPart>
      ) : null}

      {outcome ? <BulkOutcomeBanner outcome={outcome} /> : null}

      <BoardFoot hidden={someoneElse !== null}>
        {nextAnimal ? (
          <NextAnimal
            animal={nextAnimal}
            onOpen={() => setOpenAnimal(nextAnimal)}
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

/** One part of the board — the Steps done once, the Pen's animals — under a quiet heading of its own. */
const BoardPart = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-2.5">
    <h2 className="text-muted-foreground text-sm font-semibold">{title}</h2>
    {children}
  </section>
);

/** The one action that takes a person to the next animal still to do. */
const NextAnimal = ({
  animal,
  onOpen,
}: {
  animal: Animal;
  onOpen: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <Button className="h-14 w-full text-lg md:h-12" onClick={onOpen}>
      {t("work.nextAnimal", { tag: animal.tagNumber })}
      <ChevronRight data-icon="inline-end" />
    </Button>
  );
};

/** What the person should know before working: an older Version still running, or the Pen fed short. */
const WorkNotices = ({
  runningOn,
  shortFed,
  state,
}: {
  runningOn: number | null | undefined;
  shortFed: { shortfallPercent: number } | null | undefined;
  /** Where the work stands: closed work says so, so nobody records on it for nothing. */
  state: string;
}) => {
  const { t } = useLanguage();
  return (
    <>
      {state === "called_off" ? (
        <Notice title={t("work.calledOff")} tone="info" />
      ) : null}

      {state === "missed" ? (
        <Notice title={t("work.closedAsMissed")} tone="warning" />
      ) : null}

      {runningOn ? (
        <Notice
          title={t("changed.onOlder", { number: runningOn })}
          tone="info"
        />
      ) : null}

      {shortFed ? (
        <Notice
          title={t("work.shortFed", { percent: shortFed.shortfallPercent })}
          tone="warning"
        />
      ) : null}
    </>
  );
};

/** Where one animal stands in a round: recorded, skipped, or still to do. */
type Standing = "done" | "skipped" | "left";

const standingOf = (completion: Completion | undefined): Standing => {
  if (!completion) {
    return "left";
  }
  return completion.status === "skipped" ? "skipped" : "done";
};

/** How each standing looks on its tile: its word, its icon, and its colour — never the colour alone. */
const TILE_LOOK = {
  done: {
    icon: Check,
    label: "work.tileDone",
    tile: "border-success/35 bg-success-surface/50",
    text: "bg-success text-white",
  },
  skipped: {
    icon: SkipForward,
    label: "work.tileSkipped",
    tile: "bg-muted/60",
    text: "bg-muted-foreground/15 text-muted-foreground",
  },
  left: {
    icon: CircleDashed,
    label: "work.tileLeft",
    tile: "",
    text: "bg-secondary text-secondary-foreground",
  },
} as const satisfies Record<
  Standing,
  { icon: LucideIcon; label: MessageKey; tile: string; text: string }
>;

/** A Pen's round so far — how many animals are done, skipped and left — and the next animal still to do. */
const roundOf = (
  animals: Animal[],
  perAnimalStep: Step | undefined,
  doneFor: (stepId: string, animalId: string | null) => Completion | undefined
) => {
  if (!perAnimalStep) {
    return { tally: null, nextAnimal: undefined };
  }
  const tally = { done: 0, skipped: 0, left: 0 };
  let nextAnimal: Animal | undefined;
  for (const beast of animals) {
    const standing = standingOf(doneFor(perAnimalStep.id, beast.id));
    tally[standing] += 1;
    if (standing === "left" && !nextAnimal) {
      nextAnimal = beast;
    }
  }
  return { tally, nextAnimal };
};

/** One count of the round — done, skipped or left — as a word with its icon, never its colour alone. */
const TallyCount = ({
  icon: Icon,
  className,
  children,
}: {
  icon: LucideIcon;
  className: string;
  children: ReactNode;
}) => (
  <span
    className={cn("inline-flex items-center gap-1.5 font-medium", className)}
  >
    <Icon aria-hidden className="size-4" />
    {children}
  </span>
);

/** How far round the Pen this work has got: done, skipped and still to do, each counted and each its own colour. */
const WorkHeader = ({
  name,
  pen,
  tally,
}: {
  name: { bn: string; en?: string };
  pen: { name: string; shed: { name: string } } | null | undefined;
  tally: { done: number; skipped: number; left: number } | null;
}) => {
  const { t, language } = useLanguage();
  const count = (n: number) => formatDigits(n, language);
  const total = tally ? tally.done + tally.skipped + tally.left : 0;
  const share = (n: number) => `${total === 0 ? 0 : (n / total) * 100}%`;
  return (
    <header className="flex flex-col gap-3">
      <BackToToday />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
          <SopName name={name} />
        </h1>
        <PlaceLine pen={pen} />
      </div>
      {tally && total > 0 ? (
        <div className="bg-card flex flex-col gap-3 rounded-xl border p-3.5 md:p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="flex items-baseline gap-2">
              <span className="text-muted-foreground text-sm">
                {t("work.animalsDone")}
              </span>
              <span className="text-base font-semibold tabular-nums">
                {t("work.progress", {
                  done: count(tally.done + tally.skipped),
                  total: count(total),
                })}
              </span>
            </p>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              <TallyCount className="text-success" icon={Check}>
                {t("work.tallyDone", { count: count(tally.done) })}
              </TallyCount>
              <TallyCount className="text-muted-foreground" icon={SkipForward}>
                {t("work.tallySkipped", { count: count(tally.skipped) })}
              </TallyCount>
              <TallyCount className="text-foreground" icon={CircleDashed}>
                {t("work.tallyLeft", { count: count(tally.left) })}
              </TallyCount>
            </p>
          </div>
          <div
            aria-hidden
            className="bg-muted flex h-3 w-full overflow-hidden rounded-full"
          >
            <div
              className="bg-success h-full transition-[width] duration-300"
              style={{ width: share(tally.done) }}
            />
            <div
              className="bg-muted-foreground/35 h-full transition-[width] duration-300"
              style={{ width: share(tally.skipped) }}
            />
          </div>
        </div>
      ) : null}
    </header>
  );
};

/** A once-only Step of the work: what it asks, and whether it has been done. */
const StepRow = ({
  step,
  done,
  onOpen,
}: {
  step: Step;
  done: boolean;
  onOpen: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <button
      className={cn(
        "bg-card hover:border-primary/40 focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left transition-[border-color,box-shadow] duration-150 outline-none focus-visible:ring-2",
        done && "border-success/30 bg-success-surface/60"
      )}
      onClick={onOpen}
      type="button"
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full",
          done
            ? "bg-success text-white"
            : "bg-secondary text-secondary-foreground"
        )}
      >
        {done ? (
          <Check aria-hidden className="size-5" />
        ) : (
          <SprayCan aria-hidden className="size-5" />
        )}
      </span>
      <span className="flex-1 text-base font-medium">{step.text.bn}</span>
      {done ? (
        <StatusBadge tone="success">{t("work.stepDone")}</StatusBadge>
      ) : (
        <ChevronRight aria-hidden className="text-muted-foreground size-5" />
      )}
    </button>
  );
};

/** One animal of a Pen's round: her number first, then — in words, not only colour — whether she is done, skipped
 *  and why, or still to do, and whether a Withdrawal holds her milk. The next one to do is marked, in a word too. */
const AnimalTile = ({
  animal,
  completion,
  next,
  onOpen,
}: {
  animal: Animal;
  completion: Completion | undefined;
  next: boolean;
  onOpen: () => void;
}) => {
  const { t } = useLanguage();
  const standing = standingOf(completion);
  const { icon: StateIcon, label, tile, text } = TILE_LOOK[standing];
  const held = animal.underMilkWithdrawal && standing === "left";
  return (
    <button
      aria-label={`${animal.tagNumber} — ${t(label)}`}
      className={cn(
        "bg-card hover:border-primary/40 focus-visible:ring-ring relative flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border p-3 pt-4 text-center transition-[border-color,box-shadow] duration-150 outline-none hover:shadow-md focus-visible:ring-2 active:translate-y-px",
        tile,
        held && "border-warning/50",
        next && "border-primary ring-primary/25 ring-2"
      )}
      onClick={onOpen}
      type="button"
    >
      {next ? (
        <span className="bg-primary text-primary-foreground absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap">
          {t("work.tileNext")}
        </span>
      ) : null}
      {animal.photoUpdatedAt ? (
        <AnimalPhoto
          photoUpdatedAt={animal.photoUpdatedAt}
          size={64}
          tagNumber={animal.tagNumber}
        />
      ) : null}
      <span className="font-mono text-xl font-bold tracking-tight tabular-nums">
        {animal.tagNumber}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium",
          text
        )}
      >
        <StateIcon aria-hidden className="size-3.5" />
        {t(label)}
      </span>
      {standing === "skipped" && completion?.skipReason ? (
        <span className="text-muted-foreground line-clamp-2 text-xs">
          {completion.skipReason}
        </span>
      ) : null}
      {animal.underMilkWithdrawal ? (
        <StatusBadge icon={Lock} tone="warning">
          {t("milk.withdrawalShort")}
        </StatusBadge>
      ) : null}
    </button>
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
    <section
      aria-labelledby="what-changed-title"
      className="border-info/25 bg-info-surface text-info flex items-start gap-3 rounded-xl border px-4 py-3"
    >
      <Info aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="font-semibold" id="what-changed-title">
          {t("changed.title")}
        </h2>
        <p className="text-sm">
          {t("changed.versions", { from: changed.from, to: changed.to })}
        </p>
        <ul className="text-foreground/85 mt-1 list-disc space-y-1 ps-5 text-sm">
          {changed.changes.map((change, index) => (
            <li key={`${change.kind}-${index}`}>
              {t(CHANGE_MESSAGE[change.kind], said(change))}
            </li>
          ))}
        </ul>
      </div>
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
    <Notice
      title={
        outcome.differenceLitres === 0
          ? t("milk.matched")
          : t("milk.difference", { litres })
      }
      tone={outcome.flagged ? "warning" : "success"}
    >
      {outcome.flagged ? t("milk.flagged") : null}
    </Notice>
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
      <p className="text-muted-foreground bg-muted/60 flex min-h-14 items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-sm font-medium">
        <CircleDashed aria-hidden className="size-4 shrink-0" />
        {t("work.notFinished")}
      </p>
    );
  }
  // An SOP with no closing Step — one Step, or a last Step that repeats per animal —
  // finishes as soon as everything else is done.
  if (!(closingStep && !done)) {
    return (
      <Button
        className="h-14 w-full text-lg md:h-12"
        disabled={pending}
        onClick={onFinish}
      >
        {pending ? <Spinner /> : <CheckCheck data-icon="inline-start" />}
        {t("work.finish")}
      </Button>
    );
  }
  return (
    <Button
      className="h-auto min-h-14 w-full py-2 text-lg whitespace-normal"
      variant="outline"
      onClick={() => onOpen(closingStep)}
    >
      {closingStep.text.bn}
      <ChevronRight data-icon="inline-end" />
    </Button>
  );
};

/**
 * What a Step that counts the store is being told: the box for each Feed Item and why it differs,
 * starting from what was counted before for a Correction and blank for a new count; whether every item
 * has been counted; and the lines to send. Nothing at all for any other Step.
 */
const useStockCount = (
  step: Step,
  board: StockCountBoard | null | undefined
) => {
  const counts = step.effect?.kind === "stock_count";
  const before = board?.counted ?? [];
  const [counted, setCounted] = useState<Typed>(() =>
    Object.fromEntries(
      before.map((line) => [line.feedItemId, String(line.counted)])
    )
  );
  const [reasons, setReasons] = useState<Typed>(() =>
    Object.fromEntries(
      before.map((line) => [line.feedItemId, line.reason ?? ""])
    )
  );
  const items = counts ? (board?.items ?? []) : [];
  return {
    items,
    counted,
    handleCounted: setCounted,
    reasons,
    handleReason: setReasons,
    complete: items.every(
      (item) => (counted[item.feedItemId] ?? "").trim() !== ""
    ),
    lines: (): StockCountEntry[] | undefined =>
      counts
        ? items.map((item) => ({
            feedItemId: item.feedItemId,
            counted: Number(counted[item.feedItemId]),
            reason: reasons[item.feedItemId]?.trim() || undefined,
          }))
        : undefined,
  };
};

/** What a Step that counts the store is handed: the Feed Items, and what it counted before. */
interface StockCountBoard {
  items: { feedItemId: string; nameBn: string; unit: string }[];
  counted: { feedItemId: string; counted: number; reason: string | null }[];
}

/** The farm day a year after the Registration runs out now: where a renewed certificate usually lands. */
const aYearOn = (expiresOn: Date | null): string => {
  if (!expiresOn) {
    return "";
  }
  const day = formatDayField(expiresOn);
  const [year, ...rest] = day.split("-");
  return [String(Number(year) + 1), ...rest].join("-");
};

/**
 * What the renewal's closing Step is filling in: the day the renewed certificate runs out — starting a year
 * on from the day it runs out now, which is how a certificate is usually renewed, or for a Correction the day it
 * was renewed to — and its photograph. Ready
 * once both are given; a Correction may keep the photograph it already sent.
 */
const useRenewal = (
  step: Step,
  board: { expiresOn: Date | null } | null | undefined,
  correcting: boolean,
  recorded: FactsAsShown["renewal"]
) => {
  const renews = step.effect?.kind === "registration_renewal";
  const runsOutOn = board?.expiresOn ?? null;
  const [expiresOn, setExpiresOn] = useState(
    () => recorded?.expiresOn ?? aYearOn(runsOutOn)
  );
  const [issuedOn, setIssuedOn] = useState("");
  const [certificate, setCertificate] = useState<Photo | null>(null);
  const given = expiresOn !== "" && (certificate !== null || correcting);
  return {
    renews,
    runsOutOn,
    expiresOn,
    setExpiresOn,
    issuedOn,
    setIssuedOn,
    certificate,
    setCertificate,
    /** Ready when everything else the Step asks is, and — for a renewal — its own fields are too. */
    readyWith: (restIsReady: boolean) => restIsReady && (!renews || given),
    entry: () =>
      renews
        ? {
            expiresOn,
            issuedOn: issuedOn || undefined,
            certificate: certificate ?? undefined,
          }
        : undefined,
  };
};

/** The renewal's closing Step's own fields, for that Step and no other. */
const RenewalFields = ({
  renewing,
}: {
  renewing: ReturnType<typeof useRenewal>;
}) => {
  const { t, language } = useLanguage();
  if (!renewing.renews) {
    return null;
  }
  const {
    runsOutOn,
    expiresOn,
    issuedOn,
    certificate,
    setExpiresOn: onExpiresOn,
    setIssuedOn: onIssuedOn,
    setCertificate: onCertificate,
  } = renewing;
  const certificateTaken = certificate !== null;
  return (
    <div className="space-y-3">
      {runsOutOn ? (
        <p className="text-muted-foreground text-sm">
          {t("renewal.runsOut", {
            date: formatDate(new Date(runsOutOn), language, "date"),
          })}
        </p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="renewal-expires">{t("renewal.newExpiry")}</Label>
        <Input
          id="renewal-expires"
          onChange={(event) => onExpiresOn(event.target.value)}
          type="date"
          value={expiresOn}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="renewal-issued">{t("renewal.issuedOn")}</Label>
        <Input
          id="renewal-issued"
          onChange={(event) => onIssuedOn(event.target.value)}
          type="date"
          value={issuedOn}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="renewal-certificate">{t("renewal.certificate")}</Label>
        <PhotoField
          chosen={certificateTaken}
          id="renewal-certificate"
          onPhoto={(photo) => {
            if (photo) {
              onCertificate(photo);
            }
          }}
          takeLabel="renewal.certificateTake"
        />
      </div>
    </div>
  );
};

/**
 * One box per Feed Item for what is really in the store, and one for why, if it is not what the farm
 * expects. The expected figure is never shown: a count that can see the answer copies it. The farm
 * refuses a difference without a reason, and says which.
 */
const StockCountFields = ({
  items,
  counted,
  reasons,
  onCounted,
  onReason,
}: {
  items: StockCountBoard["items"];
  counted: Typed;
  reasons: Typed;
  onCounted: (next: (current: Typed) => Typed) => void;
  onReason: (next: (current: Typed) => Typed) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      {items.map((item) => (
        <div
          className="bg-card flex flex-col gap-2 rounded-xl border p-3"
          key={item.feedItemId}
        >
          <p className="text-sm font-medium">
            {item.nameBn}{" "}
            <span className="text-muted-foreground font-normal">
              ({item.unit})
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label={`${item.nameBn} ${t("work.counted")}`}
              className="h-14 text-lg"
              inputMode="decimal"
              onChange={(event) =>
                onCounted((current) => ({
                  ...current,
                  [item.feedItemId]: event.target.value,
                }))
              }
              placeholder={t("work.counted")}
              type="number"
              value={counted[item.feedItemId] ?? ""}
            />
            <Input
              aria-label={`${item.nameBn} ${t("work.countReason")}`}
              className="h-14"
              onChange={(event) =>
                onReason((current) => ({
                  ...current,
                  [item.feedItemId]: event.target.value,
                }))
              }
              placeholder={t("work.countReason")}
              value={reasons[item.feedItemId] ?? ""}
            />
          </div>
        </div>
      ))}
    </>
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
    /** Nothing for a line by weight in a Pen nobody weighed. */
    quantity: number | null;
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
    return <Notice title={t("work.noRation")} tone="warning" />;
  }
  return (
    <>
      {rows.map((line) => (
        <div
          className="bg-card flex flex-col gap-2 rounded-xl border p-3"
          key={line.feedItemId}
        >
          <p className="text-sm font-medium">
            {line.nameBn}{" "}
            {line.quantity === null ? null : (
              <span className="text-muted-foreground font-normal">
                · {t("feed.target")}: {line.quantity} {line.unit}
              </span>
            )}
          </p>
          {line.quantity === null ? (
            <p className="text-warning text-xs">{t("work.typeWhatWentOut")}</p>
          ) : null}
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
              value={
                given[line.feedItemId] ??
                (line.quantity === null ? "" : String(line.quantity))
              }
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
/** Skipping an animal: the Version's own reasons, and nothing typed into a free box. A
 *  Correction still has to say why, because changing a recorded fact is the person speaking. */
const SkipSheet = ({
  reasons,
  animalTag,
  correcting,
  reason,
  onReason,
  onSkip,
  onBack,
}: {
  /** What this Step may be skipped with, as the button that opened this was drawn from. */
  reasons: Bilingual[];
  /** The animal being skipped, named above the reasons so nobody skips the wrong cow. */
  animalTag?: string;
  correcting: boolean;
  reason: string;
  onReason: (value: string) => void;
  onSkip: (payload: RecordPayload) => void;
  onBack: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-4 pb-6">
      <button
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ms-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-2"
        onClick={onBack}
        type="button"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("work.back")}
      </button>
      <header className="flex items-center gap-3">
        <span className="bg-muted text-muted-foreground grid size-12 shrink-0 place-items-center rounded-xl">
          <SkipForward aria-hidden className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          {animalTag ? <TagChip>{animalTag}</TagChip> : null}
          <h1 className="text-xl leading-snug font-semibold">
            {t("work.skipWhy")}
          </h1>
        </div>
      </header>
      {correcting ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="skip-correction-reason">{t("correct.why")}</Label>
          <Input
            className="h-12 text-base"
            id="skip-correction-reason"
            onChange={(event) => onReason(event.target.value)}
            value={reason}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {reasons.map((skip) => (
          <Button
            className="h-auto min-h-14 w-full justify-start py-2 text-start text-lg whitespace-normal"
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
      </div>
      <Button
        className="h-12 w-full text-base"
        onClick={onBack}
        variant="ghost"
      >
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
          /** Nothing for a line by weight in a Pen nobody weighed. */
          quantity: number | null;
        }[];
      }
    | null
    | undefined
) => {
  const rows = feeds ? (feeding?.items ?? []) : [];
  return { rows, cannotFeed: feeds && rows.length === 0 };
};

/** A line that owed no figure — by weight, in a Pen nobody weighed — with nothing typed for it: until somebody says what
 *  went out, a blank would be recorded as none given. */
const untypedFeed = (
  rows: { feedItemId: string; quantity: number | null }[],
  given: Typed
) =>
  rows.some(
    (line) =>
      line.quantity === null && (given[line.feedItemId] ?? "").trim() === ""
  );

/**
 * What went out, per Feed Item. A box left as it was handed over means the figure that was
 * handed over: somebody who clears one to retype it has not yet said the Pen got nothing.
 */
const whatWentOut = (
  rows: { feedItemId: string; quantity: number | null }[],
  given: Typed,
  leftover: Typed
) =>
  rows.map((line) => ({
    feedItemId: line.feedItemId,
    givenKg: numberOr(given[line.feedItemId], line.quantity ?? 0),
    leftoverKg: numberOr(leftover[line.feedItemId], 0),
  }));

/** What an entry's Effect recorded beside its Evidence, or nothing for an entry not yet made. */
const factsOf = (existing: Completion | undefined): FactsAsShown =>
  existing?.facts ?? {};

/** Each Feed Item's box filled with one figure of what was recorded. */
const typedFrom = (
  lines: FactsAsShown["feeding"],
  figure: (line: NonNullable<FactsAsShown["feeding"]>[number]) => number
): Typed =>
  Object.fromEntries(
    (lines ?? []).map((line) => [line.feedItemId, String(figure(line))])
  );

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
  /** What a Step that counts the store found, per Feed Item. */
  counts?: StockCountEntry[];
  /** The new expiry, issue date and renewed certificate, for the Step that renews the Registration. Sent
   *  online, never through the Outbox: the certificate is the Owner's to give from their own phone. */
  renewal?: ReturnType<ReturnType<typeof useRenewal>["entry"]>;
  /** One per Evidence slot that asked for a picture. */
  photos?: { slot: number; contentType: "image/jpeg"; data: string }[];
  /** Set when the entry already exists: changing a recorded fact is a Correction, and a
   *  Correction carries a reason. */
  reason?: string;
}

/** What the sheet is for, at its top: the animal and her photo, or the Step's picture; the Step's words; and whether
 *  this is a Correction or a cow whose milk is held. */
const SheetHead = ({
  step,
  animal,
  correcting,
  locked,
}: {
  step: Step;
  animal?: Animal;
  correcting: boolean;
  locked: boolean;
}) => {
  const { t } = useLanguage();
  return (
    <header className="bg-card flex items-center gap-4 rounded-xl border p-4">
      {animal ? (
        <AnimalPhoto
          photoUpdatedAt={animal.photoUpdatedAt}
          size={80}
          tagNumber={animal.tagNumber}
        />
      ) : (
        <span className="bg-secondary text-secondary-foreground grid size-14 shrink-0 place-items-center rounded-xl">
          <SprayCan aria-hidden className="size-7" />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        {animal ? <TagChip>{animal.tagNumber}</TagChip> : null}
        <h1 className="text-xl leading-snug font-semibold">{step.text.bn}</h1>
        {correcting ? (
          <StatusBadge tone="info">{t("work.correcting")}</StatusBadge>
        ) : null}
        {locked ? (
          <StatusBadge icon={Lock} tone="warning">
            {t("milk.withdrawalShort")}
          </StatusBadge>
        ) : null}
      </div>
    </header>
  );
};

/** The full-screen sheet: one control per piece of Evidence the Version asks for, skip with
 *  a reason for a per-animal Step, and a warning that must be acknowledged for an odd figure. */
const EvidenceSheet = ({
  step,
  animal,
  correcting,
  existing,
  feeding,
  stockCount,
  renewal,
  onCancel,
  onRecord,
}: {
  step: Step;
  animal?: Animal;
  /** The entry already exists, so saving it again is a Correction. */
  correcting: boolean;
  /** The entry as it stands, whose Effect's facts a Correction starts from. */
  existing?: Completion;
  /** What this Pen is owed this session, for a Step that feeds. */
  feeding?: {
    items: {
      feedItemId: string;
      nameBn: string;
      unit: string;
      /** Nothing for a line by weight in a Pen nobody weighed. */
      quantity: number | null;
    }[];
  } | null;
  /** What to count, for a Step that counts the store. */
  stockCount?: StockCountBoard | null;
  /** When the Registration runs out now, for the Step that renews it. */
  renewal?: { expiresOn: Date | null } | null;
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
  // Asked of one place, not worked out here: the server refuses a skip by the same rule, and when this
  // screen had its own the two disagreed — a dose Step written with "ওষুধ শেষ" against it drew no
  // button at all. The reasons rather than a yes, so the button and the sheet cannot differ on them.
  const skipReasons = skipReasonsOffered(step);
  const skippable = skipReasons.length > 0;
  // A Correction starts from what was fed, not from what the Ration owed: saving it unchanged keeps what went out.
  const recorded = factsOf(existing);
  const [given, setGiven] = useState<Typed>(() =>
    typedFrom(recorded.feeding, (line) => line.givenKg)
  );
  const [leftover, setLeftover] = useState<Typed>(() =>
    typedFrom(recorded.feeding, (line) => line.leftoverKg)
  );
  const count = useStockCount(step, stockCount);
  const renewing = useRenewal(step, renewal, correcting, recorded.renewal);

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
  // Asked of the answers as they will be sent, and by the farm's own rule: the button is offered when
  // the farm would take it, not when the boxes merely look filled.
  const ready = renewing.readyWith(
    missingEvidence(step, assembled, (slot) => Boolean(photos[slot])).length ===
      0
  );

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
      counts: count.lines(),
      renewal: renewing.entry(),
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
        animalTag={animal?.tagNumber}
        correcting={correcting}
        onBack={() => setSkipping(false)}
        onReason={setReason}
        onSkip={onRecord}
        reason={reason}
        reasons={skipReasons}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-4 pb-2">
      <button
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ms-2 -mb-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-2"
        onClick={onCancel}
        type="button"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("work.back")}
      </button>
      <SheetHead
        animal={animal}
        correcting={correcting}
        locked={locked}
        step={step}
      />

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

      <RenewalFields renewing={renewing} />

      <StockCountFields
        counted={count.counted}
        items={count.items}
        onCounted={count.handleCounted}
        onReason={count.handleReason}
        reasons={count.reasons}
      />

      <FeedingFields
        cannotFeed={cannotFeed}
        given={given}
        leftover={leftover}
        onGiven={setGiven}
        onLeftover={setLeftover}
        rows={feedingRows}
      />

      {correcting ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="correction-reason">{t("correct.why")}</Label>
          <Input
            className="h-12 text-base"
            id="correction-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </div>
      ) : null}

      {warning ? (
        <Notice title={t("work.outOfRange")} tone="warning">
          <Button
            className="mt-2 w-full"
            onClick={() => submit(true)}
            variant="outline"
          >
            {t("work.keepAnyway")}
          </Button>
        </Notice>
      ) : null}

      <StickyAction>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="ghost" className="h-14 text-base" onClick={onCancel}>
            {t("work.back")}
          </Button>
          {skippable ? (
            <Button
              variant="outline"
              className="h-14 text-base"
              onClick={() => setSkipping(true)}
            >
              <SkipForward data-icon="inline-start" />
              {t("work.skip")}
            </Button>
          ) : null}
          <Button
            className={`h-14 text-lg ${skippable ? "" : "col-span-2"}`}
            disabled={
              cannotFeed ||
              untypedFeed(feedingRows, given) ||
              !count.complete ||
              !(ready && (!correcting || reason.trim()))
            }
            onClick={() => submit(false)}
          >
            <Check data-icon="inline-start" />
            {correcting ? t("correct.save") : t("work.confirm")}
          </Button>
        </div>
      </StickyAction>
    </div>
  );
};

/** Each place milk can go, with a picture beside its word: the tank, the calf, the drain. */
const DESTINATION_ICON: Record<MilkDestination, LucideIcon> = {
  bulk: Milk,
  calves: Baby,
  discard: Trash2,
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
      <Notice icon={Lock} title={t("work.blockedWithdrawal")} tone="danger">
        {t("milk.withdrawal")}
      </Notice>
    );
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">
        {t("milk.destination")}
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {MILK_DESTINATIONS.map((option) => {
          const Icon = DESTINATION_ICON[option];
          const chosen = value === option;
          return (
            <Button
              aria-pressed={chosen}
              key={option}
              variant={chosen ? "default" : "outline"}
              className="h-auto min-h-16 flex-col gap-1 px-2 py-2 text-sm whitespace-normal"
              onClick={() => onChange(option)}
            >
              <Icon aria-hidden className="size-5" />
              {t(`milk.${option}`)}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
};

/** A field with its name above it, where somebody reads it before they type. */
const FieldWithLabel = ({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string;
  label: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
  </div>
);

/** Two digits, as a date field writes a month, a day, an hour or a minute. */
const twoDigits = (part: number) => String(part).padStart(2, "0");

/** An instant as a `datetime-local` field holds it: the phone's own day and minute, no zone. */
const asLocalField = (value: boolean | number | string | undefined): string => {
  if (typeof value !== "string" || value === "") {
    return "";
  }
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) {
    return "";
  }
  return `${at.getFullYear()}-${twoDigits(at.getMonth() + 1)}-${twoDigits(at.getDate())}T${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`;
};

/** One piece of Evidence: a big number pad, a note, a choice, or the camera. A tick needs no
 *  control — confirming the Step is the tick. */
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
  const refused = useRefused();
  const id = useId();

  if (evidence.type === "tick") {
    return null;
  }

  if (evidence.type === "number") {
    const typed = String(value ?? "");
    return (
      <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <p
          aria-hidden
          className={cn(
            "text-center text-5xl font-bold tracking-tight tabular-nums",
            typed === "" && "text-muted-foreground/50"
          )}
        >
          {typed !== "" && Number.isFinite(Number(typed))
            ? new Intl.NumberFormat(
                language === "bn" ? "bn-BD" : "en-GB"
              ).format(Number(typed))
            : "০"}{" "}
          <span className="text-muted-foreground text-xl font-semibold">
            {evidence.unit?.bn}
          </span>
        </p>
        <Input
          inputMode="decimal"
          value={typed}
          onChange={(event) =>
            onValue(numberAsTyped(event.target.value).replaceAll("-", ""))
          }
          className="h-16 text-center text-3xl font-semibold tabular-nums md:h-16 md:text-3xl"
          aria-label={evidence.unit?.bn ?? t("work.confirm")}
        />
      </div>
    );
  }

  if (evidence.type === "choice") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {(evidence.choices ?? []).map((choice) => (
          <Button
            aria-pressed={value === choice.value}
            key={choice.value}
            variant={value === choice.value ? "default" : "outline"}
            className="h-auto min-h-14 py-2 text-base whitespace-normal"
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
      <FieldWithLabel htmlFor={id} label={t("work.when")}>
        <Input
          className="h-12 text-base"
          id={id}
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
      </FieldWithLabel>
    );
  }

  if (evidence.type === "note") {
    return (
      <FieldWithLabel htmlFor={id} label={t("work.note")}>
        <Input
          className="h-12 text-base"
          id={id}
          value={String(value ?? "")}
          onChange={(event) => onValue(event.target.value)}
        />
      </FieldWithLabel>
    );
  }

  return (
    <label
      className={cn(
        "has-[:focus-visible]:ring-ring flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3 text-base font-medium has-[:focus-visible]:ring-2",
        hasPhoto
          ? "border-success/40 bg-success-surface text-success"
          : "bg-muted/60 hover:bg-muted"
      )}
    >
      {hasPhoto ? (
        <Check aria-hidden className="size-5" />
      ) : (
        <Camera aria-hidden className="size-5" />
      )}
      {hasPhoto ? t("work.saved") : t("work.photo")}
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
            refused(error);
          }
        }}
        type="file"
      />
    </label>
  );
};

export const Route = createFileRoute("/_auth/work/$instanceId")({
  staticData: { focusedWork: true },
  component: WorkPage,
});
