import { farmDayOf } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CloudCheck, CloudOff, CloudUpload, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { useLanguage } from "@/i18n/language-provider";
import { getDeviceToken, getSwitchToken } from "@/lib/device";
import {
  cachedHerd,
  herdCacheQuery,
  herdLastTried,
  rememberHerd,
  rememberHerdTried,
} from "@/lib/herd-cache";
import { herdReadIsDue } from "@/lib/herd-refresh";
import type { OutboxState } from "@/lib/outbox";
import { phoneOutbox } from "@/lib/outbox-client";
import { refreshTheScreen } from "@/lib/refresh";
import { client } from "@/utils/orpc";

/** How often the phone tries what it is holding. Sending is cheap when there is nothing to
 *  send: the Outbox reads its own queue and stops. */
const FLUSH_EVERY_MS = 15_000;

/** Waiting longer than this, the pill says since when. */
const LONG_WAIT_MS = 30 * 60_000;

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
 * Sends what this phone is holding while the app is open, and refreshes the herd this person works. Wherever the app
 * is — any signed-in screen, and a Shed Phone's PIN screen, locked on the shelf with work still on it: a phone that
 * found its signal again sends then, not when the next person PINs in.
 */
export const useOutboxSender = () => {
  const queryClient = useQueryClient();
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
        // Whenever the farm has taken anything — or sent anything back — the screen is out
        // of date: a tile left green over an entry that was refused is the phone telling
        // the person a lie, and a dose taken moves the medicine on the shelf too.
        if (sent > 0 || verdicts.length > 0) {
          refreshTheScreen(queryClient);
        }
        // Nobody is switched in on a locked Shed Phone: there is no herd of theirs to read.
        if (getDeviceToken() && !getSwitchToken()) {
          return;
        }
        // The animals of the Pens this person works, kept for the shed where there are no
        // bars: which cow, and whether her milk may go to the tank. Read sparingly — this
        // runs on a battery-limited phone, and a herd does not change by the minute.
        const [{ at }, triedAt] = await Promise.all([
          cachedHerd(),
          herdLastTried(),
        ]);
        if (!herdReadIsDue({ readAt: at, triedAt, now: Date.now() })) {
          return;
        }
        // Written before the read, so a read the farm refuses — a person holding no Role yet — or one that never
        // answers still spaces out the next one.
        await rememberHerdTried(new Date());
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
};

/**
 * What this phone is still holding, on every screen a Staff member works from — a calm pill in the top bar: all
 * sent, a count waiting, or what needs the person (signed out, work sent back). Its title carries when the phone
 * last sent and, separately, when it last refreshed the herd: sending and fresh data are different questions.
 * The sending itself is `useOutboxSender`'s.
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
        oldestWaitingAt: null,
        paused: "none",
      };
      // Asked here, when the phone is read, rather than while the pill is drawn.
      const since = readableDate(carried.oldestWaitingAt);
      return {
        ...carried,
        waitedLong:
          since !== null && Date.now() - since.getTime() > LONG_WAIT_MS,
      };
    },
    refetchInterval: FLUSH_EVERY_MS,
  });

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
  const signBackIn = getDeviceToken() ? "/shed-phone" : "/sign-in";
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
    if (held.pending === 0) {
      return t("outbox.allSent");
    }
    // Work the farm has been without for a while says since when: a phone keeps trying for as long as it takes, and
    // the person deciding whether to walk to where there is signal needs to know how long that has been.
    const since = readableDate(held.oldestWaitingAt);
    return since && held.waitedLong
      ? t("outbox.pendingSince", {
          count: held.pending,
          at: formatDate(since, language, "dateTime"),
        })
      : t("outbox.pending", { count: held.pending });
  })();
  const syncedAt = readableDate(held.lastSyncAt);
  // Today's sending by its time alone: the whole date was cut on a phone's bar before it reached the time.
  const sentToday =
    syncedAt !== null && farmDayOf(syncedAt) === farmDayOf(new Date());
  const sent = syncedAt
    ? t("outbox.synced", {
        ago: formatDate(syncedAt, language, sentToday ? "time" : "dateTime"),
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
        "inline-flex max-w-full min-w-0 items-center gap-2 rounded-xl border px-3 py-1 text-sm lg:rounded-full",
        attention
          ? "border-warning/30 bg-warning-surface text-warning"
          : "bg-muted/60 text-muted-foreground border-transparent"
      )}
      title={[sent, fresh].filter(Boolean).join(" · ")}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {/* On a phone, when it was last sent goes under what is waiting: the bar is the pill's there, and a title is
          read only by a pointer that can hover. */}
      <span className="flex min-w-0 flex-col lg:flex-row lg:items-center lg:gap-2">
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
        <span className="truncate text-xs opacity-80">{sent}</span>
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
          // A thumb's width on a phone, the bar's small icon on a desk.
          className="-mr-2 size-11 rounded-full md:size-7"
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
