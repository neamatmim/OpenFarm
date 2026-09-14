import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  Inbox,
  Milk,
  Warehouse,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

import {
  EmptyState,
  Notice,
  Page,
  PageHeader,
  ProgressBar,
  RecordList,
  RecordRow,
  Section,
  StatTile,
  StatusBadge,
  TagChip,
} from "@/components/page";
import type { Tone } from "@/components/page";
import { RepeatBreeder } from "@/components/repeat-breeder";
import { useLanguage, useT } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/**
 * The screen the Manager runs the day from: what needs them, then how the day is going pen
 * by pen.
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
  // The Owner reads the queue; answering a Repeat Breeder is the Manager's or the Vet's.
  const mayAnswer =
    me.data?.roles.some((role) => role === "manager" || role === "vet") ??
    false;

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

  return (
    <Page>
      <PageHeader
        actions={
          <Button render={<Link search={{}} to="/today" />}>
            <ClipboardList data-icon="inline-start" />
            {t("nav.today")}
          </Button>
        }
        description={t("home.subtitle")}
        eyebrow={formatDate(new Date(), language, "date")}
        title={t("home.title")}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Section
          className="lg:col-span-2"
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
            <div className="flex flex-col gap-5">
              <QueueBlock
                count={queue.overdue.length}
                label={t("home.overdue")}
                tone="danger"
              >
                {queue.overdue.map((row) => (
                  <RecordRow
                    key={row.id}
                    meta={row.pen ?? t("work.wholeFarm")}
                    title={
                      <Link
                        className="after:absolute after:inset-0 hover:underline"
                        params={{ instanceId: row.id }}
                        to="/work/$instanceId"
                      >
                        {row.sopBn}
                      </Link>
                    }
                    trailing={<Opens />}
                  />
                ))}
              </QueueBlock>

              <QueueBlock
                count={queue.signOff.length}
                label={t("home.signOff")}
                tone="info"
              >
                {queue.signOff.map((row) => (
                  <RecordRow
                    key={row.id}
                    meta={row.pen ?? t("work.wholeFarm")}
                    title={
                      <Link
                        className="after:absolute after:inset-0 hover:underline"
                        params={{ instanceId: row.id }}
                        to="/work/$instanceId"
                      >
                        {row.sopBn}
                      </Link>
                    }
                    trailing={<Opens />}
                  />
                ))}
              </QueueBlock>

              <QueueBlock
                count={queue.needsReview.length}
                label={t("home.needsReview")}
                tone="warning"
              >
                {queue.needsReview.map((row) => (
                  <RecordRow
                    key={row.id}
                    title={
                      row.instanceId ? (
                        <Link
                          className="after:absolute after:inset-0 hover:underline"
                          params={{ instanceId: row.instanceId }}
                          to="/work/$instanceId"
                        >
                          {t(`review.${row.reason}` as MessageKey)}
                        </Link>
                      ) : (
                        <Link
                          className="after:absolute after:inset-0 hover:underline"
                          to="/admin/sign-off"
                        >
                          {t(`review.${row.reason}` as MessageKey)}
                        </Link>
                      )
                    }
                    trailing={<Opens />}
                  />
                ))}
              </QueueBlock>

              <QueueBlock
                count={queue.withdrawal.length}
                label={t("home.withdrawal")}
                tone="warning"
              >
                {queue.withdrawal.map((row) => (
                  <RecordRow
                    key={row.id}
                    leading={
                      <Link
                        params={{ tagNumber: row.tagNumber }}
                        to="/animals/$tagNumber"
                      >
                        <TagChip>{row.tagNumber}</TagChip>
                      </Link>
                    }
                    title={
                      row.until
                        ? t("home.until", {
                            date: formatDate(
                              new Date(row.until),
                              language,
                              "date"
                            ),
                          })
                        : t("home.withdrawal")
                    }
                    trailing={
                      row.endingSoon ? (
                        <StatusBadge tone="info">
                          {t("home.endingSoon")}
                        </StatusBadge>
                      ) : null
                    }
                  />
                ))}
              </QueueBlock>

              <QueueBlock
                count={queue.meatWithdrawal.length}
                label={t("home.meatWithdrawal")}
                tone="warning"
              >
                {queue.meatWithdrawal.map((row) => (
                  <RecordRow
                    key={row.id}
                    leading={
                      <Link
                        params={{ tagNumber: row.tagNumber }}
                        to="/animals/$tagNumber"
                      >
                        <TagChip>{row.tagNumber}</TagChip>
                      </Link>
                    }
                    title={
                      row.fitForSaleAt
                        ? t("animals.meatHeldUntil", {
                            date: formatDate(
                              new Date(row.fitForSaleAt),
                              language,
                              "date"
                            ),
                          })
                        : t("home.meatWithdrawal")
                    }
                  />
                ))}
              </QueueBlock>

              <QueueBlock
                count={queue.lowStock.length}
                label={t("home.lowStock")}
                tone="warning"
              >
                {queue.lowStock.map((line) => (
                  <RecordRow
                    key={line.feedItemId}
                    title={
                      <Link
                        className="after:absolute after:inset-0 hover:underline"
                        to="/admin/feed"
                      >
                        {t("home.lowStockLine", {
                          feed: line.nameBn,
                          onHand: count(line.onHand),
                          unit: line.unit,
                          threshold: count(line.threshold),
                        })}
                      </Link>
                    }
                    trailing={<Opens />}
                  />
                ))}
              </QueueBlock>

              <QueueBlock
                count={queue.repeatBreeders.length}
                label={t("repeatBreeder.title")}
                tone="info"
              >
                {queue.repeatBreeders.map((row) => (
                  <div className="py-3" key={row.animalId}>
                    <RepeatBreeder mayAnswer={mayAnswer} row={row} />
                  </div>
                ))}
              </QueueBlock>
            </div>
          )}
        </Section>

        <Section
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          className="group focus-visible:ring-ring rounded-xl outline-none focus-visible:ring-2"
          search={{}}
          to="/today"
        >
          <StatTile
            hint={
              <ProgressBar label={t("home.workDone")} value={donePercent} />
            }
            icon={ClipboardCheck}
            label={t("home.workDone")}
            value={t("home.progress", {
              done: count(tiles.workDone),
              raised: count(tiles.workRaised),
            })}
          />
        </Link>
        <StatTile
          hint={waiting === 0 ? t("home.allClear") : t("home.waitingHint")}
          icon={Inbox}
          label={t("home.queue")}
          tone={waiting === 0 ? "success" : "warning"}
          value={count(waiting)}
        />
        <Link
          className="focus-visible:ring-ring rounded-xl outline-none focus-visible:ring-2"
          to="/animals"
        >
          <StatTile
            hint={t("home.withdrawal")}
            icon={Milk}
            label={t("home.cowsHeld")}
            tone={tiles.underWithdrawal > 0 ? "warning" : "neutral"}
            value={count(tiles.underWithdrawal)}
          />
        </Link>
        <StatTile
          hint={t("home.pens")}
          icon={Warehouse}
          label={t("home.pensWorking")}
          value={count(pens.length)}
        />
      </div>
    </Page>
  );
};

/** A row that opens something. */
const Opens = () => (
  <ChevronRight aria-hidden className="text-muted-foreground size-4" />
);

