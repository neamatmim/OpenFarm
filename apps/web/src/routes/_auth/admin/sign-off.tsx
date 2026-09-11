import type { SopContent } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const MINUTES_PER_HOUR = 60;

interface Queued {
  id: string;
  dueAt: string | Date;
  version: { content: unknown };
  pen: { name: string; shed: { name: string } };
}

const titleOf = (row: Queued) => (row.version.content as SopContent).name.bn;
const whereOf = (row: Queued) => `${row.pen.shed.name} · ${row.pen.name}`;

/** The Manager's two queues: work waiting to be checked, and work that has gone late. */
const SignOffPage = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [reasonFor, setReasonFor] = useState<Record<string, string>>({});

  const queue = useQuery(orpc.instances.signOffQueue.queryOptions());
  const late = useQuery(orpc.instances.overdue.queryOptions());

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.instances.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.alerts.key() });
  };
  const onError = (error: Error) =>
    toast.error(error.message || t("common.error"));
  const approve = useMutation(
    orpc.instances.approve.mutationOptions({ onSuccess: refresh, onError })
  );
  const sendBack = useMutation(
    orpc.instances.sendBack.mutationOptions({ onSuccess: refresh, onError })
  );
  const closeAsMissed = useMutation(
    orpc.instances.closeAsMissed.mutationOptions({
      onSuccess: refresh,
      onError,
    })
  );

  const reason = (id: string) => reasonFor[id] ?? "";
  const setReason = (id: string, value: string) =>
    setReasonFor((current) => ({ ...current, [id]: value }));

  return (
    <div className="container mx-auto max-w-2xl space-y-8 px-4 py-6">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">{t("signOff.title")}</h1>
        {queue.data?.length ? (
          <ul className="space-y-3">
            {queue.data.map((row) => (
              <li className="rounded-2xl bg-neutral-900 p-4" key={row.id}>
                <Link
                  className="block"
                  params={{ instanceId: row.id }}
                  to="/work/$instanceId"
                >
                  <p className="text-lg font-bold">{titleOf(row)}</p>
                  <p className="text-muted-foreground text-sm">
                    {whereOf(row)} ·{" "}
                    {formatDate(new Date(row.dueAt), language, "dateTime")}
                  </p>
                </Link>
                <div className="mt-3 space-y-2">
                  <Input
                    aria-label={t("signOff.reason")}
                    onChange={(event) => setReason(row.id, event.target.value)}
                    placeholder={t("signOff.reason")}
                    value={reason(row.id)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      disabled={!reason(row.id).trim()}
                      onClick={() =>
                        sendBack.mutate({
                          id: row.id,
                          reason: reason(row.id).trim(),
                        })
                      }
                      variant="outline"
                    >
                      {t("signOff.sendBack")}
                    </Button>
                    <Button onClick={() => approve.mutate({ id: row.id })}>
                      {t("signOff.approve")}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t("signOff.none")}</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">{t("work.overdueTitle")}</h2>
        {late.data?.length ? (
          <ul className="space-y-3">
            {late.data.map((row) => (
              <li className="rounded-2xl bg-amber-950 p-4" key={row.id}>
                <Link
                  className="block"
                  params={{ instanceId: row.id }}
                  to="/work/$instanceId"
                >
                  <p className="text-lg font-bold">{titleOf(row)}</p>
                  <p className="text-sm text-amber-200">
                    {whereOf(row)} ·{" "}
                    {t("work.lateFor", {
                      hours: Math.max(
                        1,
                        Math.round(row.minutesOverdue / MINUTES_PER_HOUR)
                      ),
                    })}
                  </p>
                </Link>
                <div className="mt-3 space-y-2">
                  <Input
                    aria-label={t("signOff.missedWhy")}
                    onChange={(event) => setReason(row.id, event.target.value)}
                    placeholder={t("signOff.missedWhy")}
                    value={reason(row.id)}
                  />
                  <Button
                    className="w-full"
                    disabled={!reason(row.id).trim()}
                    onClick={() =>
                      closeAsMissed.mutate({
                        id: row.id,
                        reason: reason(row.id).trim(),
                      })
                    }
                    variant="outline"
                  >
                    {t("signOff.missed")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("work.overdueNone")}
          </p>
        )}
      </section>
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/sign-off")({
  component: SignOffPage,
});
