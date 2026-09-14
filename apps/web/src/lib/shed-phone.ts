import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";

import { client } from "@/utils/orpc";

import {
  getActiveUser,
  getAutoLockMinutes,
  getDeviceToken,
  getSwitchToken,
  clearHeldStint,
  heldSwitches,
  isHeldStint,
  isLocked,
  lockThisPhone,
  setSwitchToken,
  subscribeDevice,
  markProved,
  touchHeldSwitches,
  touchActiveUser,
} from "./device";
import { putAwayFor } from "./query-cache";

const LOCK_CHECK_MS = 15_000;
/** Well inside the farm's shortest lock window, so the farm's side of the switch never runs out under someone. */
const KEEP_AWAKE_MS = 2 * 60_000;

/** Tells the farm this phone is locked, when there is signal to tell it; the phone is locked either way. */
export const lockOnTheFarm = async () => {
  try {
    await client.devices.lock();
  } catch {
    // No signal: the farm's side of the switch runs out on its own.
  }
};

/** Locks the phone at once, then puts away what was on its screen under the person who was working, so the next
 *  person sees none of it and the same person finds it again. */
export const lockAndPutAway = async (queryClient: QueryClient) => {
  const leaving = getActiveUser()?.userId;
  lockThisPhone();
  await putAwayFor(queryClient, leaving);
};

const proveAll = async () => {
  for (const [ref, proof] of heldSwitches()) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      const proved = await client.devices.switchUser(proof);
      // oxlint-disable-next-line no-await-in-loop
      await markProved(ref, proved.token);
      if (isHeldStint(ref) && getActiveUser()?.userId === proof.userId) {
        setSwitchToken(proved.token);
        clearHeldStint();
      }
    } catch (error) {
      const refused = (error as { code?: unknown }).code;
      if (refused === "UNAUTHORIZED" || refused === "FORBIDDEN") {
        // oxlint-disable-next-line no-await-in-loop
        await markProved(ref, null);
      }
      // Anything else — no signal, a server that did not answer — keeps it held for the next try.
    }
  }
};

let proving: Promise<void> | null = null;

/**
 * Proves to the farm every PIN entered on this phone with no signal — the person working now, and anyone who worked
 * before them — so the work each of them recorded can go under their name. Called when signal returns and before the
 * Outbox sends; the two share one attempt rather than racing each other.
 */
export const proveHeldSwitches = async (): Promise<void> => {
  if (heldSwitches().length === 0) {
    return;
  }
  touchHeldSwitches();
  proving ??= proveAll();
  try {
    await proving;
  } finally {
    proving = null;
  }
};

/** Whether this browser is a Shed Phone. */
export const useIsShedPhone = (): boolean =>
  useSyncExternalStore(
    subscribeDevice,
    () => Boolean(getDeviceToken()),
    () => false
  );

/** Who is switched in on this Shed Phone, if anyone. */
export const useActiveWorker = () =>
  useSyncExternalStore(subscribeDevice, getActiveUser, () => null);

/**
 * What a Shed Phone does around every screen: counts a tap as activity, locks itself when nobody has touched it for
 * the farm's window and goes back to the PIN screen, keeps the farm's side of the switch alive while someone works,
 * and proves a PIN entered with no signal once signal comes back.
 */
export const useShedPhoneKeeper = () => {
  const isShedPhone = useIsShedPhone();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isShedPhone) {
      return;
    }
    const onActivity = () => touchActiveUser();
    const lockIfIdle = () => {
      // Tells any other tab sending this phone's Outbox that the PINs held here are still on their way.
      touchHeldSwitches();
      if (isLocked(getActiveUser(), getAutoLockMinutes())) {
        const hadToken = Boolean(getSwitchToken());
        void lockAndPutAway(queryClient);
        if (hadToken) {
          void lockOnTheFarm();
        }
        void navigate({ to: "/device" });
      }
    };
    const keepAwake = async () => {
      if (!getSwitchToken()) {
        return;
      }
      try {
        await client.devices.keepAwake();
      } catch {
        // No signal: the phone keeps its own lock, and tries again next time.
      }
    };
    const proveOnceOnline = async () => {
      await proveHeldSwitches();
      await queryClient.invalidateQueries();
    };
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("online", proveOnceOnline);
    const locking = window.setInterval(lockIfIdle, LOCK_CHECK_MS);
    const awake = window.setInterval(keepAwake, KEEP_AWAKE_MS);
    lockIfIdle();
    void proveOnceOnline();
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("online", proveOnceOnline);
      window.clearInterval(locking);
      window.clearInterval(awake);
    };
  }, [isShedPhone, navigate, queryClient]);
};
