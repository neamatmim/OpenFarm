import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Notice } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { phoneOutbox } from "@/lib/outbox-client";

/** A locally completed board can still be waiting for the farm's acceptance. */
export const WorkDeliveryNotice = ({ instanceId }: { instanceId?: string }) => {
  const { t } = useLanguage();
  const waiting = useQuery({
    queryKey: ["outbox", "work-delivery"],
    queryFn: async () => {
      const entries = (await phoneOutbox()?.pending()) ?? [];
      return [
        ...new Set(
          entries.flatMap((entry) =>
            entry.kind === "instance_claim" ||
            entry.kind === "instance_complete" ||
            entry.kind === "step_completion"
              ? [entry.body.instanceId]
              : []
          )
        ),
      ];
    },
    networkMode: "always",
    refetchInterval: 15_000,
  });
  const pending = waiting.data?.some((id) => !instanceId || id === instanceId);
  if (!pending) {
    return null;
  }
  return (
    <Notice title={t("work.waitingForFarm")} tone="info">
      <p>{t("work.waitingForFarmHint")}</p>
      <Link className="text-sm underline" to="/outbox">
        {t("outbox.details")}
      </Link>
    </Notice>
  );
};
