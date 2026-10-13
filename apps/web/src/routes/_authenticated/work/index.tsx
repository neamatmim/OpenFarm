import type { SopContent } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  ArrowRight,
  CircleCheck,
  ChevronRight,
  ClipboardList,
  Clock,
  Hand,
  MapPin,
  Pin,
  Undo2,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AlertList } from "@/components/alert-list";
import type { Tone } from "@/components/page";
import {
  EmptyState,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { RaiseWork } from "@/components/raise-work";
import { AboutHerLines, SopName } from "@/components/work/work-board";
import { WorkDeliveryNotice } from "@/components/work/work-delivery-notice";
import { useLanguage } from "@/i18n/language-provider";
import { useFinishedHere } from "@/lib/finished-here";
import { refreshTheScreen } from "@/lib/refresh";
import { useNow } from "@/lib/use-now";
import {
  doneOnTheDay,
  doneToday,
  freeFor,
  groupTheDay,
  nextInPen,
} from "@/lib/work-groups";
import { placeOfWork } from "@/lib/work-place";
import { orpc } from "@/utils/orpc";

type Work = Awaited<ReturnType<typeof orpc.work.today.call>>[number];
type Done = Awaited<
  ReturnType<typeof orpc.work.doneToday.call>
>["done"][number];

/** Where a piece of work stands for the person holding the phone, as one badge: its word, its icon, its color. */
interface Standing {
  tone: Tone;
  icon: LucideIcon;
  label: string;
}

/** When work is due: the time alone for today's work, the date as well for anything older. */
const dueWhen = (due: Date, language: "bn" | "en") =>
  farmDayOf(due) === farmDayOf(new Date())
    ? formatDate(due, language, "time")
    : formatDate(due, language, "dateTime");

/** Whose the work is, as the person holding the phone sees it: somebody else's — pinned to them or taken by them —
 *  theirs already, or sent back; nothing to say of work simply due. Free work is the kind the tap starts. */
const useStanding = () => {
  const { t } = useLanguage();
  const me = useQuery(orpc.people.me.queryOptions());
  return (work: Work): { standing: Standing | null; free: boolean } => {
    const mine = me.data?.id;
    // The one rule for free work, as the next job offered and the bar's count read it.
    if (!freeFor(work, mine) && work.assignedTo && work.assignedTo !== mine) {
      return {
        free: false,
        standing: {
          tone: "warning",
          icon: Pin,
          label: t("work.pinnedToSomeone"),
        },
      };
    }
    if (!freeFor(work, mine)) {
      return {
        free: false,
        standing: {
          tone: "warning",
          icon: UserRound,
          label: t("work.takenBy"),
        },
      };
    }
    if (work.claimedBy && work.claimedBy === mine) {
      return {
        free: true,
        standing: { tone: "info", icon: Hand, label: t("work.claimed") },
      };
    }
    if (work.state === "sent_back") {
      return {
        free: true,
        standing: {
          tone: "warning",
          icon: Undo2,
          label: t("work.stateSentBack"),
        },
      };
    }
    return { free: true, standing: null };
  };
};

/** Work raised again after it was put off: said, with the day the work it follows was first due. Nothing for the rest,
 *  or for an answer kept from before work said so. */
const PutOffLine = ({ work }: { work: Work }) => {
  const { t, language } = useLanguage();
  const again = work.putOff;
  if (!again) {
    return null;
  }
  return (
    <p className="text-warning text-sm">
      {again.firstDueAt
        ? t("work.putOffSince", {
            day: formatDate(new Date(again.firstDueAt), language, "date"),
          })
        : t("work.putOff")}
    </p>
  );
};

/**
 * One piece of work as a card the whole of which is the tap: what it is, where and when, where it stands, and what the
 * tap does — start it, or open work somebody else holds. Late work is edged in the danger color and says so first.
 */
const WorkCard = ({
  work,
  standing,
  free,
  quiet = false,
}: {
  work: Work;
  standing: Standing | null;
  free: boolean;
  /** Wanted later today: startable, but drawn quieter than what is wanted now. */
  quiet?: boolean;
}) => {
  const { t, language } = useLanguage();
  const content = work.version.content as SopContent;
  return (
    <Link
      className={cn(
        "surface group hover:border-primary/40 focus-visible:ring-ring flex min-h-24 items-center gap-3 p-4 transition-colors duration-150 outline-none focus-visible:ring-2 sm:gap-4",
        work.overdue && "border-danger/40"
      )}
      params={{ instanceId: work.id }}
      // Start means take it: the work page claims it as it opens.
      search={free ? { start: true } : {}}
      to="/work/$instanceId"
    >
      <span
        className={cn(
          "hidden size-12 shrink-0 place-items-center rounded-xl sm:grid",
          work.overdue
            ? "bg-danger-surface text-danger"
            : "bg-secondary text-secondary-foreground"
        )}
      >
        {work.overdue ? (
          <AlarmClock aria-hidden className="size-6" />
        ) : (
          <ClipboardList aria-hidden className="size-6" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="line-clamp-2 text-lg font-semibold">
          <SopName name={content.name} />
        </p>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            {placeOfWork(work.pen, t("work.wholeFarm"))}
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
            <Clock aria-hidden className="size-3.5 shrink-0" />
            {t("work.due", { time: dueWhen(new Date(work.dueAt), language) })}
          </span>
        </p>
        <AboutHerLines about={work} />
        <PutOffLine work={work} />
        {/* Work simply due says so with its time; a badge is kept for what the time does not say — late, and whose. */}
        {work.overdue || standing ? (
          <div className="flex flex-wrap gap-1.5">
            {work.overdue ? (
              <StatusBadge icon={AlarmClock} tone="danger">
                {t("work.overdue")}
              </StatusBadge>
            ) : null}
            {standing ? (
              <StatusBadge icon={standing.icon} tone={standing.tone}>
                {standing.label}
              </StatusBadge>
            ) : null}
          </div>
        ) : null}
      </div>
      <span
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium",
          free && !quiet
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {free ? t("work.claim") : t("work.open")}
        <ChevronRight aria-hidden className="size-4" />
      </span>
    </Link>
  );
};

/** A run of work cards, one column on a phone and two on a desk. */
const WorkCards = ({
  work,
  quiet = false,
}: {
  work: readonly Work[];
  quiet?: boolean;
}) => {
  const standingOf = useStanding();
  return (
    // One column held to the phone's width: left to itself the grid's column grows to the card's longest line.
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {work.map((instance) => {
        const { standing, free } = standingOf(instance);
        return (
          <li className="min-w-0" key={instance.id}>
            <WorkCard
              free={free}
              quiet={quiet}
              standing={standing}
              work={instance}
            />
          </li>
        );
      })}
    </ul>
  );
};

/** One finished piece of work: what, where, and when it was done — or that this phone finished it and the farm has
 *  yet to hear. */
const DoneLine = ({ done }: { done: Done }) => {
  const { t, language } = useLanguage();
  return (
    <li className="flex min-h-11 items-center gap-3 py-2">
      <CircleCheck aria-hidden className="text-success size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">
          <SopName name={done.name} />
        </span>
        <span className="text-muted-foreground truncate text-sm">
          {placeOfWork(done.pen, t("work.wholeFarm"))}
        </span>
      </div>
      <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
        {done.completedAt
          ? t("work.doneAt", {
              time: formatDate(new Date(done.completedAt), language, "time"),
            })
          : t("work.doneOnPhone")}
      </span>
    </li>
  );
};

/** The work just finished, as the list's done half has it before the farm has heard: no time yet. */
const doneHere = (work: Work): Done => ({
  id: work.id,
  name: (work.version.content as SopContent).name,
  penId: work.penId,
  pen: work.pen,
  completedAt: null,
});

/** The next job where the person already is, offered the moment the last one is finished: one tap to start it. */
const NextCard = ({ next, onOpen }: { next: Work; onOpen: () => void }) => {
  const { t } = useLanguage();
  const content = next.version.content as SopContent;
  return (
    <Link
      className="surface border-primary/40 hover:border-primary focus-visible:ring-ring flex min-h-20 items-center gap-3 p-4 transition-colors duration-150 outline-none focus-visible:ring-2"
      onClick={onOpen}
      params={{ instanceId: next.id }}
      search={{ start: true }}
      to="/work/$instanceId"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-muted-foreground text-sm">
          {t("work.next", {
            place: placeOfWork(next.pen, t("work.wholeFarm")),
          })}
        </span>
        <span className="line-clamp-2 text-lg font-semibold">
          <SopName name={content.name} />
        </span>
      </div>
      <span className="bg-primary text-primary-foreground inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium">
        {t("work.claim")}
        <ArrowRight aria-hidden className="size-4" />
      </span>
    </Link>
  );
};

/** One Pen to choose in the row over the list, with how much work it has today. */
interface PenChoice {
  id: string;
  name: string;
  place: string;
  count: number;
}

/** The Pens today's work is in, in the order their first work falls due. Work about the whole farm is in none. */
const pensOf = (work: Work[]): PenChoice[] => {
  const pens = new Map<string, PenChoice>();
  for (const one of work) {
    if (one.penId === null || one.pen === null) {
      continue;
    }
    const known = pens.get(one.penId);
    if (known) {
      known.count += 1;
    } else {
      pens.set(one.penId, {
        id: one.penId,
        name: one.pen.name,
        place: placeOfWork(one.pen, ""),
        count: 1,
      });
    }
  }
  return [...pens.values()];
};

const CHIP =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9";

/**
 * The Pens today's work is in, as a row of chips held under the top bar on a phone while the list scrolls: one Pen's
 * work at a tap, or all of it again. The chosen Pen is in the address, which is where a screen that sent somebody here
 * about one Pen put it.
 */
const PenChips = ({
  pens,
  chosen,
  total,
}: {
  pens: PenChoice[];
  chosen: string | undefined;
  total: number;
}) => {
  const { t, language } = useLanguage();
  return (
    <nav
      aria-label={t("work.penFilter")}
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-14 z-20 -mx-4 -my-2 overflow-x-auto px-4 py-2 backdrop-blur md:static md:mx-0 md:my-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none"
    >
      <ul className="flex gap-2 md:flex-wrap">
        <li>
          <Link
            aria-current={chosen ? undefined : "page"}
            className={cn(
              CHIP,
              chosen
                ? "bg-card hover:bg-muted"
                : "border-primary bg-primary text-primary-foreground"
            )}
            replace
            search={{}}
            to="/work"
          >
            {t("work.allPens")}
            <span className="tabular-nums opacity-80">
              {formatNumber(total, language)}
            </span>
          </Link>
        </li>
        {pens.map((pen) => (
          <li key={pen.id}>
            <Link
              aria-current={chosen === pen.id ? "page" : undefined}
              className={cn(
                CHIP,
                chosen === pen.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted"
              )}
              replace
              search={{ pen: pen.id }}
              title={pen.place}
              to="/work"
            >
              {pen.name}
              <span className="tabular-nums opacity-80">
                {formatNumber(pen.count, language)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};

/** Raise whatever the day needs — the work, then the notices about work already late — when someone opens the app. */
const useRaiseTheDay = (
  me: { roles: string[]; scopes?: { vet?: { kind: string } } } | undefined
) => {
  // A Vet here only for a visit has their Cases and nothing of the farm's own day to raise: the farm refuses them it,
  // so the phone does not ask.
  const onlyVisiting =
    me?.roles.length === 1 && me.scopes?.vet?.kind === "cases";
  const raisesTheDay = me !== undefined && !onlyVisiting;
  const queryClient = useQueryClient();
  const ensureDue = useMutation(orpc.work.ensureDue.mutationOptions({}));
  const sweep = useMutation(orpc.alerts.sweep.mutationOptions({}));
  const digest = useMutation(orpc.alerts.digest.mutationOptions({}));
  // Raise whatever the day needs — the work, then the notices about work already late —
  // when someone opens the app. Both are idempotent, so running them on every open is safe,
  // and harmless when the phone has no signal.
  const raise = ensureDue.mutateAsync;
  const tell = sweep.mutateAsync;
  const carry = digest.mutateAsync;
  useEffect(() => {
    if (!raisesTheDay) {
      return;
    }
    const run = async () => {
      try {
        await raise();
        await tell();
        // And the quieter notices, if a digest time has come round. Whoever opens the app
        // first carries the farm's post; a timer on the deploy host can do it as well, and
        // neither is troubled by the other doing it first.
        await carry();
        // Once, when the last has gone: these three are the saves that do not refresh on their own.
        refreshTheScreen(queryClient);
      } catch {
        // no signal: the list shows what the phone already knows about
      }
    };
    void run();
  }, [raisesTheDay, raise, tell, carry, queryClient]);
};

/** What is due now, for the Pens this person works: the notices first, as one line, then the work, a card each, and
 *  a row of Pens to narrow it to one. */
const noPenAssignment = (
  person: Awaited<ReturnType<typeof orpc.people.me.call>> | undefined
): boolean => {
  const scope = person?.scopes.staff;
  return (
    person?.roles.length === 1 &&
    scope?.kind === "pens" &&
    scope.penIds.length === 0
  );
};

/**
 * The work just finished and its Pen, carried here from the work page in the address and taken out of it at once: the
 * card offering what comes next is for the moment after a Finish, and a reload — or the same list opened next morning
 * from history — must not offer it again.
 */
const useJustFinished = (): [
  { finishedId: string; penId: string | null } | null,
  () => void,
] => {
  const { after, nextIn } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // Read from the address once, as the list opens; the address is emptied of it straight after.
  const [finished, setFinished] = useState(() =>
    after ? { finishedId: after, penId: nextIn ?? null } : null
  );
  useEffect(() => {
    if (after !== undefined || nextIn !== undefined) {
      void navigate({
        replace: true,
        search: (previous) => (previous.pen ? { pen: previous.pen } : {}),
      });
    }
  }, [after, nextIn, navigate]);
  // Once the card is taken up, it is not offered again on the way back.
  return [finished, () => setFinished(null)];
};

/**
 * What was done today in the list's Pen, or in all of them: this phone's finished work first, then the farm's answer —
 * held to today, so an answer kept overnight says nothing — and how much in all, the farm counting beyond the latest it
 * lists.
 */
const useDoneToday = (
  pen: string | undefined,
  finishedHere: readonly Work[],
  now: Date
): { done: Done[]; count: number } => {
  const told = useQuery(orpc.work.doneToday.queryOptions());
  const answer = doneOnTheDay(told.data, now);
  const listed = answer.done.filter((one) => !pen || one.penId === pen);
  const done = doneToday(listed, finishedHere.map(doneHere));
  // One Pen's is only what is listed; the farm's count is of every Pen.
  const toldCount = pen ? listed.length : answer.count;
  return { done, count: toldCount + done.length - listed.length };
};

/** How much is still owed today, and how much of it is late: nothing said when nothing is owed. */
const OwedBadges = ({ owed, late }: { owed: number; late: number }) => {
  const { t, language } = useLanguage();
  if (owed === 0) {
    return null;
  }
  return (
    <>
      <StatusBadge tone="neutral">
        {t("work.count", { count: formatNumber(owed, language) })}
      </StatusBadge>
      {late > 0 ? (
        <StatusBadge icon={AlarmClock} tone="danger">
          {t("work.lateCount", { count: formatNumber(late, language) })}
        </StatusBadge>
      ) : null}
    </>
  );
};

const TodayPage = () => {
  const { t, language } = useLanguage();
  const { pen } = Route.useSearch();
  const work = useQuery(
    orpc.work.today.queryOptions({ input: pen ? { penId: pen } : {} })
  );
  // Everything this person works today, for the row of Pens: the same question as the list when no Pen is chosen.
  const everything = useQuery(orpc.work.today.queryOptions({ input: {} }));
  const finishedHere = useFinishedHere();
  const me = useQuery(orpc.people.me.queryOptions());
  const runsTheFarm = (me.data?.roles ?? []).some(
    (role) => role === "owner" || role === "manager"
  );
  const [justFinished, takenUp] = useJustFinished();
  const now = useNow();

  useRaiseTheDay(me.data);

  const day = groupTheDay(work.data ?? [], { now, finishedHere });
  const late = day.now.filter((instance) => instance.overdue).length;
  const done = useDoneToday(pen, day.finishedHere, now);
  // Just finished something: the next free work where the person already is.
  const next = justFinished
    ? nextInPen(everything.data ?? [], {
        ...justFinished,
        me: me.data?.id,
        now,
        finishedHere,
      })
    : null;
  const pens = pensOf(everything.data ?? []);
  // A row of one Pen is no choice, unless somebody arrived here narrowed to it and wants the rest back.
  const choosing = pens.length > 1 || pen !== undefined;

  return (
    <Page>
      <PageHeader
        actions={runsTheFarm ? <RaiseWork key={pen} penId={pen} /> : undefined}
        description={t("work.subtitle")}
        eyebrow={formatDate(new Date(), language, "date")}
        meta={<OwedBadges late={late} owed={day.now.length} />}
        title={t("work.title")}
      />
      <AlertList />
      <WorkDeliveryNotice />
      {choosing ? (
        <PenChips
          chosen={pen}
          pens={pens}
          total={everything.data?.length ?? 0}
        />
      ) : null}
      {work.isPending && !work.data ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((n) => (
            <Skeleton className="h-24 rounded-xl" key={n} />
          ))}
        </div>
      ) : null}
      {next ? <NextCard next={next} onOpen={takenUp} /> : null}
      {work.data ? (
        <TheDay day={day} done={done} unassigned={noPenAssignment(me.data)} />
      ) : null}
    </Page>
  );
};

/** What is owed now, what comes later, and what is done — or, with nothing owed, whether the day is done or nothing
 *  was ever raised. */
const TheDay = ({
  day,
  done,
  unassigned,
}: {
  day: { now: Work[]; later: Work[] };
  done: { done: Done[]; count: number };
  unassigned: boolean;
}) => {
  const { t, language } = useLanguage();
  const owed = day.now.length + day.later.length;
  const doneCount = formatNumber(done.count, language);
  return (
    <>
      {day.now.length > 0 ? (
        <Section plain title={t("work.group.now")}>
          <WorkCards work={day.now} />
        </Section>
      ) : null}
      {day.later.length > 0 ? (
        <Section
          description={t("work.group.laterHint")}
          plain
          title={t("work.group.later")}
        >
          <WorkCards quiet work={day.later} />
        </Section>
      ) : null}
      {owed === 0 && done.count > 0 ? (
        <EmptyState
          description={t("work.allDoneHint", { count: doneCount })}
          icon={CircleCheck}
          title={t("work.allDone")}
        />
      ) : null}
      {owed === 0 && done.count === 0 ? (
        <EmptyState
          description={t(unassigned ? "work.unassignedHint" : "work.noneHint")}
          icon={ClipboardList}
          title={t(unassigned ? "work.unassigned" : "work.none")}
        />
      ) : null}
      {done.count > 0 ? (
        <Section title={t("work.group.done", { count: doneCount })}>
          <ul className="divide-border -my-2 divide-y">
            {done.done.map((one) => (
              <DoneLine done={one} key={one.id} />
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
};

/** What the day's list was asked for: one Pen, and — just after a Finish — the work finished and its Pen, to offer
 *  what comes next there. */
interface TodaySearch {
  pen?: string | undefined;
  after?: string | undefined;
  nextIn?: string | undefined;
}

export const Route = createFileRoute("/_authenticated/work/")({
  component: TodayPage,
  /** One Pen's day, when somebody arrived here from a screen that was talking about it.
   *  Absent is the whole of what this person works, which is what a milker wants. */
  validateSearch: (search: Record<string, unknown>): TodaySearch => ({
    ...(typeof search.pen === "string" ? { pen: search.pen } : {}),
    ...(typeof search.after === "string" ? { after: search.after } : {}),
    ...(typeof search.nextIn === "string" ? { nextIn: search.nextIn } : {}),
  }),
});
