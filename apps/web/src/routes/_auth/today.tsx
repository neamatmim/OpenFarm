import type { SopContent } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** What is due now, for the Pens this person works. */
const TodayPage = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const ensureDue = useMutation(orpc.instances.ensureDue.mutationOptions({}));
  const work = useQuery(orpc.instances.today.queryOptions({ input: {} }));

  // Raise whatever the day needs when someone opens the app; idempotent, so it is safe to
  // run on every open, and harmless when the phone has no signal.
  const raise = ensureDue.mutateAsync;
  useEffect(() => {
    const run = async () => {
      try {
        await raise();
        await queryClient.invalidateQueries({ queryKey: orpc.instances.key() });
      } catch {
        // no signal: the list shows what the phone already knows about
      }
    };
    void run();
  }, [raise, queryClient]);

  return (
    <div className="container mx-auto max-w-xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">{t("work.title")}</h1>
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
                  <span className="text-sm">{t("work.claim")}</span>
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
