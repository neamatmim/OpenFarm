import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CircleCheck,
  ClipboardCheck,
  Inbox,
  Milk,
  Warehouse,
} from "lucide-react";
import { useEffect } from "react";

import { ManagerQueue } from "@/components/home/manager-queue";
import { PenProgress } from "@/components/home/pen-progress";
import { VenturesAtWork } from "@/components/home/ventures-at-work";
import {
  EmptyState,
  Notice,
  Page,
  PageHeader,
  ProgressBar,
  RecordList,
  Section,
} from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage, useT } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/**
 * The screen the Manager runs the day from: the day's four figures, what needs them — a queue to each kind of thing,
 * loudest first — and beside it how the day is going pen by pen.
 *
 * Every number is a link. A count with no way to reach what it counts is a number people
 * stop believing, and a home screen full of those is a home screen nobody opens.
 */
const ManagerHome = () => {
  const t = useT();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const ensureDue = useMutation(orpc.instances.ensureDue.mutationOptions({}));
  const sweep = useMutation(orpc.alerts.sweep.mutationOptions({}));
  const digest = useMutation(orpc.alerts.digest.mutationOptions({}));
  const home = useQuery(orpc.home.manager.queryOptions());
  const me = useQuery(orpc.people.me.queryOptions());
  // Answering a Repeat Breeder is the Manager's, the Vet's or the Owner's.
  const mayAnswer =
    me.data?.roles.some(
      (role) => role === "owner" || role === "manager" || role === "vet"
    ) ?? false;

  // The Manager often opens this before anybody has opened Today, and the day's work is
  // raised by whoever opens the app first. Without this the screen would say the farm had
  // nothing to do at six in the morning, which is the one hour it is certainly wrong.
  const raise = ensureDue.mutateAsync;
  const tell = sweep.mutateAsync;
  const carry = digest.mutateAsync;
  useEffect(() => {
    const run = async () => {
      try {
        await raise();
        await tell();
        await carry();
        await queryClient.invalidateQueries({ queryKey: orpc.home.key() });
      } catch {
        // No signal: the screen shows what this phone last knew.
      }
    };
    void run();
  }, [raise, tell, carry, queryClient]);
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const penNames = new Map(
    (sheds.data ?? []).flatMap((shed) =>
      shed.pens.map((pen) => [pen.id, `${shed.name} / ${pen.name}`] as const)
    )
  );

  // Cached first, error second. A phone with no signal has the farm as it last knew it,
  // and a screen that throws that away to show the word "error" has taken away the only
  // thing it had — the sync status above already says how old it is.
  if (!home.data) {
    return (
      <Page>
        <PageHeader title={t("home.title")} />
        {home.isError ? (
          <Notice title={t("common.error")} tone="danger" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton className="h-32 rounded-xl" key={n} />
            ))}
          </div>
        )}
      </Page>
    );
  }
  const { queue, pens, tiles } = home.data;
  const waiting =
    queue.overdue.length +
    queue.signOff.length +
    queue.needsReview.length +
    queue.withdrawal.length +
    queue.meatWithdrawal.length +
    queue.repeatBreeders.length +
    queue.lowStock.length;
  const count = (n: number) => formatNumber(n, language);
  const donePercent =
    tiles.workRaised === 0
      ? 0
      : Math.round((tiles.workDone / tiles.workRaised) * 100);
  const workDone = (
    <Link className={FIGURE_LINK} search={{}} to="/today">
      {t("home.progress", {
        done: count(tiles.workDone),
        raised: count(tiles.workRaised),
      })}
    </Link>
  );
  const figures: Figure[] = [
    {
      label: t("home.workDone"),
      value: workDone,
      hint: <ProgressBar label={t("home.workDone")} value={donePercent} />,
      icon: ClipboardCheck,
    },
    {
      label: t("home.queue"),
      value: count(waiting),
      hint: waiting === 0 ? t("home.allClear") : t("home.waitingHint"),
      icon: Inbox,
      tone: waiting === 0 ? "success" : "warning",
    },
    {
      label: t("home.cowsHeld"),
      value: (
        <Link className={FIGURE_LINK} to="/animals">
          {count(tiles.underWithdrawal)}
        </Link>
      ),
      hint: t("home.withdrawal"),
      icon: Milk,
      tone: tiles.underWithdrawal > 0 ? "warning" : "neutral",
    },
    {
      label: t("home.pensWorking"),
      value: count(pens.length),
      hint: t("home.pens"),
      icon: Warehouse,
    },
  ];

  return (
    <Page>
      {/* No button to today's work here: it is in the sidebar, and the work-done figure below is a link to it. */}
      <PageHeader
        description={t("home.subtitle")}
        eyebrow={formatDate(new Date(), language, "date")}
        title={t("home.title")}
      />

      <SummaryFigures figures={figures} />

      {/* One column that shrinks to the phone: a grid's own column grows to its widest unbroken line, and a Tag Number
          beside a long date pushed both cards off the screen. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Section
          className="min-w-0 lg:col-span-2"
          description={waiting === 0 ? undefined : t("home.queueHint")}
          id="queue"
          title={t("home.queue")}
        >
          {waiting === 0 ? (
            <EmptyState
              bare
              description={t("home.allClearHint")}
              icon={CircleCheck}
              title={t("home.allClear")}
            />
          ) : (
            <ManagerQueue mayAnswer={mayAnswer} queue={queue} />
          )}
        </Section>

        <Section
          className="min-w-0 lg:sticky lg:top-20"
          description={t("home.pensHint")}
          id="pens"
          title={t("home.pens")}
        >
          {pens.length === 0 ? (
            <EmptyState bare icon={Warehouse} title={t("home.nothingRaised")} />
          ) : (
            <RecordList>
              {pens.map((pen) => (
                <PenProgress
                  key={pen.penId}
                  name={penNames.get(pen.penId) ?? pen.penId}
                  pen={pen}
                />
              ))}
            </RecordList>
          )}
        </Section>

        <VenturesAtWork />
      </div>
    </Page>
  );
};

/** A figure that is a way to the list it counts. */
const FIGURE_LINK =
  "focus-visible:ring-ring rounded-md underline-offset-4 outline-none hover:underline focus-visible:ring-2";

export const Route = createFileRoute("/_auth/home")({
  beforeLoad: onlyFor("runsTheFarm"),
  component: ManagerHome,
});
