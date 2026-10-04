// The work page's board: its header, its tiles and step rows, who holds it, and how it closes.

import type { Step } from "@OpenFarm/domain";
import { heldFromThem } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  CheckCheck,
  CircleDashed,
  ChevronRight,
  Lock,
  MapPin,
  Pill,
  SkipForward,
  SprayCan,
  Tag,
} from "lucide-react";
import type { ReactNode } from "react";

import { AnimalPhoto } from "@/components/animal-photo";
import { BackLink, Notice, StatusBadge, StickyAction } from "@/components/page";
import type {
  Animal,
  Completion,
  Standing,
} from "@/components/work/work-types";
import { useLanguage } from "@/i18n/language-provider";
import { placeOfWork } from "@/lib/work-place";
import { orpc } from "@/utils/orpc";

/** A Playbook entry's name in the language the page is showing, Bangla where it has no English. */
export const SopName = ({ name }: { name: { bn: string; en?: string } }) => {
  const { language } = useLanguage();
  return <span>{language === "en" && name.en ? name.en : name.bn}</span>;
};

/** The way back to the day's list, big enough for a thumb in a glove. It stands in a column with spacing of its own
 *  rather than above a page's header, so it keeps no margin below. */
export const BackToToday = () => {
  const { t } = useLanguage();
  return (
    <BackLink className="mb-0 md:mb-0" search={{}} to="/work">
      {t("nav.today")}
    </BackLink>
  );
};

/** Where the work is — the shed and the Pen, or the whole farm — said once under its name. Nothing is said when the
 *  phone's cached copy of the work is older than the farm's saying so. */
export const PlaceLine = ({
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

/** What the work says about the one animal it was raised for. */
export interface AboutHer {
  animal?: { tagNumber: string } | null;
  dose?: {
    number: number;
    of: number;
    drug: { bn: string; en: string | null };
    amount: string;
    route: string;
  } | null;
}

/**
 * The animal the work is for, by her Tag Number, and for a dose what goes into her: the drug, how much, how, and
 * which dose of the course. Said as large as the work's place, because a dose read off a Pen name goes to whichever
 * cow is nearest. Nothing for work about a Pen, or a phone's copy older than the farm's saying so.
 */
export const AboutHerLines = ({
  about,
  className,
}: {
  about: AboutHer;
  className?: string;
}) => {
  const { t, language } = useLanguage();
  const { animal, dose } = about;
  if (!animal && !dose) {
    return null;
  }
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {animal ? (
        <p className="inline-flex items-center gap-1.5 text-base font-semibold">
          <Tag aria-hidden className="size-4 shrink-0" />
          {t("work.aboutTag", { tag: animal.tagNumber })}
        </p>
      ) : null}
      {dose ? (
        <>
          <p className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Pill aria-hidden className="size-4 shrink-0" />
            {language === "en" && dose.drug.en ? dose.drug.en : dose.drug.bn}
          </p>
          <p className="text-sm">
            {dose.amount} · {t(`route.${dose.route}` as MessageKey)} ·{" "}
            <span className="text-muted-foreground tabular-nums">
              {t("work.doseOf", {
                number: formatDigits(dose.number, language),
                of: formatDigits(dose.of, language),
              })}
            </span>
          </p>
        </>
      ) : null}
    </div>
  );
};

/** Who else holds this work — pinned to them, or claimed by them — or nobody. Somebody else's work is read here, not
 *  done: the farm takes an entry on it only from them, so a Claim or a tile that opens would be a refusal waiting to
 *  happen. Not known until the phone knows who it is, and then only said of someone else.
 *
 *  Once it is finished, nobody holds it from those who run the farm: the Owner and the Manager put a finished Step
 *  right by a Correction, whoever did it — a Pen that did not count right is counted again by the Manager. */
export const useHeldByOther = (
  work:
    | { heldBy: { id: string; name: string } | null; state: string }
    | undefined
): { id: string; name: string } | null => {
  const me = useQuery(orpc.people.me.queryOptions());
  if (!(work && me.data)) {
    return null;
  }
  return heldFromThem(work.heldBy, me.data, work.state);
};

/** Work not yet begun: the button to begin it — or, where it is pinned to somebody else, whose it is. */
export const ClaimOrWhose = ({
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
export const HeldByNotice = ({
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
export const BoardFoot = ({
  hidden,
  children,
}: {
  hidden: boolean;
  children: ReactNode;
}) => (hidden ? null : <StickyAction>{children}</StickyAction>);

/** One part of the board — the Steps done once, the Pen's animals — under a quiet heading of its own. */
export const BoardPart = ({
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
export const NextAnimal = ({
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
    text: "bg-success text-success-foreground",
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
export const roundOf = (
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

/**
 * After an animal's entry, the next one the round has not reached — from the one just done onwards, then from the
 * start — or nothing once every one is done. Read from the work as the phone now holds it, the entry just made in it.
 */
export const nextInRound = (
  work:
    | {
        content: { steps: Pick<Step, "id" | "repeatPerAnimal">[] };
        animals: { id: string }[];
        completions: { stepId: string; animalId: string | null }[];
      }
    | undefined,
  after: string | null | undefined
): string | null => {
  const step = work?.content.steps.find((one) => one.repeatPerAnimal);
  if (!work || !step || !after) {
    return null;
  }
  const done = new Set(
    work.completions
      .filter((one) => one.stepId === step.id)
      .map((one) => one.animalId)
  );
  const from = work.animals.findIndex((one) => one.id === after);
  const inTurn = [
    ...work.animals.slice(from + 1),
    ...work.animals.slice(0, from + 1),
  ];
  return inTurn.find((one) => !done.has(one.id))?.id ?? null;
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
export const WorkHeader = ({
  name,
  pen,
  about,
  tally,
}: {
  name: { bn: string; en?: string };
  pen: { name: string; shed: { name: string } } | null | undefined;
  about: AboutHer;
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
        <h1 className="text-xl font-semibold md:text-2xl">
          <SopName name={name} />
        </h1>
        <PlaceLine pen={pen} />
        <AboutHerLines about={about} className="mt-1" />
      </div>
      {tally && total > 0 ? (
        <div className="surface flex flex-col gap-3 p-3.5 md:p-4">
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
export const StepRow = ({
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
        "surface hover:border-primary/40 focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 p-3 text-left transition-[border-color,box-shadow] duration-150 outline-none focus-visible:ring-2",
        done && "border-success/30 bg-success-surface/60"
      )}
      onClick={onOpen}
      type="button"
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full",
          done
            ? "bg-success text-success-foreground"
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
export const AnimalTile = ({
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
        "surface hover:border-primary/40 focus-visible:ring-ring relative flex min-h-32 w-full flex-col items-center justify-center gap-2 p-3 pt-4 text-center transition-colors duration-150 outline-none focus-visible:ring-2 active:translate-y-px",
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

/** The closing Step — the bulk total — appears only when every chip and tile is done. */
export const ClosingAction = ({
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
      className="h-auto min-h-14 w-full py-2 text-lg whitespace-normal md:h-auto"
      variant="outline"
      onClick={() => onOpen(closingStep)}
    >
      {closingStep.text.bn}
      <ChevronRight data-icon="inline-end" />
    </Button>
  );
};
