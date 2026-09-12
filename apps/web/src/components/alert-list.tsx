import type { AlertKind } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { useLanguage } from "@/i18n/language-provider";
import { hoursLate } from "@/lib/lateness";
import { orpc } from "@/utils/orpc";

/** Every kind of Alert has something to say. Typed by the kind rather than by string, so a
 *  new one is a compile error here rather than a row that renders as its own name. */
const MESSAGE_FOR: Record<AlertKind, MessageKey> = {
  instance_overdue: "alerts.instanceOverdue",
  instance_escalated: "alerts.instanceEscalated",
  instance_sent_back: "alerts.instanceSentBack",
  needs_review: "alerts.needsReview",
  sop_published: "alerts.sopPublished",
  sop_proposed: "alerts.sopProposed",
  withdrawal_ending: "alerts.withdrawalEnding",
};

/** The Alert's snapshotted params arrive as jsonb, so the shape is the server's promise
 *  rather than the type system's; read defensively and in the reader's language. */
const paramsOf = (
  params: unknown,
  bangla: boolean
): Record<string, string | number> => {
  const raw = (params ?? {}) as Record<string, unknown>;
  return {
    sop: String((bangla ? raw.sopBn : raw.sopEn) ?? raw.sopBn ?? ""),
    pen: String(raw.pen ?? ""),
    reason: String(raw.reason ?? ""),
    hours: hoursLate(Number(raw.minutesOverdue ?? 0)),
    /** A cow, for the notices that are about one rather than about a piece of work. */
    tag: String(raw.tag ?? ""),
  };
};

const messageFor = (kind: string): MessageKey | null =>
  (MESSAGE_FOR as Record<string, MessageKey>)[kind] ?? null;

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
        const key = messageFor(notice.kind);
        return (
          <li
            className="flex items-start gap-3 rounded-2xl bg-amber-950 p-3 text-amber-100"
            key={notice.id}
          >
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <p className="flex-1 text-sm">
              {key
                ? t(key, paramsOf(notice.params, language === "bn"))
                : notice.kind}
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
