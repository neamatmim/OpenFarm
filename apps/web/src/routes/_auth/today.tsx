import type { SopContent } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlarmClock,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Clock,
  MapPin,
} from "lucide-react";
import { useEffect } from "react";

import { AlertList } from "@/components/alert-list";
import { EmptyState, Page, PageHeader, StatusBadge } from "@/components/page";
import { RaiseWork } from "@/components/raise-work";
import { useLanguage } from "@/i18n/language-provider";
import { placeOfWork } from "@/lib/work-place";
import { orpc } from "@/utils/orpc";

/** What the tap will actually do: start it, or say who has it. */
const useStatusLabel = () => {
  const { t } = useLanguage();
  const me = useQuery(orpc.people.me.queryOptions());
  return (instance: {
    claimedBy: string | null;
    assignedTo: string | null;
  }) => {
    const mine = me.data?.id;
    if (instance.assignedTo && instance.assignedTo !== mine) {
      return t("work.pinnedTo", { name: "" }).trim();
    }
    if (instance.claimedBy && instance.claimedBy !== mine) {
      return t("work.takenBy");
    }
    return t("work.claim");
  };
};

/** When work is due: the time alone for today's work, the date as well for anything older. */
const dueWhen = (due: Date, language: "bn" | "en") =>
  farmDayOf(due) === farmDayOf(new Date())
    ? new Intl.DateTimeFormat(language === "bn" ? "bn-BD" : "en-GB", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Dhaka",
      }).format(due)
    : formatDate(due, language, "dateTime");

/** What is due now, for the Pens this person works. */
const TodayPage = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const ensureDue = useMutation(orpc.instances.ensureDue.mutationOptions({}));
  const sweep = useMutation(orpc.alerts.sweep.mutationOptions({}));
  const digest = useMutation(orpc.alerts.digest.mutationOptions({}));
  const { pen } = Route.useSearch();
  const work = useQuery(
    orpc.instances.today.queryOptions({ input: pen ? { penId: pen } : {} })
  );
  const statusOf = useStatusLabel();
  const me = useQuery(orpc.people.me.queryOptions());
  const runsTheFarm = (me.data?.roles ?? []).some(
    (role) => role === "owner" || role === "manager"
  );

  // Raise whatever the day needs — the work, then the notices about work already late —
  // when someone opens the app. Both are idempotent, so running them on every open is safe,
  // and harmless when the phone has no signal.
  const raise = ensureDue.mutateAsync;
  const tell = sweep.mutateAsync;
  const carry = digest.mutateAsync;
  useEffect(() => {
    const run = async () => {
      try {
        await raise();
        await tell();
        // And the quieter notices, if a digest time has come round. Whoever opens the app
        // first carries the farm's post; a timer on the deploy host can do it as well, and
        // neither is troubled by the other doing it first.
        await carry();
        await queryClient.invalidateQueries({ queryKey: orpc.instances.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.alerts.key() });
      } catch {
        // no signal: the list shows what the phone already knows about
      }
    };
    void run();
  }, [raise, tell, carry, queryClient]);

  const items = work.data ?? [];
  const late = items.filter((instance) => instance.overdue).length;

  return (
    <Page>
      <PageHeader
        actions={runsTheFarm ? <RaiseWork /> : undefined}
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
                <StatusBadge tone="danger">
                  {t("work.lateCount", { count: formatNumber(late, language) })}
                </StatusBadge>
              ) : null}
            </>
          ) : null
        }
        title={t("work.title")}
      />
      <AlertList />
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
            const content = instance.version.content as SopContent;
            const status = statusOf(instance);
            const free = status === t("work.claim");
            return (
              <li key={instance.id}>
                <Link
                  className={cn(
                    "group bg-card hover:border-primary/40 focus-visible:ring-ring flex min-h-24 items-center gap-4 rounded-xl border p-4 shadow-[0_1px_2px_0_oklch(0.2_0.02_160/0.05)] transition-[border-color,box-shadow] duration-150 outline-none hover:shadow-md focus-visible:ring-2",
                    instance.overdue && "border-danger/35"
                  )}
                  params={{ instanceId: instance.id }}
                  to="/work/$instanceId"
                >
                  <span
                    className={cn(
                      "grid size-12 shrink-0 place-items-center rounded-xl",
                      instance.overdue
                        ? "bg-danger-surface text-danger"
                        : "bg-secondary text-secondary-foreground"
                    )}
                  >
                    {instance.overdue ? (
                      <AlarmClock aria-hidden className="size-6" />
                    ) : (
                      <ClipboardList aria-hidden className="size-6" />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="line-clamp-2 text-lg font-semibold">
                      {content.name.bn}
                    </p>
                    <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="inline-flex items-center gap-1">
                        <MapPin aria-hidden className="size-3.5" />
                        {placeOfWork(instance.pen, t("work.wholeFarm"))}
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock aria-hidden className="size-3.5" />
                        {t("work.due", {
                          time: dueWhen(new Date(instance.dueAt), language),
                        })}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {instance.overdue ? (
                        <StatusBadge tone="danger">
                          {t("work.overdue")}
                        </StatusBadge>
                      ) : null}
                      {free ? null : (
                        <StatusBadge tone="warning">{status}</StatusBadge>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium",
                      free
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {free ? status : t("work.open")}
                    <ChevronRight aria-hidden className="size-4" />
                  </span>
                </Link>
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
