import type { MessageKey } from "@OpenFarm/i18n";
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
import { SaidDate } from "@/components/list-cells";
import type { Tone } from "@/components/page";
import {
  EmptyState,
  Loaded,
  Notice,
  Page,
  PageHeader,
  Section,
  StatusBadge,
  TableSkeleton,
} from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage, useT } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/** Two nights without a copy is a farm one disk away from losing its own records. */
const NIGHTS_BEFORE_WORRYING = 2;
/** Three turns of the server's five-minute clock missed. */
const SCHEDULE_STALE_MS = 15 * 60_000;

/** Longer than any copy takes, retries aside: a copy started this recently with nothing written back is still running. */
const A_COPY_TAKES_AT_MOST_MS = 6 * 60 * 60_000;

/** Whether a moment is further back than a span, as of when the screen is drawn. */
const olderThan = (at: Date | string, spanMs: number): boolean =>
  Date.now() - new Date(at).getTime() > spanMs;

type Backups = Awaited<ReturnType<typeof orpc.backups.list.call>>;
type BackupRun = Backups["runs"][number];
type Schedule = Awaited<ReturnType<typeof orpc.farm.schedule.call>>;

/** Where a copy stands: it worked, it failed, or it is still being taken — the job writes its row as failed before it
 *  begins, so a copy in progress, or a restored farm's own copy, read as failed for ever. */
const stateOf = (run: BackupRun): "ok" | "failed" | "running" => {
  if (run.ok === "yes") {
    return "ok";
  }
  return run.finishedAt === null &&
    !olderThan(run.startedAt, A_COPY_TAKES_AT_MOST_MS)
    ? "running"
    : "failed";
};

const STATE_WORD = {
  ok: "backups.ok",
  failed: "backups.failed",
  running: "backups.running",
} as const satisfies Record<ReturnType<typeof stateOf>, MessageKey>;

const STATE_TONE = {
  ok: "success",
  failed: "danger",
  running: "info",
} as const satisfies Record<ReturnType<typeof stateOf>, Tone>;

/** The job's own reasons, as it writes them, in the reader's words; what the tool itself said follows as it said it. */
const DETAIL_WORDS: [string, MessageKey][] = [
  ["pg_dump or encryption failed", "backups.why.dump"],
  ["upload failed", "backups.why.upload"],
  ["the copy came out at", "backups.why.tooSmall"],
  ["old copies were not pruned", "backups.why.notPruned"],
  ["old nightlies were not pruned", "backups.why.notPruned"],
];

const useDetail = (detail: string | null): string | null => {
  const t = useT();
  if (!detail) {
    return null;
  }
  const known = DETAIL_WORDS.find(([start]) => detail.startsWith(start));
  if (!known) {
    return detail;
  }
  const rest = detail.slice(known[0].length).replace(/^[:\s]+/u, "");
  return rest ? `${t(known[1])} (${rest})` : t(known[1]);
};

/** How big a copy came out, in the reader's own digits. */
const useSize = (bytes: string | null): string | null => {
  const { language } = useLanguage();
  const size = Number(bytes);
  if (!bytes || !Number.isFinite(size) || size <= 0) {
    return null;
  }
  return size >= MEGABYTE
    ? `${formatNumber(size / MEGABYTE, language, { maximumFractionDigits: 1 })} MB`
    : `${formatNumber(Math.ceil(size / KILOBYTE), language)} KB`;
};

const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;

/** Whether a copy worked, as a word with its color, how big it came out, and what went wrong when it did not. */
const RunResult = ({ run }: { run: BackupRun }) => {
  const t = useT();
  const state = stateOf(run);
  const detail = useDetail(run.detail);
  const size = useSize(run.sizeBytes);
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <StatusBadge tone={STATE_TONE[state]}>{t(STATE_WORD[state])}</StatusBadge>
      {size ? (
        <span className="text-muted-foreground text-xs tabular-nums">
          {size}
        </span>
      ) : null}
      {detail ? (
        <span className="text-muted-foreground text-xs break-words">
          {detail}
        </span>
      ) : null}
    </span>
  );
};

/** A kind of copy in the reader's words. */
const KindCell = ({ row }: { row: { original: BackupRun } }) => {
  const t = useT();
  return <span>{t(`backups.kind.${row.original.kind}`)}</span>;
};

const StartedCell = ({ row }: { row: { original: BackupRun } }) => (
  <span className="whitespace-nowrap tabular-nums">
    <SaidDate at={row.original.startedAt} withTime />
  </span>
);

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
  column.accessor("kind", {
    header: listHeader("backups.col.kind"),
    cell: KindCell,
  }),
  column.accessor("ok", {
    header: listHeader("backups.col.result"),
    cell: ResultCell,
  }),
]);

/** One copy on a phone: whether it worked and when, and which kind. */
const RunCard = ({ run }: { run: BackupRun }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium tabular-nums">
          {formatDate(new Date(run.startedAt), language, "dateTime")}
        </span>
        <span className="text-muted-foreground text-xs">
          {t(`backups.kind.${run.kind}`)}
        </span>
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
  const failed =
    state?.runs.filter((run) => stateOf(run) === "failed").length ?? 0;
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
      {/* A screen drawn from an answer cached before the server counted its failures has none to show. */}
      {schedule && (schedule.failuresInTheLastHour ?? 0) > 0 ? (
        <Notice
          title={t("schedule.failing", {
            count: schedule.failuresInTheLastHour,
          })}
          tone="warning"
        >
          {t("schedule.failingWhat")}
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
  const backups = useQuery(orpc.backups.list.queryOptions({ input: {} }));
  const schedule = useQuery({
    ...orpc.farm.schedule.queryOptions(),
    refetchInterval: 60_000,
  });
  const state = backups.data;
  const figures = useBackupFigures(state, schedule.data);

  return (
    <Page>
      <PageHeader
        description={t("backups.subtitle")}
        eyebrow={t("nav.identity")}
        title={t("nav.backups")}
      />
      <Loaded query={backups}>
        <SummaryFigures figures={figures} />
      </Loaded>
      <Worries schedule={schedule.data} state={state} />
      <Section
        description={t("backups.historyWhy")}
        title={t("backups.history")}
      >
        <Loaded query={backups} skeleton={<TableSkeleton />}>
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

export const Route = createFileRoute("/_authenticated/farm/backups")({
  /** For those who run the farm: the Owner and the Farm Managers. */
  beforeLoad: onlyFor("runsTheFarm"),
  component: BackupsPage,
});