/** One queue, or nothing at all: an empty heading is a line of furniture. Each row brings
 *  its own link, so the route and its parameters are typed where they are written. */
const QueueBlock = ({
  label,
  count,
  tone,
  children,
}: {
  label: string;
  count: number;
  tone: Tone;
  children: ReactNode;
}) => {
  const { language } = useLanguage();
  if (count === 0) {
    return null;
  }
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 pb-1">
        <h3 className="text-sm font-semibold">{label}</h3>
        <StatusBadge tone={tone}>{formatNumber(count, language)}</StatusBadge>
      </div>
      <RecordList>{children}</RecordList>
    </div>
  );
};

/** How one Pen's day is going, and how many animals are standing in it. */
const PenProgress = ({
  name,
  pen,
}: {
  name: string;
  pen: { penId: string; raised: number; done: number; animals: number };
}) => {
  const t = useT();
  const { language } = useLanguage();
  const percent =
    pen.raised === 0 ? 0 : Math.round((pen.done / pen.raised) * 100);
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <Link
          className="truncate font-medium hover:underline"
          search={{ pen: pen.penId }}
          to="/today"
        >
          {name}
        </Link>
        <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
          {t("home.progress", {
            done: formatNumber(pen.done, language),
            raised: formatNumber(pen.raised, language),
          })}
        </span>
      </div>
      <ProgressBar label={name} value={percent} />
      <span className="text-muted-foreground text-xs">
        {t("home.animalsIn", { count: formatNumber(pen.animals, language) })}
      </span>
    </div>
  );
};

export const Route = createFileRoute("/_auth/home")({
  beforeLoad: onlyFor("runsTheFarm"),
  component: ManagerHome,
});
