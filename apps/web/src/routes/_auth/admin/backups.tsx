import { formatDate } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DatabaseBackup } from "lucide-react";

import { EmptyState, Notice, Page, PageHeader } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** Two nights without a copy is a farm one disk away from losing its own records. */
const NIGHTS_BEFORE_WORRYING = 2;
/** Three turns of the server's five-minute clock missed. */
const SCHEDULE_STALE_MS = 15 * 60_000;

/**
 * Whether the farm is being copied off the machine it lives on.
 *
 * The nightly job writes every attempt down, success or failure, so this is a question the
 * app answers rather than one somebody has to find a console for. Silence is what nobody
 * notices, which is why a failed copy is shown rather than hidden.
 */
const BackupsPage = () => {
  const { t, language } = useLanguage();
  const backups = useQuery(orpc.backups.recent.queryOptions({ input: {} }));
  const schedule = useQuery({
    ...orpc.farm.schedule.queryOptions(),
    refetchInterval: 60_000,
  });
  const scheduleWorrying =
    schedule.data !== undefined &&
    (schedule.data.lastError !== null ||
      schedule.data.lastOkAt === null ||
      Date.now() - new Date(schedule.data.lastOkAt).getTime() >
        SCHEDULE_STALE_MS);

  const state = backups.data;
  const worrying =
    state !== undefined &&
    (state.daysSince === null || state.daysSince >= NIGHTS_BEFORE_WORRYING);

  /** The one line that answers the question somebody came to this screen with. */
  const howItStands = (): string => {
    if (!state || state.daysSince === null) {
      return t("backups.never");
    }
    if (worrying) {
      return t("backups.stale", { nights: state.daysSince });
    }
    return t("backups.lastGood", {
      when: state.lastGoodAt
        ? formatDate(new Date(state.lastGoodAt), language, "dateTime")
        : "",
    });
  };

  return (
    <Page width="narrow" className="max-w-3xl">
      <PageHeader
        description={t("backups.subtitle")}
        title={t("backups.title")}
      />
      {schedule.data ? (
        <Notice
          title={
            schedule.data.lastOkAt
              ? t("schedule.lastRan", {
                  when: formatDate(
                    new Date(schedule.data.lastOkAt),
                    language,
                    "dateTime"
                  ),
                })
              : t("schedule.notYet")
          }
          tone={scheduleWorrying ? "warning" : "success"}
        >
          {schedule.data.lastError ?? t("schedule.what")}
        </Notice>
      ) : null}
      {state ? (
        <Notice title={howItStands()} tone={worrying ? "warning" : "success"} />
      ) : null}
      {state?.runs.length ? (
        <ul className="space-y-2">
          {state.runs.map((run) => (
            <li
              className="bg-card surface flex items-center justify-between p-4 text-sm"
              key={run.id}
            >
              <span>
                {formatDate(new Date(run.startedAt), language, "dateTime")} ·{" "}
                {run.kind}
              </span>
              <span
                className={run.ok === "yes" ? "text-success" : "text-warning"}
              >
                {run.ok === "yes" ? t("backups.ok") : t("backups.failed")}
                {run.detail ? ` · ${run.detail}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={DatabaseBackup} title={t("backups.none")} />
      )}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/backups")({
  component: BackupsPage,
});
