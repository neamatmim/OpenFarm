import type { SopContent } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { NeedsReview } from "@/components/needs-review";
import {
  EmptyState,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { hoursLate } from "@/lib/lateness";
import { placeOfWork } from "@/lib/work-place";
import { orpc } from "@/utils/orpc";

interface Queued {
  version: { content: unknown };
  pen: { name: string; shed: { name: string } } | null;
}

/** SOP content is jsonb, so it arrives untyped; the Version's own shape is the promise. */
const titleOf = (row: Queued, bangla: boolean) => {
  const { name } = row.version.content as SopContent;
  return bangla ? name.bn : (name.en ?? name.bn);
};

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
    <Page className="max-w-3xl" width="narrow">
      <PageHeader title={t("signOff.title")} />
      <Section>
        {queue.data?.length ? (
          <ul className="space-y-3">
            {queue.data.map((row) => (
              <li className="rounded-lg border p-4" key={row.id}>
                <Link
                  className="block"
                  params={{ instanceId: row.id }}
                  to="/work/$instanceId"
                >
                  <p className="text-lg font-semibold hover:underline">
                    {titleOf(row, language === "bn")}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {placeOfWork(row.pen, t("work.wholeFarm"))} ·{" "}
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
          <EmptyState icon={ClipboardCheck} title={t("signOff.none")} />
        )}
      </Section>

      <NeedsReview />

      <Section
        action={
          late.data?.length ? (
            <StatusBadge icon={Clock} tone="warning">
              {formatNumber(late.data.length, language)}
            </StatusBadge>
          ) : null
        }
        title={t("work.overdueTitle")}
      >
        {late.data?.length ? (
          <ul className="space-y-3">
            {late.data.map((row) => (
              <li
                className="border-warning/40 rounded-lg border p-4"
                key={row.id}
              >
                <Link
                  className="block"
                  params={{ instanceId: row.id }}
                  to="/work/$instanceId"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-lg font-semibold hover:underline">
                      {titleOf(row, language === "bn")}
                    </p>
                    <StatusBadge icon={Clock} tone="warning">
                      {t("work.lateFor", {
                        hours: hoursLate(row.minutesOverdue),
                      })}
                    </StatusBadge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {placeOfWork(row.pen, t("work.wholeFarm"))}
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
                    className="w-full sm:w-auto"
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
          <EmptyState title={t("work.overdueNone")} />
        )}
      </Section>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/sign-off")({
  component: SignOffPage,
});
