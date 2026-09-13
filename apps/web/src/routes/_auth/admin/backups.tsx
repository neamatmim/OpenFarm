import { formatDate } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** Two nights without a copy is a farm one disk away from losing its own records. */
const NIGHTS_BEFORE_WORRYING = 2;

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
    <div className="container mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{t("backups.title")}</h1>
      {state ? (
        <p
          className={`rounded-xl p-3 ${
            worrying ? "bg-warning-surface text-warning" : "bg-muted"
          }`}
        >
          {howItStands()}
        </p>
      ) : null}
      {state?.runs.length ? (
        <ul className="space-y-2">
          {state.runs.map((run) => (
            <li
              className="bg-card flex items-center justify-between rounded-xl border p-3 text-sm"
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
        <p className="text-muted-foreground text-sm">{t("backups.none")}</p>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/backups")({
  component: BackupsPage,
});
