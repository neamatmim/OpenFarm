import type { SopContent } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { AlertList } from "@/components/alert-list";
import { useLanguage } from "@/i18n/language-provider";
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

/** What is due now, for the Pens this person works. */
const TodayPage = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const ensureDue = useMutation(orpc.instances.ensureDue.mutationOptions({}));
  const sweep = useMutation(orpc.alerts.sweep.mutationOptions({}));
  const work = useQuery(orpc.instances.today.queryOptions({ input: {} }));
  const statusOf = useStatusLabel();

  // Raise whatever the day needs — the work, then the notices about work already late —
  // when someone opens the app. Both are idempotent, so running them on every open is safe,
  // and harmless when the phone has no signal.
  const raise = ensureDue.mutateAsync;
  const tell = sweep.mutateAsync;
  useEffect(() => {
    const run = async () => {
      try {
        await raise();
        await tell();
        await queryClient.invalidateQueries({ queryKey: orpc.instances.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.alerts.key() });
      } catch {
        // no signal: the list shows what the phone already knows about
      }
    };
    void run();
  }, [raise, tell, queryClient]);

  return (
    <div className="container mx-auto max-w-xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{t("work.title")}</h1>
      <AlertList />
      {work.data?.length ? (
        <ul className="space-y-2">
          {work.data.map((instance) => {
            const content = instance.version.content as SopContent;
            return (
              <li key={instance.id}>
                <Link
                  to="/work/$instanceId"
                  params={{ instanceId: instance.id }}
                  className="flex items-center justify-between rounded-2xl bg-neutral-900 p-4 hover:bg-neutral-800"
                >
                  <div>
                    <p className="text-lg font-bold">{content.name.bn}</p>
                    <p className="text-muted-foreground text-sm">
                      {instance.pen.shed.name} · {instance.pen.name} ·{" "}
                      {t("work.due", {
                        time: formatDate(
                          new Date(instance.dueAt),
                          language,
                          "dateTime"
                        ),
                      })}
                    </p>
                  </div>
                  <span className="flex items-center gap-2 text-sm">
                    {instance.overdue ? (
                      <span className="rounded-full bg-amber-900 px-2 py-0.5 text-xs text-amber-200">
                        {t("work.overdue")}
                      </span>
                    ) : null}
                    {statusOf(instance)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("work.none")}</p>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/today")({
  component: TodayPage,
});
