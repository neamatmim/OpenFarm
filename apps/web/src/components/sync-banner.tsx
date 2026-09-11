import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { useLanguage } from "@/i18n/language-provider";
import { phoneOutbox } from "@/lib/outbox-client";
import { orpc } from "@/utils/orpc";

/** How often the phone tries what it is holding. Sending is cheap when there is nothing to
 *  send: the Outbox reads its own queue and stops. */
const FLUSH_EVERY_MS = 15_000;

/**
 * What this phone is still holding, on every screen a Staff member works from. A count and
 * an age, because the question in the barn is always the same one: has the farm got this
 * yet, and if not, how long has it not had it?
 */
export const SyncBanner = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();

  const state = useQuery({
    queryKey: ["outbox"],
    queryFn: async () => {
      const outbox = phoneOutbox();
      return (
        (await outbox?.state()) ?? {
          pending: 0,
          rejected: 0,
          lastSyncAt: null,
          paused: "none" as const,
        }
      );
    },
    refetchInterval: FLUSH_EVERY_MS,
  });

  // Try what is waiting whenever the app is open. The Outbox decides whether it can: no
  // signal, another tab sending, or waiting for somebody to sign in are all answers.
  useEffect(() => {
    const tick = async () => {
      const outbox = phoneOutbox();
      if (!outbox) {
        return;
      }
      try {
        const { sent } = await outbox.flush();
        if (sent > 0) {
          await queryClient.invalidateQueries({
            queryKey: orpc.instances.key(),
          });
        }
      } catch {
        // No signal, or the farm is not answering. The queue is on the device; the next
        // tick tries again.
      }
      await queryClient.invalidateQueries({ queryKey: ["outbox"] });
    };
    // `tick` swallows its own trouble, so nothing here can reject and there is nothing to
    // catch: an interval that stopped on the first patch of no signal would be a phone that
    // never syncs again.
    tick();
    const timer = setInterval(tick, FLUSH_EVERY_MS);
    return () => clearInterval(timer);
  }, [queryClient]);

  const held = state.data;
  if (!held || (held.pending === 0 && held.paused === "none")) {
    return null;
  }
  const waiting = held.paused === "signed_out";
  return (
    <output
      aria-live="polite"
      className={`flex items-center gap-2 px-3 py-2 text-sm ${
        waiting ? "bg-amber-900 text-amber-100" : "bg-neutral-800"
      }`}
    >
      {waiting ? <CloudOff size={16} /> : <RefreshCw size={16} />}
      <span className="flex-1">
        {waiting
          ? t("outbox.signedOut")
          : t("outbox.pending", { count: held.pending })}
      </span>
      <span className="text-muted-foreground text-xs">
        {held.lastSyncAt
          ? t("outbox.synced", {
              ago: formatDate(new Date(held.lastSyncAt), language, "dateTime"),
            })
          : t("outbox.never")}
      </span>
      {waiting ? (
        <Button
          onClick={() => {
            phoneOutbox()?.resume();
            void queryClient.invalidateQueries({ queryKey: ["outbox"] });
          }}
          size="sm"
          variant="ghost"
        >
          <RefreshCw size={14} />
        </Button>
      ) : null}
    </output>
  );
};
