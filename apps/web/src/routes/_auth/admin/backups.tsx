import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  CircleX,
  DatabaseBackup,
  ShieldCheck,
} from "lucide-react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import type { Tone } from "@/components/page";
import {
  EmptyState,
  Loaded,
  Notice,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage, useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** Two nights without a copy is a farm one disk away from losing its own records. */
const NIGHTS_BEFORE_WORRYING = 2;
/** Three turns of the server's five-minute clock missed. */
const SCHEDULE_STALE_MS = 15 * 60_000;

/** Whether a moment is further back than a span, as of when the screen is drawn. */
const olderThan = (at: Date | string, spanMs: number): boolean =>
  Date.now() - new Date(at).getTime() > spanMs;

type Backups = Awaited<ReturnType<typeof orpc.backups.recent.call>>;
type BackupRun = Backups["runs"][number];
type Schedule = Awaited<ReturnType<typeof orpc.farm.schedule.call>>;

/** Whether a copy worked, as a word with its colour, and what went wrong when it did not. */
const RunResult = ({ run }: { run: BackupRun }) => {
  const t = useT();
  const worked = run.ok === "yes";
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <StatusBadge tone={worked ? "success" : "danger"}>
        {worked ? t("backups.ok") : t("backups.failed")}
      </StatusBadge>
      {run.detail ? (
        <span className="text-muted-foreground text-xs break-words">
          {run.detail}
        </span>
      ) : null}
    </span>
  );
};

const StartedCell = ({ row }: { row: { original: BackupRun } }) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatDate(new Date(row.original.startedAt), language, "dateTime")}
    </span>
  );
};

const ResultCell = ({ row }: { row: { original: BackupRun } }) => (
  <RunResult run={row.original} />
);

const column = createListColumns<BackupRun>();
const runColumns = column.columns([
  column.accessor((run) => new Date(run.startedAt).getTime(), {
    id: "startedAt",
    header: listHeader("audit.when"),
    cell: StartedCell,
  }),
  column.accessor("kind", { header: listHeader("backups.col.kind") }),
  column.accessor("ok", {
    header: listHeader("backups.col.result"),
    cell: ResultCell,
  }),
]);

/** One copy on a phone: whether it worked and when, and which kind. */
const RunCard = ({ run }: { run: BackupRun }) => {
  const { language } = useLanguage();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium tabular-nums">
          {formatDate(new Date(run.startedAt), language, "dateTime")}
        </span>
        <span className="text-muted-foreground text-xs">{run.kind}</span>
      </div>
      <div className="shrink-0">
        <RunResult run={run} />
      </div>
    </div>
  );
};

const runCard = (run: BackupRun) => <RunCard run={run} />;

/** The copies taken, as a table where there is room — when, which kind, and whether it worked — and cards on a phone. */
const RunTable = ({ runs }: { runs: BackupRun[] }) => {
  const table = useListTable({
    columns: runColumns,
    data: runs,
    getRowId: (run) => run.id,
  });
  return (
    <DataTable card={runCard} minWidth="32rem" pageSize={20} table={table} />
  );
};

/** How the copies stand: never, too long ago, or lately. */
const copiesTone = (state: Backups | undefined): Tone => {
  if (!state) {
    return "neutral";
  }
  if (state.daysSince === null) {
    return "danger";
  }
  return state.daysSince >= NIGHTS_BEFORE_WORRYING ? "warning" : "success";
};

const scheduleWorrying = (schedule: Schedule): boolean =>
  schedule.lastError !== null ||
  schedule.lastOkAt === null ||
  olderThan(schedule.lastOkAt, SCHEDULE_STALE_MS);

/** The three figures this screen is judged by: when the last good copy was, whether the farm's schedule is turning,
 *  and how many of the latest tries failed. */
const useBackupFigures = (
  state: Backups | undefined,
  schedule: Schedule | undefined
): Figure[] => {
  const { t, language } = useLanguage();
  const lastGood = state?.lastGoodAt ? new Date(state.lastGoodAt) : null;
  const failed = state?.runs.filter((run) => run.ok !== "yes").length ?? 0;
  const worrying = schedule ? scheduleWorrying(schedule) : false;
  const tries = state?.runs.length ?? 0;
  return [
    {
      label: t("backups.kpi.lastGood"),
      value: lastGood
        ? formatDate(lastGood, language, "date")
        : t("backups.kpi.never"),
      hint: lastGood
        ? formatDate(lastGood, language, "dateTime")
        : t("backups.never"),
      icon: ShieldCheck,
      tone: copiesTone(state),
    },
    {
      label: t("backups.kpi.schedule"),
      value: worrying ? t("backups.kpi.stopped") : t("backups.kpi.running"),
      hint: schedule?.lastOkAt
        ? t("schedule.lastRan", {
            when: formatDate(new Date(schedule.lastOkAt), language, "dateTime"),
          })
        : t("schedule.notYet"),
      icon: CalendarClock,
      tone: worrying ? "warning" : "success",
    },
    {
      label: t("backups.kpi.failed"),
      value: formatNumber(failed, language),
      hint:
        tries > 0
          ? t("backups.kpi.failedHint", {
              count: formatNumber(tries, language),
            })
          : t("backups.none"),
      icon: CircleX,
      tone: failed > 0 ? "danger" : "neutral",
    },
  ];
};

/** What is wrong, said in full where a figure has no room for it: copies that stopped, a schedule that did. Nothing
 *  when all is well — the figures already say so. */
const Worries = ({
  state,
  schedule,
}: {
  state: Backups | undefined;
  schedule: Schedule | undefined;
}) => {
  const { t, language } = useLanguage();
  const tone = copiesTone(state);
  return (
    <>
      {state && (tone === "danger" || tone === "warning") ? (
        <Notice
          title={
            state.daysSince === null
              ? t("backups.never")
              : t("backups.stale", { nights: state.daysSince })
          }
          tone={tone}
        />
      ) : null}
      {schedule && scheduleWorrying(schedule) ? (
        <Notice
          title={
            schedule.lastOkAt
              ? t("schedule.lastRan", {
                  when: formatDate(
                    new Date(schedule.lastOkAt),
                    language,
                    "dateTime"
                  ),
                })
              : t("schedule.notYet")
          }
          tone="warning"
        >
          {schedule.lastError ?? t("schedule.what")}
        </Notice>
      ) : null}
    </>
  );
};

/**
 * Whether the farm is being copied off the machine it lives on.
 *
 * The nightly job writes every attempt down, success or failure, so this is a question the
 * app answers rather than one somebody has to find a console for. Silence is what nobody
 * notices, which is why a failed copy is shown rather than hidden.
 */
const BackupsPage = () => {
  const t = useT();
  const backups = useQuery(orpc.backups.recent.queryOptions({ input: {} }));
  const schedule = useQuery({
    ...orpc.farm.schedule.queryOptions(),
    refetchInterval: 60_000,
  });
  const state = backups.data;
  const figures = useBackupFigures(state, schedule.data);

  return (
    <Page className="max-w-5xl" width="default">
      <PageHeader
        description={t("backups.subtitle")}
        title={t("backups.title")}
      />
      <Loaded query={backups}>
        <SummaryFigures figures={figures} />
      </Loaded>
      <Worries schedule={schedule.data} state={state} />
      <Section
        description={t("backups.historyWhy")}
        title={t("backups.history")}
      >
        <Loaded query={backups}>
          {state?.runs.length ? (
            <RunTable runs={state.runs} />
          ) : (
            <EmptyState bare icon={DatabaseBackup} title={t("backups.none")} />
          )}
        </Loaded>
      </Section>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/backups")({
  component: BackupsPage,
});
