import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";

import { client } from "@/utils/orpc";

import {
  getActiveUser,
  getAutoLockMinutes,
  getDeviceToken,
  getSwitchToken,
  holdUnprovedSwitch,
  isLocked,
  lockThisPhone,
  setSwitchToken,
  subscribeDevice,
  takeUnprovedSwitch,
  touchActiveUser,
} from "./device";

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
      if (isLocked(getActiveUser(), getAutoLockMinutes())) {
        const hadToken = Boolean(getSwitchToken());
        lockThisPhone();
        queryClient.clear();
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
      const proof = takeUnprovedSwitch();
      const active = getActiveUser();
      if (
        !(proof && active && proof.userId === active.userId) ||
        getSwitchToken()
      ) {
        return;
      }
      try {
        const proved = await client.devices.switchUser(proof);
        setSwitchToken(proved.token);
        await queryClient.invalidateQueries();
      } catch {
        holdUnprovedSwitch(proof);
      }
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
