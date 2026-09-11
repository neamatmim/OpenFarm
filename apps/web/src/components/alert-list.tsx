import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const MINUTES_PER_HOUR = 60;

const MESSAGE_FOR: Record<string, MessageKey> = {
  instance_overdue: "alerts.instanceOverdue",
  instance_escalated: "alerts.instanceEscalated",
  instance_sent_back: "alerts.instanceSentBack",
};

interface Notice {
  id: string;
  kind: string;
  params: unknown;
}

const paramsOf = (
  notice: Notice,
  bangla: boolean
): Record<string, string | number> => {
  const raw = (notice.params ?? {}) as Record<string, unknown>;
  const minutes = Number(raw.minutesOverdue ?? 0);
  return {
    sop: String((bangla ? raw.sopBn : raw.sopEn) ?? raw.sopBn ?? ""),
    pen: String(raw.pen ?? ""),
    reason: String(raw.reason ?? ""),
    hours: Math.max(1, Math.round(minutes / MINUTES_PER_HOUR)),
  };
};

/**
 * What this person is being told. Raising the notices is the same call however anyone opens
 * the app: it is idempotent, so no scheduler has to have run for the farm to know its work
 * is late.
 */
export const AlertList = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const alerts = useQuery(orpc.alerts.mine.queryOptions({ input: {} }));
  const dismiss = useMutation(
    orpc.alerts.dismiss.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: orpc.alerts.key() }),
    })
  );

  if (!alerts.data?.length) {
    return null;
  }
  return (
    <ul className="space-y-2">
      {alerts.data.map((notice) => {
        const key = MESSAGE_FOR[notice.kind];
        return (
          <li
            className="flex items-start gap-3 rounded-2xl bg-amber-950 p-3 text-amber-100"
            key={notice.id}
          >
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <p className="flex-1 text-sm">
              {key ? t(key, paramsOf(notice, language === "bn")) : notice.kind}
            </p>
            <Button
              onClick={() => dismiss.mutate({ id: notice.id })}
              size="sm"
              variant="ghost"
            >
              {t("alerts.dismiss")}
            </Button>
          </li>
        );
      })}
    </ul>
  );
};
