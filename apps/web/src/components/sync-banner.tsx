import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { useLanguage } from "@/i18n/language-provider";
import { cachedHerd, rememberHerd } from "@/lib/herd-cache";
import type { OutboxState } from "@/lib/outbox";
import { phoneOutbox } from "@/lib/outbox-client";
import { client, orpc } from "@/utils/orpc";

/** How often the phone tries what it is holding. Sending is cheap when there is nothing to
 *  send: the Outbox reads its own queue and stops. */
const FLUSH_EVERY_MS = 15_000;
/** How often the phone re-reads the herd it works. */
const HERD_EVERY_MS = 10 * 60_000;

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
      const carried: OutboxState = (await outbox?.state()) ?? {
        pending: 0,
        rejected: 0,
        reviewed: 0,
        lastSyncAt: null,
        paused: "none",
      };
      return carried;
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
        const { sent, verdicts } = await outbox.flush();
        // Whenever the farm has taken anything — or sent anything back — the board is out
        // of date: a tile left green over an entry that was refused is the phone telling
        // the person a lie.
        if (sent > 0 || verdicts.length > 0) {
          await queryClient.invalidateQueries({
            queryKey: orpc.instances.key(),
          });
        }
        // The animals of the Pens this person works, kept for the shed where there are no
        // bars: which cow, and whether her milk may go to the tank. Read sparingly — this
        // runs on a battery-limited phone, and a herd does not change by the minute.
        const { at } = await cachedHerd();
        const due = !at || Date.now() - new Date(at).getTime() > HERD_EVERY_MS;
        if (!due) {
          return;
        }
        const herd = await client.animals.list({});
        await rememberHerd(
          herd.map((animal) => ({
            id: animal.id,
            tagNumber: animal.tagNumber,
            state: animal.state,
            penId: animal.penId,
            photoUpdatedAt: animal.photoUpdatedAt
              ? new Date(animal.photoUpdatedAt).toISOString()
              : null,
            milkWithdrawalUntil: animal.milkWithdrawalUntil
              ? new Date(animal.milkWithdrawalUntil).toISOString()
              : null,
          })),
          new Date()
        );
        await queryClient.invalidateQueries({ queryKey: ["herd-cache"] });
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
  if (!held) {
    return null;
  }
  const carrying = held.pending + held.rejected + held.reviewed > 0;
  // The sync age shows even with nothing waiting. A phone that has been out of signal for
  // three hours with an empty queue looks exactly like one that synced a moment ago, and
  // the difference is the whole question in the barn.
  if (!(carrying || held.paused !== "none" || held.lastSyncAt)) {
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
      {held.rejected + held.reviewed > 0 ? (
        <Link className="underline" to="/outbox">
          {t("outbox.rejected", { count: held.rejected + held.reviewed })}
        </Link>
      ) : null}
      <span className="text-muted-foreground text-xs">
        {held.lastSyncAt
          ? t("outbox.synced", {
              ago: formatDate(new Date(held.lastSyncAt), language, "dateTime"),
            })
          : t("outbox.never")}
      </span>
      {waiting ? (
        <Button
          aria-label={t("outbox.retry")}
          onClick={async () => {
            await phoneOutbox()?.resume();
            await queryClient.invalidateQueries({ queryKey: ["outbox"] });
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
