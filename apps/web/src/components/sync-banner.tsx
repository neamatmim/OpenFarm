import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CloudCheck, CloudOff, CloudUpload, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { useLanguage } from "@/i18n/language-provider";
import { getDeviceToken } from "@/lib/device";
import { cachedHerd, herdCacheQuery, rememberHerd } from "@/lib/herd-cache";
import type { OutboxState } from "@/lib/outbox";
import { phoneOutbox } from "@/lib/outbox-client";
import { client, orpc } from "@/utils/orpc";

/** How often the phone tries what it is holding. Sending is cheap when there is nothing to
 *  send: the Outbox reads its own queue and stops. */
const FLUSH_EVERY_MS = 15_000;
/** How often the phone re-reads the herd it works. */
const HERD_EVERY_MS = 10 * 60_000;

/** A time this phone kept, as a date — or nothing, for one it cannot read. The pill is a line in the top bar; a stored
 *  time gone wrong says "not yet" rather than taking every page down with it. */
const readableDate = (kept: unknown): Date | null => {
  if (typeof kept !== "string") {
    return null;
  }
  const date = new Date(kept);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * What this phone is still holding, on every screen a Staff member works from — a calm pill in the top bar: all
 * sent, a count waiting, or what needs the person (signed out, work sent back). Its title carries when the phone
 * last sent and, separately, when it last refreshed the herd: sending and fresh data are different questions.
 *
 * It also does the sending: while the app is open it flushes the Outbox and refreshes the herd this person works.
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
        await queryClient.invalidateQueries({
          queryKey: herdCacheQuery.queryKey,
        });
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

  const herdAt = useQuery({
    ...herdCacheQuery,
    select: (herd) => (typeof herd?.at === "string" ? herd.at : null),
  });

  const held = state.data;
  if (!held) {
    return null;
  }
  const waiting = held.paused === "signed_out";
  const sentBack = held.rejected + held.reviewed;
  // A Shed Phone signs its person back in with a PIN; a personal phone signs in. Sending a
  // milker to the wrong one of those, with a morning's work in the queue, is the kind of
  // dead end that ends with the work being re-typed on paper.
  const signBackIn = getDeviceToken() ? "/device" : "/login";
  // Being out of signal is normal on a farm, so the calm state is calm: only something the person must act on —
  // signed out, or work the farm sent back — is drawn as needing attention.
  const hasSentBack = sentBack > 0;
  const attention = waiting || hasSentBack;
  const label = (() => {
    if (waiting) {
      return t("outbox.signedOut");
    }
    if (sentBack > 0) {
      return t("outbox.rejected", { count: sentBack });
    }
    return held.pending > 0
      ? t("outbox.pending", { count: held.pending })
      : t("outbox.allSent");
  })();
  const syncedAt = readableDate(held.lastSyncAt);
  const sent = syncedAt
    ? t("outbox.synced", {
        ago: formatDate(syncedAt, language, "dateTime"),
      })
    : t("outbox.never");
  const herdKeptAt = readableDate(herdAt.data);
  const fresh = herdKeptAt
    ? t("outbox.herdFresh", {
        ago: formatDate(herdKeptAt, language, "dateTime"),
      })
    : null;
  let Icon = CloudCheck;
  if (waiting) {
    Icon = CloudOff;
  } else if (held.pending > 0 || sentBack > 0) {
    Icon = CloudUpload;
  }

  return (
    <output
      aria-live="polite"
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border px-3 py-1 text-sm",
        attention
          ? "border-warning/30 bg-warning-surface text-warning"
          : "bg-muted/60 text-muted-foreground border-transparent"
      )}
      title={[sent, fresh].filter(Boolean).join(" · ")}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {hasSentBack && !waiting ? (
        <Link
          className="truncate font-medium underline-offset-2 hover:underline"
          to="/outbox"
        >
          {label}
        </Link>
      ) : (
        <span className="truncate font-medium">{label}</span>
      )}
      <span className="hidden truncate text-xs opacity-80 lg:inline">
        {sent}
      </span>
      {waiting ? (
        <Link
          className="font-medium underline underline-offset-2"
          to={signBackIn}
        >
          {t("outbox.signIn")}
        </Link>
      ) : null}
      {waiting ? (
        <Button
          aria-label={t("outbox.retry")}
          className="-mr-2 size-7 rounded-full"
          onClick={async () => {
            await phoneOutbox()?.resume();
            await queryClient.invalidateQueries({ queryKey: ["outbox"] });
          }}
          size="icon-sm"
          variant="ghost"
        >
          <RefreshCw />
        </Button>
      ) : null}
    </output>
  );
};
