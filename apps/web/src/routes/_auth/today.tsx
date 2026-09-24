import type { SopContent } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Clock,
  Hand,
  MapPin,
  Pin,
  Undo2,
  UserRound,
} from "lucide-react";
import { useEffect } from "react";

import { AlertList } from "@/components/alert-list";
import type { Tone } from "@/components/page";
import { EmptyState, Page, PageHeader, StatusBadge } from "@/components/page";
import { RaiseWork } from "@/components/raise-work";
import { useLanguage } from "@/i18n/language-provider";
import { refreshTheScreen } from "@/lib/refresh";
import { placeOfWork } from "@/lib/work-place";
import { orpc } from "@/utils/orpc";

type Work = Awaited<ReturnType<typeof orpc.instances.today.call>>[number];

/** Where a piece of work stands for the person holding the phone, as one badge: its word, its icon, its colour. */
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
    if (work.assignedTo && work.assignedTo !== mine) {
      return {
        free: false,
        standing: {
          tone: "warning",
          icon: Pin,
          label: t("work.pinnedTo", { name: "" }).trim(),
        },
      };
    }
    if (work.claimedBy && work.claimedBy !== mine) {
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

/**
 * One piece of work as a card the whole of which is the tap: what it is, where and when, where it stands, and what the
 * tap does — start it, or open work somebody else holds. Late work is edged in the danger colour and says so first.
 */
const WorkCard = ({
  work,
  standing,
  free,
}: {
  work: Work;
  standing: Standing | null;
  free: boolean;
}) => {
  const { t, language } = useLanguage();
  const content = work.version.content as SopContent;
  return (
    <Link
      className={cn(
        "group bg-card hover:border-primary/40 focus-visible:ring-ring flex min-h-24 items-center gap-3 rounded-xl border p-4 shadow-(--surface-shadow) transition-colors duration-150 outline-none focus-visible:ring-2 sm:gap-4",
        work.overdue && "border-danger/40"
      )}
      params={{ instanceId: work.id }}
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
        <p className="line-clamp-2 text-lg font-semibold">{content.name.bn}</p>
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
          free
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
            to="/today"
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
              to="/today"
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
  const ensureDue = useMutation(orpc.instances.ensureDue.mutationOptions({}));
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
const TodayPage = () => {
  const { t, language } = useLanguage();
  const { pen } = Route.useSearch();
  const work = useQuery(
    orpc.instances.today.queryOptions({ input: pen ? { penId: pen } : {} })
  );
  // Everything this person works today, for the row of Pens: the same question as the list when no Pen is chosen.
  const everything = useQuery(orpc.instances.today.queryOptions({ input: {} }));
  const standingOf = useStanding();
  const me = useQuery(orpc.people.me.queryOptions());
  const runsTheFarm = (me.data?.roles ?? []).some(
    (role) => role === "owner" || role === "manager"
  );

  useRaiseTheDay(me.data);

  const items = work.data ?? [];
  const late = items.filter((instance) => instance.overdue).length;
  const pens = pensOf(everything.data ?? []);
  // A row of one Pen is no choice, unless somebody arrived here narrowed to it and wants the rest back.
  const choosing = pens.length > 1 || pen !== undefined;

  return (
    <Page>
      <PageHeader
        actions={runsTheFarm ? <RaiseWork key={pen} penId={pen} /> : undefined}
        description={t("work.subtitle")}
        eyebrow={formatDate(new Date(), language, "date")}
        meta={
          items.length > 0 ? (
            <>
              <StatusBadge tone="neutral">
                {t("work.count", {
                  count: formatNumber(items.length, language),
                })}
              </StatusBadge>
              {late > 0 ? (
                <StatusBadge icon={AlarmClock} tone="danger">
                  {t("work.lateCount", { count: formatNumber(late, language) })}
                </StatusBadge>
              ) : null}
            </>
          ) : null
        }
        title={t("work.title")}
      />
      <AlertList />
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
      {items.length ? (
        // One column held to the phone's width: left to itself the grid's column grows to the card's longest line.
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((instance) => {
            const { standing, free } = standingOf(instance);
            return (
              <li className="min-w-0" key={instance.id}>
                <WorkCard free={free} standing={standing} work={instance} />
              </li>
            );
          })}
        </ul>
      ) : null}
      {work.data && items.length === 0 ? (
        <EmptyState
          description={t("work.noneHint")}
          icon={CircleCheck}
          title={t("work.none")}
        />
      ) : null}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/today")({
  component: TodayPage,
  /** One Pen's day, when somebody arrived here from a screen that was talking about it.
   *  Absent is the whole of what this person works, which is what a milker wants. */
  validateSearch: (
    search: Record<string, unknown>
  ): { pen?: string | undefined } =>
    typeof search.pen === "string" ? { pen: search.pen } : {},
});
